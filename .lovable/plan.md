
# Planned actions — backend-first fix (PREVIEW ONLY)

No SQL is executed in this turn. No migration, no data changes, no dispatcher, no cron, no sends.

## 1. Current problem summary

For lead `021af8b6-6669-468a-80ea-687c4560393f` (representative case):

1. **Already-sent template still queued.** `crm.communications` has outbound `E_mail getestimate 1` from 2026-04-29 (imported, no `queue_id`, no `workflow_instance_id`). `crm.generate_email_plan_for_lead` derives "already completed" from `crm.v_lead_workflow_progress.last_completed_template_key`, which only counts communications linked to a workflow instance (via `reconcile_email_send_responses` → `crm.communications.raw_payload.workflow_instance_id`). Imported historical sends are invisible to that view, so the planner re-queued `email_getestimate_1` (row `6f3f388f…`, scheduled 2026-05-19) and it now shows in “Uzdevumi un plānotās darbības”. The current frontend dedupe is a workaround — the real fix must move to Supabase.

2. **Queue cadence does not match `crm.workflow_steps.delay_minutes`.** Workflow `getestimate` cumulative days are `0, 3, 8, 16, 24, 26, 29, 34, 42`. Actual queued rows for instance `a20a19c1` use compressed dates (e.g. `getestimate_2` at +1d instead of +3d, `getestimate_4` at +4d instead of +16d, `sketch_4` at +21d instead of +42d). These rows were generated under a previous cadence / allocator and were never recalculated. They need a one-time correction.

3. **Manual edits are not protected.** `queue_item_reschedule` already stamps `metadata.allocator_locked=true` and `metadata.rescheduled_at`. `queue_item_edit` stamps `metadata.edited_at`. But no current backend job re-derives `scheduled_for`, so there is nothing that would overwrite manual edits today — and nothing that would refuse to overwrite them tomorrow when we add a cadence-correction job. We must make that contract explicit.

4. **Sent rows already disappear from planned actions** — `crm.v_lead_planned_actions` only unions queue rows with `status IN ('queued','sending','blocked')`, and `reconcile_email_send_responses` flips the row to `status='sent'` and inserts into `crm.communications`. This part works as required, provided the dispatcher path is the one that completes the send. Imported historical sends bypass this path (no queue row exists for them).

5. **"All planned automation emails created immediately for a new lead"** — `generate_email_plan_for_lead` already does exactly this: one `INSERT … FROM crm.workflow_steps` loop creates every step's queue row at `started_at + delay_minutes`. Trigger that fires it on lead creation (tag/automation entry) needs to be verified, but the function itself satisfies the rule.

## 2. Proposed backend fix

Target objects (all in `crm` schema):

| Object | Change |
|---|---|
| `generate_email_plan_for_lead` | When computing `v_last_step_order`, also consider historical sends not linked to a workflow instance: lookup by normalized `template_key` / `automation_step` in `crm.communications` for the lead. Skip steps whose template was already sent. Keeps "immediate full plan on new lead" behaviour intact for fresh leads. |
| New fn `crm.recalculate_queue_for_instance(p_instance_id uuid)` | For a given running instance, recompute `scheduled_for = workflow_instances.started_at + workflow_steps.delay_minutes` for every queue row where `status IN ('queued','blocked')` AND `metadata->>'allocator_locked' IS DISTINCT FROM 'true'` AND `metadata->>'edited_at' IS NULL`. Manual edits are preserved. Returns count updated. |
| New fn `crm.cleanup_already_sent_queue(p_lead_id uuid)` | Cancels queue rows (`status='cancelled'`, `blocked_reason='already_sent_historically'`) whose `template_key` matches an outbound `crm.communications` row for the same lead (normalized match on `template_key`, `raw_payload.template_key`, `raw_payload.automation_step`). |
| `v_lead_planned_actions` | No change required — it already filters `queued/sending/blocked`. Once `cleanup_already_sent_queue` flips rows to `cancelled`, they disappear. |
| `queue_item_edit` | Add `metadata.allocator_locked=true` stamp (parity with `queue_item_reschedule`) so any future cadence job will skip edited rows. |
| `dispatch_email_queue_once` | No change. |
| `reconcile_email_send_responses` | No change. |

One-time data correction (separate from migration, run after deploy):

- `SELECT crm.cleanup_already_sent_queue(lead_id) FROM (SELECT DISTINCT lead_id FROM crm.communication_queue WHERE status IN ('queued','blocked')) s;`
- `SELECT crm.recalculate_queue_for_instance(id) FROM crm.workflow_instances WHERE status='running';`

Both are idempotent and skip locked/edited rows.

## 3. Preview SQL (NOT executed)

```sql
-- 3.1 cleanup_already_sent_queue
CREATE OR REPLACE FUNCTION crm.cleanup_already_sent_queue(p_lead_id uuid)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path='crm','public' AS $$
DECLARE v_count int;
BEGIN
  WITH sent_keys AS (
    SELECT DISTINCT lower(regexp_replace(
      COALESCE(raw_payload->>'template_key',
               replace(lower(raw_payload->>'automation_step'),' ','_')),
      '^e_?mail_', '', 'i')) AS k
    FROM crm.communications
    WHERE lead_id = p_lead_id AND direction='outbound'
  ),
  upd AS (
    UPDATE crm.communication_queue q
       SET status='cancelled',
           blocked_reason='already_sent_historically',
           metadata = COALESCE(metadata,'{}'::jsonb)
                   || jsonb_build_object('cancelled_at', now(),
                                         'cancelled_reason','already_sent_historically')
     WHERE q.lead_id = p_lead_id
       AND q.status IN ('queued','blocked')
       AND lower(regexp_replace(q.template_key,'^e_?mail_','','i'))
           IN (SELECT k FROM sent_keys WHERE k IS NOT NULL)
     RETURNING 1)
  SELECT count(*) INTO v_count FROM upd;
  RETURN v_count;
END$$;

-- 3.2 recalculate_queue_for_instance (respects allocator_locked + edited_at)
CREATE OR REPLACE FUNCTION crm.recalculate_queue_for_instance(p_instance_id uuid)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path='crm','public' AS $$
DECLARE v_count int;
BEGIN
  WITH inst AS (
    SELECT wi.started_at, wd.id AS workflow_id
      FROM crm.workflow_instances wi
      JOIN crm.workflow_definitions wd ON wd.workflow_key = wi.workflow_key
     WHERE wi.id = p_instance_id),
  upd AS (
    UPDATE crm.communication_queue q
       SET scheduled_for = inst.started_at + make_interval(mins => ws.delay_minutes),
           metadata = COALESCE(q.metadata,'{}'::jsonb)
                   || jsonb_build_object('cadence_recalculated_at', now())
      FROM inst
      JOIN crm.workflow_steps ws ON ws.workflow_id = inst.workflow_id AND ws.is_active
     WHERE q.workflow_instance_id = p_instance_id
       AND q.status IN ('queued','blocked')
       AND (q.metadata->>'workflow_step_id')::uuid = ws.id
       AND COALESCE(q.metadata->>'allocator_locked','false') <> 'true'
       AND (q.metadata->>'edited_at') IS NULL
     RETURNING 1)
  SELECT count(*) INTO v_count FROM upd;
  RETURN v_count;
END$$;

-- 3.3 generate_email_plan_for_lead — add historical-send dedup
-- Inside the function, after computing v_last_step_order, also:
--   WITH sent_keys AS (... same normalisation as 3.1 ...)
--   SELECT MAX(ws.step_order) INTO v_hist_step_order
--     FROM crm.workflow_steps ws
--     JOIN sent_keys sk ON lower(regexp_replace(ws.template_key,'^e_?mail_','','i')) = sk.k
--    WHERE ws.workflow_id = v_workflow_id AND ws.is_active;
--   v_last_step_order := GREATEST(COALESCE(v_last_step_order,0), COALESCE(v_hist_step_order,0));
-- Then the existing "step_order > v_last_step_order" loop skips already-sent templates.

-- 3.4 queue_item_edit — also mark allocator_locked
-- Add 'allocator_locked', true to the jsonb_strip_nulls/jsonb_build_object block.
```

## 4. Data correction preview (NOT executed)

```sql
-- Preview which rows will be cancelled (no UPDATE)
WITH sent_keys AS (
  SELECT lead_id,
         lower(regexp_replace(
           COALESCE(raw_payload->>'template_key',
                    replace(lower(raw_payload->>'automation_step'),' ','_')),
           '^e_?mail_','','i')) AS k
    FROM crm.communications WHERE direction='outbound')
SELECT q.lead_id, q.id, q.template_key, q.scheduled_for, q.status
  FROM crm.communication_queue q
  JOIN sent_keys s ON s.lead_id = q.lead_id
   AND s.k = lower(regexp_replace(q.template_key,'^e_?mail_','','i'))
 WHERE q.status IN ('queued','blocked');

-- Preview which rows will be rescheduled (diff)
SELECT q.id, q.template_key, q.scheduled_for AS current,
       wi.started_at + make_interval(mins => ws.delay_minutes) AS target
  FROM crm.communication_queue q
  JOIN crm.workflow_instances wi ON wi.id = q.workflow_instance_id
  JOIN crm.workflow_definitions wd ON wd.workflow_key = wi.workflow_key
  JOIN crm.workflow_steps ws ON ws.workflow_id = wd.id
   AND ws.id = (q.metadata->>'workflow_step_id')::uuid
 WHERE q.status IN ('queued','blocked')
   AND COALESCE(q.metadata->>'allocator_locked','false') <> 'true'
   AND (q.metadata->>'edited_at') IS NULL
   AND q.scheduled_for <> wi.started_at + make_interval(mins => ws.delay_minutes)
 ORDER BY q.lead_id, ws.step_order;
```

## 5. Self-check queries (post-deploy)

```sql
-- A. No queued row whose template was already sent for that lead
SELECT count(*) FROM crm.communication_queue q
WHERE q.status IN ('queued','blocked')
  AND EXISTS (
    SELECT 1 FROM crm.communications c
    WHERE c.lead_id=q.lead_id AND c.direction='outbound'
      AND lower(regexp_replace(
            COALESCE(c.raw_payload->>'template_key',
                     replace(lower(c.raw_payload->>'automation_step'),' ','_')),
            '^e_?mail_','','i'))
        = lower(regexp_replace(q.template_key,'^e_?mail_','','i')));
-- expected: 0

-- B. Cadence matches workflow_steps for non-locked, non-edited rows
SELECT count(*) FROM crm.communication_queue q
JOIN crm.workflow_instances wi ON wi.id=q.workflow_instance_id
JOIN crm.workflow_definitions wd ON wd.workflow_key=wi.workflow_key
JOIN crm.workflow_steps ws ON ws.workflow_id=wd.id
 AND ws.id=(q.metadata->>'workflow_step_id')::uuid
WHERE q.status IN ('queued','blocked')
  AND COALESCE(q.metadata->>'allocator_locked','false')<>'true'
  AND (q.metadata->>'edited_at') IS NULL
  AND q.scheduled_for <> wi.started_at + make_interval(mins => ws.delay_minutes);
-- expected: 0

-- C. Manually edited rows untouched
SELECT id, scheduled_for, metadata->>'rescheduled_at', metadata->>'edited_at'
  FROM crm.communication_queue
 WHERE metadata->>'allocator_locked'='true'
    OR metadata->>'edited_at' IS NOT NULL;
-- expected: unchanged before/after
```

## 6. Rollback strategy

- All four function changes are `CREATE OR REPLACE` — rollback = re-apply current `pg_get_functiondef` snapshots captured in this audit (already saved in chat history above).
- Data correction is non-destructive: cancelled rows keep their row + audit metadata (`cancelled_at`, `cancelled_reason='already_sent_historically'`). Rollback = `UPDATE crm.communication_queue SET status='queued', blocked_reason=NULL WHERE metadata->>'cancelled_reason'='already_sent_historically' AND status='cancelled';`.
- Rescheduled rows store previous value in audit via a one-off `INSERT INTO crm.audit_events` inside `recalculate_queue_for_instance` (will add) capturing `old_scheduled_for` and `new_scheduled_for`. Rollback = replay that event log.

## 7. Answers to required return items

- **Migration required?** Yes — one migration: add `cleanup_already_sent_queue`, `recalculate_queue_for_instance`, patch `generate_email_plan_for_lead` and `queue_item_edit`. No table or view changes.
- **Data correction required?** Yes — one-time invocation of the two new functions across leads with running instances. Idempotent, manual edits preserved by contract (`allocator_locked` / `edited_at`).
- **Frontend changes?** None required by this plan. Existing UI already shows queue rows + edit dialog. The current frontend dedupe added previously can be removed once cleanup function is deployed (separate, optional cleanup).

Awaiting approval before drafting the migration.
