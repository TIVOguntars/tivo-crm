# SIS centrs → Komunikācija: use crm.v_sis_communication_history

## Goal
Make the Komunikācija tab display rows directly from the prepared Supabase view `crm.v_sis_communication_history` (2222 rows), removing all frontend join logic that combined `tasks` + `activities`.

## Required supporting change (blocker)
`useCrmView` calls a server function (`fetchCrmView`) that validates the view name against a hard-coded allow-list `CRM_VIEWS` in `src/server/analytics.ts`. `v_sis_communication_history` is **not** in that list, so the call would fail with "Nezināms skats" before reaching Supabase.

- Add `"v_sis_communication_history"` to the `CRM_VIEWS` array in `src/server/analytics.ts`.
- This is a frontend allow-list addition only — no schema, RPC, view, or migration change. The view already exists in Supabase.

## Changes in `src/routes/sis-darba-rinda.tsx` (KomunikacijaTab only)

### 1. Replace data sources
Remove:
- `useCrmView("activities", ...)`
- `useCrmView("tasks", ...)`
- `taskRows`, `allActivities`, `sisSendEmailTaskIds`
- the `rows = allActivities.filter(... task_id ...)` join

Add:
```text
const history = useCrmView("v_sis_communication_history", "order=activity_at.desc", { all: true });
const rows = (history.data?.rows ?? []) as Row[];
const loading = history.isLoading;
const errorMsg = (history.error as Error | null)?.message || history.data?.error;
```

Keep `useCrmView("communication_events", ...)` ONLY for the detail-drawer event timeline (`eventByLead`). It must NOT decide which rows are shown — the displayed rows come solely from the view.

### 2. Row identity and fields
Map table/drawer to view columns:
- row id → `activity_id` (fallback to index)
- date → `activity_at`
- `lead_id`, `contact_id`, `channel`, `subject`, `summary`
- `latest_event_status`, `latest_event_type`, `provider_message_id`, `outcome_code`
- drawer adds `communication_basis`, `activity_type`

### 3. Status + event badges (per-row, no enrichment join)
Replace the `enrich()` helper (which read from `communication_events`) with direct field reads:
- Status badge value = `latest_event_status` || `outcome_code`
- Event-type badge value = `latest_event_type` || `activity_type`
- Direction: the view has no event metadata direction; show the `Virziens` column as `—` (or drop reliance on event metadata). Layout stays unchanged unless a field is absent.

### 4. Filters (based on view rows)
Rebuild `options` and `filtered` from `rows`:
- channel → `channel`
- event type → `latest_event_type` (fallback `activity_type`)
- status → `latest_event_status` (fallback `outcome_code`)
- lead → `shortId(lead_id)`
- contact → `shortId(contact_id)`
- search → across `subject`, `summary`, `channel`, `activity_type`, `provider_message_id`

### 5. KPI counters (from `rows`, not global events)
Count over `rows`:
- Nosūtīts: `latest_event_type` or `outcome_code` ∈ {sent, send}
- Atvērts: `latest_event_type` ∈ {opened, open}
- Click: `latest_event_type` ∈ {clicked, click}
- Atbildēts: `latest_event_type` ∈ {replied, reply} OR `outcome_code` = replied

### 6. Preserve
- Empty-state text: `"Nav SIS komunikācijas ierakstu."`
- Table column structure and the `CommDetailDrawer` (event timeline still sourced from `communication_events` by `lead_id`).
- `SIS_PROFILE_ID` constant stays (still used by `UzdevumiTab`); it is simply no longer referenced inside `KomunikacijaTab`.

## Explicitly NOT changed
- `UzdevumiTab` and its `v_tasks_queue_ui_v2` usage
- Supabase schema, RPCs, views, workflow/task-generation logic
- Page route and overall layout structure
- No mock data, no frontend business logic, no SIS-membership computation, no tasks/activities join

## Verification
- Run build; fix only TypeScript/UI errors.
- Confirm KomunikacijaTab uses `useCrmView("v_sis_communication_history", ...)`.
- Confirm the tasks+activities join logic is removed.
- Confirm only frontend files changed (`sis-darba-rinda.tsx` + `analytics.ts` allow-list); no backend/schema/RPC/view edits.
