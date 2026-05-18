## A. Atbildīgais — findings

1. `TaskFormDialog` šobrīd sūta `p_assigned_user_id: null` un `p_required_role: null`. `crm.rpc_create_task` raksta `crm.tasks(assigned_user_id, required_role, metadata)`.
2. User/owner lookup:
   - `crm.profiles` eksistē (`id`, `full_name`), bet pašlaik satur **tikai 1 ierakstu** (`guntars.tiltins@gmail.com`).
   - `crm.action_owner_options` view **neeksistē**.
   - `auth.users` no frontend nav pieejams.
   - Vienīgais reālais "owner" avots šobrīd ir legacy `public.leads.atbildigais` (free text) un `ppv_*` lauki.
3. `crm.v_tasks_queue_ui.action_owner_label` ņem **tikai** `public.leads.atbildigais` — `crm.tasks.assigned_user_id` netiek lasīts vispār. Tāpēc jebkurš `p_assigned_user_id` taskam nebūtu redzams /uzdevumi.
4. Drošākais MVP (bez DB izmaiņām):
   - Lead 360 dialogā prefill `metadata.owner_label = lead.atbildigais` (informatīvi).
   - Neieviest user picker — profiles ir tukšs, izvēles vērtība būtu maldinoša.
   - Pilnvērtīgs assigned_user_id picker prasa: (a) populētu `crm.profiles`, (b) `v_tasks_queue_ui` jāpārveido lai `action_owner_label` izmantotu `COALESCE(profiles.full_name via tasks.assigned_user_id, leads.atbildigais)`. Tas ir atsevišķs DB ticket.

## B. Completed task Lead 360 Aktivitātēs — findings

1. `crm.rpc_complete_task`:
   - `p_create_activity DEFAULT true` — frontend `CompleteActionModal` to nepārraksta.
   - Pie `p_create_activity=true` **ieraksta `crm.activities`** ar `task_id`, `activity_type`, `performed_by_user_id`, `summary`, `outcome_code`.
   - Atjauno `crm.tasks.status='completed'`, `completed_at`, `outcome_code`.
2. `crm.get_lead_360_profile` atgriež `lead, people, companies, objects, tasks, notes, next_actions, communications`. **`activities` netiek atgriezts vispār.**
3. `lead.$leadId.tsx` Aktivitātes timeline (`useMemo` line 469) merge tikai `communications + notes`. `tasks` masīvs gan atnāk, bet timeline to neizmanto.

**Root cause:** RPC korekti raksta `crm.activities`, bet Lead 360 to nelasa. Frontend timeline arī ignorē `tasks`-completed.

## Safest MVP — frontend only

Izmantot jau pieejamo `tasks` masīvu no `get_lead_360_profile` (nav nepieciešama DB izmaiņa). Filtrēt `status IN ('completed','cancelled','skipped')` un merge timeline kā `kind: "task"` ar `ts = completed_at ?? updated_at`. Render block: ikonu pēc `task_type`, `title`, status badge, `outcome_code`, `metadata.completion_notes`.

A daļa: tajā pat patch'ā prefill `TaskFormDialog` ar lead `atbildigais` saglabājot `metadata.owner_label`. Bez user picker.

## Required files

- `src/routes/lead.$leadId.tsx` — paplašināt `TLItem` ar `kind: "task"`, papildināt `timeline` useMemo, papildināt render switch Aktivitātes panelī.
- `src/components/TaskFormDialog.tsx` — pieņemt opcionālu `defaultOwnerLabel` prop un iekļaut `metadata.owner_label`.
- (Neviena DB izmaiņa.)

## Build order

1. Lead 360 timeline ietver completed/cancelled/skipped tasks no esošā `tasks` payload.
2. Render block taskiem (ikona + status + outcome + notes).
3. `TaskFormDialog` saņem `defaultOwnerLabel`, raksta `metadata.owner_label`.
4. Verify: izpildīt task no Lead 360 → parādās Aktivitātēs bez page reload (jau invalidējam `["crm"]`).

## Deferred (separate ticket, requires DB)

- `crm.profiles` populēt no auth.users.
- `crm.v_tasks_queue_ui` papildināt `action_owner_label` ar `profiles.full_name` lookup pa `tasks.assigned_user_id`.
- Pievienot `crm.action_owner_options` view.
- Tikai pēc tam pievienot `TaskFormDialog` assigned_user_id picker.
- Opcionāli: paplašināt `get_lead_360_profile` ar `activities` masīvu, lai nākotnē Lead 360 rādītu arī activities, kas nav saistīti ar tasks.

## Exact next Build prompt

```
Build Lead 360 completed-task visibility + task owner default. Frontend only.

Do not change DB. Do not change RPC. Do not add user picker.

1. src/routes/lead.$leadId.tsx
   - Read `tasks` from get_lead_360_profile (already in profile payload).
   - Extend TLItem with kind: "task".
   - In timeline useMemo, append tasks where status in ('completed','cancelled','skipped'),
     using ts = completed_at ?? updated_at ?? created_at.
   - In Aktivitātes panelis render, add a render branch for kind="task":
     show task_type icon, title, StatusBadge for status, outcome_code if present,
     metadata.completion_notes if present, performed_by_user_id ignored.
   - Keep existing comm/note rendering untouched.

2. src/components/TaskFormDialog.tsx
   - Accept new optional prop `defaultOwnerLabel?: string`.
   - When creating, include `owner_label: defaultOwnerLabel` inside p_metadata
     (keep existing source: "manual_ui").

3. src/routes/lead.$leadId.tsx
   - Pass lead.atbildigais as defaultOwnerLabel into <TaskFormDialog>.

4. src/routes/uzdevumi.tsx
   - No change (action_owner_label still from leads.atbildigais).

Verify:
- Complete a task from Lead 360 → it appears in Aktivitātes within 1 refetch.
- Creating a new task includes metadata.owner_label.
- Build passes.

Return:
- changed files
- build result
- screenshot/visual confirmation that completed task is in Aktivitātes feed
```
