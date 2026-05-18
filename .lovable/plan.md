
## Goal

Fix the "Uzdevumi un plānotās darbības" panel on the lead detail page so it correctly reflects future-only automation emails, uses the real queued date, follows the requested layout, and lets the user edit template + scheduled time for queue rows.

Scope: `src/routes/lead.$leadId.tsx` only. No dispatcher, cron, allocator, or workflow changes.

## Findings from audit

- View `crm.v_lead_planned_actions` already filters queue rows to `status IN ('queued','sending','blocked')`, and exposes `scheduled_for` directly from `crm.communication_queue.scheduled_for`. We must use that field verbatim — current UI does (good), but layout currently formats it with `fmtDate` (date only) instead of date+time.
- For lead `021af8b6...`:
  - `crm.communications` shows `email_getestimate_1` already sent (`raw_payload.automation_step = "E_mail getestimate 1"`, outbound, 2026‑04‑29).
  - `crm.communication_queue` still has a `queued` row with `template_key='email_getestimate_1'` scheduled 2026‑05‑19.
  - That is why the panel shows an already-sent template. The view does not cross-check sent communications. Dedupe must happen in the frontend (allowed: existing safe data, no DB change).
- Available safe RPCs (already in DB, no new SQL needed):
  - `crm.queue_item_edit(p_id, p_subject, p_body, p_recipient, p_template_key, p_content_html, p_content_text)`
  - `crm.queue_item_reschedule(p_id, p_when timestamptz)`
- `crm.message_templates` (`template_key`, `template_name`, `is_active`, `channel`) joined with `crm.message_template_versions` (`is_published`) gives the dropdown of valid templates. We restrict the dropdown client-side to the 9 allowed automation keys.

## Implementation

### 1. Dedupe already-sent automation emails

In the planned-actions block in `src/routes/lead.$leadId.tsx`:

- Build a `sentTemplateKeys: Set<string>` from `commPayloadsQ` (already loaded) + `timelineQ` data: iterate outbound email rows, normalize `raw_payload.automation_step` and `raw_payload.template_key` with the same `normalizeTemplateKey()` used by the Activities badge (strip `e_mail_` prefix, lowercase, underscores), and add to the set when it matches one of the 9 known keys.
- When mapping `plannedRows`, for `source === 'queue'` skip the row if its `template_key` (from `tplMap`) is already in `sentTemplateKeys`.

### 2. Date logic

- Keep using `r.scheduled_for` straight from the view (no recomputation).
- Render as `dd.MM.yyyy HH:mm` using existing `fmtDateTime` helper (or extend `fmtDate` call to a datetime formatter already used in Activities). Remove the `· kind` suffix.

### 3. Three-column layout

Replace the current `<li>` markup with a 3-column flex row:

- Col 1 (left, `flex-1 min-w-0`):
  - line 1: `templateLabel(template_key)` (human-readable, e.g. "getestimate 1")
  - line 2: subject (muted, truncate)
- Col 2 (right-aligned, fixed-ish width, before status): responsible person. For queue rows hard-code `"SIS"`. For task rows fall back to existing owner field if present.
- Col 3 (right): two stacked lines, right-aligned — `StatusBadge` ("Plānots" for queued) on top, datetime below in muted text.

Whole row becomes a `<button>` (or `<li role="button">`) for queue rows so it opens the edit modal; non-queue rows stay non-clickable.

### 4. Edit modal (queue rows only)

New component `PlannedQueueEditDialog` inside the same file (kept local, no new files needed unless it grows; can extract later). Uses shadcn `Dialog`.

Fields:
- **Template**: shadcn `Select` populated by a new `useCrmView('message_templates', 'select=template_key,template_name,is_active&channel=eq.email&is_active=eq.true', { all: true })` query, then filtered client-side to the 9 allowed keys:
  `email_getestimate_1..4`, `email_transition_to_sketch`, `email_sketch_1..4`.
- **Scheduled at**: shadcn date picker + time `<input type="time">` combined into a single `Date` → ISO string.

Save behavior:
1. If template_key changed → call `crm.queue_item_edit` via RPC (`supabase.schema('crm').rpc('queue_item_edit', { p_id, p_subject: currentSubject, p_body: currentBody ?? '', p_recipient: currentRecipient ?? '', p_template_key: newKey })`). Subject/body/recipient passed unchanged (we don't expose them in this modal yet) — pull from the existing queue row we already fetched.
2. If scheduled_for changed → call `crm.queue_item_reschedule({ p_id, p_when })`.
3. On success: `queueTemplatesQ.refetch()` + `plannedActionsQ.refetch()`, close dialog, toast success. On error: toast error, keep dialog open.

Note on allocator bypass: `queue_item_reschedule` writes `scheduled_for` directly — no allocator gate is invoked from the frontend, which matches the "manual override is intentional" requirement. No backend changes.

### 5. Data fetched

Augment `queueTemplatesQ` selection to include the fields the edit RPC needs:

```
select=id,template_key,subject,body,recipient,scheduled_for,status
```

so the edit modal can submit `queue_item_edit` without re-fetching.

Add a new query for templates dropdown (only enabled when modal opens):

```
useCrmView('message_templates', 'select=template_key,template_name,channel,is_active&is_active=eq.true&channel=eq.email', { all: true })
```

### 6. Out of scope (explicit)

- Task rows and `next_action` rows remain read-only — no modal for them.
- No changes to dispatcher, allocator, cron, workflow generator, or historical Activities rendering.

## Technical details

- Files changed: `src/routes/lead.$leadId.tsx` only.
- RPCs used: `crm.queue_item_edit`, `crm.queue_item_reschedule` (both pre-existing, security definer in DB).
- Views/tables read: `crm.v_lead_planned_actions`, `crm.communication_queue`, `crm.message_templates`, `crm.communications` (already loaded via `commPayloadsQ` and timeline).
- Dedupe key derivation reuses existing `normalizeTemplateKey()` + `TEMPLATE_LABEL_MAP` already in the file.
- New imports: `Dialog*` from `@/components/ui/dialog`, `Select*` from `@/components/ui/select`, `Calendar` + `Popover` (existing shadcn datepicker pattern), `toast` from `sonner`.

## Verification checklist after build

1. For lead `021af8b6...`, the panel no longer lists `email_getestimate_1` (already sent), and still lists `email_getestimate_2..4`, `email_transition_to_sketch`, `email_sketch_1..4`.
2. Each row shows scheduled date+time matching `crm.communication_queue.scheduled_for`.
3. Layout: template+subject left, "SIS" middle-right, "Plānots" + datetime stacked far right.
4. Clicking a queue row opens the edit modal; saving template change or new datetime updates the row (verified by refetch) without sending the email.
5. No console errors; non-queue rows unchanged and not clickable.
