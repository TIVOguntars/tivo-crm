# Lead Email Workflow Automation — Migration Plan (v5 execution)

Pre-execution checks confirmed by user:
- `RESEND_API_KEY` not yet present → migration creates objects only; dispatcher will not be invoked.
- `net._http_response` schema confirmed (`id, status_code, content_type, headers, content, timed_out, error_msg, created`) → reconciler maps to these columns.
- `crm.email_send_state` does not exist → created by migration.
- No `pg_cron` jobs scheduled in this migration.

## Scope

Single timestamped migration under `supabase/migrations/` containing all DDL + idempotent seed. No data backfill. No cron. No `RESEND_API_KEY` dependency at install time (dispatcher self-blocks the row at runtime if missing).

## Database objects created

### Tables
- `crm.email_send_state` — singleton (id=1) holding `last_sent_at`, `current_day`, `sent_count_today`, `daily_limit=80`, `min_interval_seconds=120`, `send_window_start='08:00'`, `send_window_end='18:00'`, `timezone='Europe/Riga'`, `resend_endpoint`, `from_address`. Seeded with one row.

### Views
- `crm.v_communication_queue_state` — wraps `communication_queue` and adds `ui_state` (`sent | sending | failed | cancelled | blocked | awaiting_approval | scheduled | ready`). Non-destructive; underlying status values untouched.
- `crm.v_lead_planned_actions` — UNION of `lead_next_actions` (status pending/in_progress), `communication_queue` (status queued/sending/blocked), `tasks` (filter `completed_at IS NULL` — no assumption on `tasks.status` vocabulary).

### Functions (all `SECURITY DEFINER`, `search_path=crm,public[,extensions]`)
- `crm.lead_email_recipient(uuid)` — COALESCE of `raw_data->>'email_normalized'`, `email_raw`, `email`.
- `crm.lead_has_tag(uuid,text)` — slug presence check.
- `crm.email_workflow_key_for_lead(uuid)` → `'getestimate' | 'sketch' | NULL`.
- `crm.get_lead_hot_removed_at(uuid)` — reads `crm.audit_events` for `lead_tag_removed`/`tag_removed` with `metadata->>'tag_slug'='hot'`; optional fallback to `crm.lead_tag_events` if it exists later (uses `to_regclass`, no migration required now).
- `crm.get_published_template(text)` → `(version_id, subject, content_html, content_text)` from latest `is_published=true` version.
- `crm.generate_email_plan_for_lead(uuid, text)` — main planner. Skips if `hot` tag present, no workflow key, or active instance already exists. Resolves `started_at = GREATEST(lead.created_at, hot_removed_at)`. Inserts `workflow_instances`, then per step inserts `lead_next_actions` (`source='email_workflow'`) + `communication_queue` (`requires_approval=false`, status `queued` or `blocked` with `blocked_reason='no_published_template_version'|'missing_email'`). Writes `email_plan_generated` audit event with warnings.
- `crm.pause_email_workflow_for_lead(uuid)` — sets active instances `paused`, blocks queued/sending rows with `blocked_reason='hot_tag'`, cancels pending workflow next-actions, audit event.
- `crm.resume_email_workflow_for_lead(uuid)` — calls planner with reason `hot_removed`; tags previous paused instance with `superseded_by` in metadata.
- `crm.tg_lead_tags_email_workflow()` + trigger `lead_tags_email_workflow` on `crm.lead_tags` (AFTER INSERT/DELETE). Hot insert → pause; hot delete → resume; getestimate/sketch insert → generate plan.
- `crm.generate_email_plans_batch(int)` — manual batch helper; iterates leads with getestimate/sketch tag, no hot, no active instance. **Created but not scheduled.**
- `crm.dispatch_email_queue_once()` — picks one `queued` email row eligible by window/rate-limit, reads `RESEND_API_KEY` from `vault.decrypted_secrets`. If missing → marks the row `blocked` with `blocked_reason='missing_resend_api_key'` and returns 0. Otherwise calls `net.http_post`, sets row to `sending`, stores `pg_net_request_id` + `dispatched_at` in metadata, increments `attempt_count`, updates `email_send_state`. Does **not** insert into `communications`, does **not** complete next-actions or workflow.
- `crm.reconcile_email_send_responses(int)` — reads `net._http_response` by `id`. On 2xx: insert `crm.communications` (sent), update queue→`sent`, complete matching `lead_next_actions`, advance `workflow_instances` (mark `completed` when no remaining queued/sending/blocked rows). On non-2xx: increment attempt and either retry (`status='queued'`) or mark `failed` when `attempt_count >= max_attempts`. Audit events `email_sent | email_failed_retry | email_failed_terminal`. Skips rows whose pg_net response hasn't landed yet.
- UI write RPCs: `crm.queue_item_cancel`, `crm.queue_item_reschedule`, `crm.queue_item_edit`, `crm.queue_item_approve`, `crm.workflow_step_set_delay`. All restricted to safe statuses; edits stamp `metadata.edited_at/edited_by`.

### Workflow steps seed
Idempotent `UPDATE`-then-`INSERT` (no ON CONFLICT — schema unique constraint not assumed) for:
- `getestimate` workflow `e72ab303-9d0c-4d03-8032-1589383cbec5`: 9 steps with confirmed `delay_minutes` (0, 4320, 11520, 23040, 34560, 37440, 41760, 48960, 60480).
- `sketch` workflow `67366140-d847-4855-a3a5-53e4265e78ca`: 4 steps (2880, 4320, 11520, 23040).
- `step_type='email'`, `responsible_type='system'`, `is_active=true`.

## Things explicitly NOT done in this migration
- No `pg_cron` schedule for dispatcher / reconciler / batch.
- No backfill of existing leads (will be a separate manual step).
- No insert into `crm.message_templates` or `message_template_versions`.
- No destructive remap of existing `crm.communication_queue.status` values.
- No RLS changes.
- No edits to existing functions (`start_lead_workflow_if_needed`, `start_workflows_batch`, `queue_communication`, `validate_communication_send` are preserved).

## Safety checks built into the migration
- All planner inserts gated by "no active instance for this lead+workflow_key".
- `requires_approval=false` but the queue row is still skipped if `recipient` empty or template missing — surfaced via `blocked_reason`.
- Dispatcher uses `FOR UPDATE SKIP LOCKED` and respects window + 120s + 80/day before sending.
- Reconciler is the **only** place that creates `crm.communications` rows.
- `net._http_response` lookup skips rows still pending → safe to call repeatedly.
- Optional `lead_tag_events` table referenced via `to_regclass` so absence is harmless.

## Verification (post-migration, before scheduling cron)
Run on the prod DB (substitute `<LEAD_ID>`):

```sql
-- 1. Generate plan for one lead
SELECT crm.generate_email_plan_for_lead('<LEAD_ID>'::uuid, 'manual_test');

-- 2. Inspect queue + UI state
SELECT id, ui_state, scheduled_for, template_key, recipient, subject, blocked_reason
FROM crm.v_communication_queue_state
WHERE lead_id = '<LEAD_ID>'::uuid
ORDER BY scheduled_for;

-- 3. Lead 360 panel
SELECT * FROM crm.v_lead_planned_actions WHERE lead_id = '<LEAD_ID>'::uuid;

-- 4. (Only after RESEND_API_KEY is added) one-shot dispatch + reconcile
SELECT crm.dispatch_email_queue_once();
-- wait a few seconds
SELECT crm.reconcile_email_send_responses(50);

-- 5. Hot pause/resume
INSERT INTO crm.lead_tags(lead_id, tag_id)
SELECT '<LEAD_ID>'::uuid, id FROM crm.tags WHERE slug='hot';
DELETE FROM crm.lead_tags
USING crm.tags
WHERE lead_tags.lead_id='<LEAD_ID>'::uuid
  AND lead_tags.tag_id=tags.id AND tags.slug='hot';
```

## After this migration is applied
1. Add `RESEND_API_KEY` to vault (we will request it via the secrets tool).
2. Run the manual test SQL above against one real lead.
3. Once verified, schedule pg_cron jobs (separate migration):
   - `crm-email-dispatch` — every minute → `crm.dispatch_email_queue_once()`
   - `crm-email-reconcile` — every minute → `crm.reconcile_email_send_responses(200)`
   - `crm-email-plan-batch` — every 5 minutes → `crm.generate_email_plans_batch(200)` (only after backfill decision)

## Frontend (no changes in this migration)
Lead 360 "Uzdevumi un plānotās darbības" panel and queue management UI will read `crm.v_lead_planned_actions` and `crm.v_communication_queue_state` and call the `queue_item_*` RPCs in a follow-up frontend task — out of scope for this DB migration.
