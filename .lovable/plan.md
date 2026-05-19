
# UX Consistency Plan — Task Types, Timeline Labels, Global Localization

Frontend-only. No DB, no RPC, no workflow changes.

---

## 1. Canonical task type source

### Current state

- `src/hooks/useTaskTypes.ts` — already the canonical reader. Loads `crm.task_types` (active rows, sorted by `sort_order`) via `useCrmView("task_types", ...)`. Exposes `rows`, `byKey`, `get()`, `labelOf()`, `isKnown()`.
- `src/components/TaskFormDialog.tsx` (Add Task / Lead360 create) — uses `useTaskTypes()` for the type select and `tt.get(key)` for channel/mode/priority derivation. ✅ canonical.
- `src/components/CompleteTaskModal.tsx` — uses `useTaskTypes()` for the follow-up type select and `taskTypes.labelOf()` for the auto-title. ✅ canonical for the dropdown.
- `src/lib/taskOutcomes.ts` — separate concern (outcome codes per type for the Complete modal). Hardcoded; keep — it is the only place that needs UI-side outcome options, and the server is the source of truth for validity.
- `src/components/CompleteActionModal.tsx` (legacy quick-action modal on `/uzdevumi` etc.) — uses a hardcoded `NEXT_ACTIONS` string list (`Zvanīt`, `SMS`, `WhatsApp`, `E-pasts`, `Pārdošana`, `Piedāvājums`, `Tāmēšana`, `Skice apjomi`, **`Gaidu projektu`**). These are free-text "next action" labels stored on the lead, NOT `task_types`. This is the only divergence.

### Gap

`NEXT_ACTIONS` in `CompleteActionModal` mixes two concepts:
- Real task types (Zvanīt/SMS/WhatsApp/E-pasts/Tāmēšana/Skice apjomi map to `call`, `manual_sms`, `manual_whatsapp`, `manual_email`, `estimate`, `draw_sketches`).
- Pseudo-statuses (Pārdošana, Piedāvājums, **Gaidu projektu**) that have no `task_type` equivalent — they currently just write a free-text `nakama_darbiba` on the lead and a migration schedules a follow-up 7 days out for `Gaidu projektu`.

### Plan

a. **Single canonical source = `useTaskTypes()`** for everything that creates a real `crm.tasks` row (TaskFormDialog ✅, CompleteTaskModal ✅).

b. **Wrap "Gaidu projektu" as deferred follow-up in CompleteTaskModal**:
   - Add a third toggle preset in `CompleteTaskModal`: "Atlikt — gaidu projektu" alongside the existing "Izveidot sekošanas uzdevumu" toggle (or as a radio: `none` / `follow_up` / `wait_for_project`).
   - When `wait_for_project` is chosen: require a date (default = today + 7 days at 09:00 Europe/Riga, matching the existing SQL behavior), preselect `next_task_type = "call"` (canonical, configurable in select), and label the auto-title "Gaidu projektu — atgādinājums".
   - On submit: same `rpc_create_task` call already used for follow-up, with `p_metadata.relation_type = "wait_for_project"` and `p_metadata.reason = "Gaidu projektu"`. No new RPC.

c. **Stop using `NEXT_ACTIONS` for type-bearing choices**:
   - In `CompleteActionModal`, replace the hardcoded list with: known canonical labels sourced from `useTaskTypes().rows` (filtered to user-facing types: `call`, `manual_email`, `manual_sms`, `manual_whatsapp`, `zoom`, `draw_sketches`, `estimate`, `prepare_offer`) + the three pseudo-statuses (`Pārdošana`, `Piedāvājums`, `Gaidu projektu`) kept as a separate "Pārejas" group with distinct visual treatment. The free-text `nakama_darbiba` write path is unchanged.

### Files (frontend only)
- `src/components/CompleteTaskModal.tsx` — add wait-for-project preset.
- `src/components/CompleteActionModal.tsx` — sourced labels from `useTaskTypes()`.
- (No new hook needed — `useTaskTypes` is already the shared layer.)

---

## 2. Timeline translation layer (UnifiedTimeline)

### Current state

`src/components/UnifiedTimeline.tsx` renders raw values from `crm.v_unified_timeline`:
- `event_type` shown verbatim (`capitalize` only) — e.g. `email_plan_generated`, `task_completed`, `create lead`, `audit_event`.
- `record_source` shown verbatim as a pill — e.g. `activity`, `audit_event`, `workflow`, `automation`, `task`, `communication`, `note`.
- Icon picked by substring match on those raw strings.

Result: operators see English/internal jargon.

### Plan — new file `src/lib/timelineLabels.ts`

Pure frontend translation layer. Two maps + two helpers:

```ts
// record_source → operator-facing Latvian
export const RECORD_SOURCE_LV: Record<string, string> = {
  activity:       "Darbība",
  audit_event:    "Audita ieraksts",
  automation:     "Automātika",
  workflow:       "Process",
  task:           "Uzdevums",
  communication:  "Komunikācija",
  note:           "Piezīme",
  milestone:      "Atskaites punkts",
  lead:           "Leads",
};

// event_type → operator-facing Latvian. Keys are matched
// case-insensitively after normalization to snake_case.
export const EVENT_TYPE_LV: Record<string, string> = {
  email_plan_generated:    "Automātiski sagatavots e-pasts",
  email_sent:              "E-pasts nosūtīts",
  email_delivered:         "E-pasts piegādāts",
  email_replied:           "Saņemta atbilde",
  email_bounced:           "E-pasts atgriezts",
  email_opened:            "E-pasts atvērts",
  email_clicked:           "Spiests links",
  sms_sent:                "SMS nosūtīts",
  whatsapp_sent:           "WhatsApp nosūtīts",
  call_completed:          "Zvans pabeigts",
  call_no_answer:          "Zvans — neatbild",
  zoom_completed:          "Tikšanās notika",
  task_created:            "Uzdevums izveidots",
  task_completed:          "Uzdevums pabeigts",
  task_cancelled:          "Uzdevums atcelts",
  task_rescheduled:        "Uzdevums pārcelts",
  workflow_started:        "Process uzsākts",
  workflow_step_completed: "Procesa solis pabeigts",
  workflow_completed:      "Process pabeigts",
  status_changed:          "Statuss mainīts",
  owner_changed:           "Atbildīgais mainīts",
  note_added:              "Pievienota piezīme",
  create_lead:             "Leads izveidots",
  lead_created:            "Leads izveidots",
  lead_imported:           "Leads importēts",
};

export function labelRecordSource(raw: string): string { /* normalize + lookup, fallback = humanize(raw) */ }
export function labelEventType(raw: string): string    { /* normalize + lookup, fallback = humanize(raw) */ }
```

`humanize()` = lowercase → replace `_`/`-` with space → capitalize first letter. Guarantees unknown codes never render snake_case to the operator.

### Wiring

- `src/components/UnifiedTimeline.tsx`:
  - Replace `{it.eventType || it.recordSource || "Notikums"}` with `labelEventType(it.eventType) || labelRecordSource(it.recordSource) || "Notikums"`.
  - Replace the `record_source` pill text with `labelRecordSource(it.recordSource)`.
  - Keep the icon picker as-is (it matches raw codes, which is fine internally).
  - Localize the existing "Vienotajā laika joslā nav ierakstu." / "Ielādē vienoto laika joslu…" (already LV — keep).

No backend change. No view change. Display-only.

### Files
- new: `src/lib/timelineLabels.ts`
- edit: `src/components/UnifiedTimeline.tsx`

---

## 3. Global localization consistency

### Current state — scattered LV labels

| Place | What it labels |
|---|---|
| `src/routes/lead.$leadId.tsx` `QUEUE_STATUS_LV` (l. 946-953) | queue statuses: queued/sending/sent/failed/blocked/cancelled |
| `src/routes/lead.$leadId.tsx` `TEMPLATE_LABEL_MAP` (l. 189) | automation template keys |
| `src/components/WorkflowChainStrip.tsx` `statusLabel` (l. 63) | per-step workflow status |
| `src/components/WorkflowPlanCard.tsx` (l. 96, 109) | inline "completed"/"skipped"/"cancelled" checks (no label, but logic dupes) |
| `src/design/status-system.ts` | lead status STYLE only, no label map (statuses are already LV in DB) |
| `src/routes/komunikacijas.tsx` (l. 35) | column labels (`Piegādāti` etc.) — inline |
| `src/lib/taskOutcomes.ts` | outcome codes → LV (per task type) |
| `src/lib/taskTypes.ts` `legacyTaskTypeLabels` | legacy task type labels for /uzdevumi |

### Plan — `src/lib/i18nLabels.ts`

Single shared module. Pure data + tiny lookup helpers. No new dependency.

```ts
// crm.tasks.status / queue status / communication status
export const TASK_STATUS_LV: Record<string,string> = {
  pending: "Gaida", in_progress: "Notiek", completed: "Pabeigts",
  cancelled: "Atcelts", skipped: "Izlaists", blocked: "Bloķēts",
  failed: "Kļūda", scheduled: "Plānots",
};

export const QUEUE_STATUS_LV: Record<string,string> = {
  queued: "Plānots", sending: "Sūta", sent: "Nosūtīts",
  delivered: "Piegādāts", failed: "Kļūda", blocked: "Bloķēts",
  cancelled: "Atcelts", bounced: "Atgriezts",
};

export const COMM_STATUS_LV: Record<string,string> = {
  created: "Izveidots", queued: "Plānots", sending: "Sūta",
  sent: "Nosūtīts", delivered: "Piegādāts", failed: "Kļūda",
  bounced: "Atgriezts", opened: "Atvērts", clicked: "Spiests",
  replied: "Atbildēts",
};

export const DIRECTION_LV = { inbound: "Ienākošs", outbound: "Izejošs" };
export const CHANNEL_LV   = { email: "E-pasts", sms: "SMS", whatsapp: "WhatsApp", call: "Zvans", zoom: "Zoom" };

export function lv(map: Record<string,string>, raw: string | null | undefined, fallback?: string): string {
  if (!raw) return fallback ?? "";
  return map[raw.toLowerCase().trim()] ?? fallback ?? raw;
}
```

### Migration of scattered labels

- `src/routes/lead.$leadId.tsx`: delete local `QUEUE_STATUS_LV`, import from `@/lib/i18nLabels`.
- `src/components/WorkflowChainStrip.tsx`: replace `statusLabel` derivation with `lv(TASK_STATUS_LV, entry.status)`.
- `src/components/UnifiedTimeline.tsx`: use `lv(COMM_STATUS_LV, outcome)` if `metadata.outcome_code` matches.
- `src/routes/komunikacijas.tsx`: keep column header strings (those are header labels, not status renderings).
- `src/components/ui/StatusBadge.tsx`: optionally accept a `mapKind` prop (`"task" | "queue" | "comm"`) to translate before display; default = passthrough (preserves current behavior for already-LV lead statuses).
- Keep `STATUS_STYLES` in `src/design/status-system.ts` for color tokens — separate from text labels.

### Files
- new: `src/lib/i18nLabels.ts`
- edit: `src/routes/lead.$leadId.tsx` (remove local map, import shared)
- edit: `src/components/WorkflowChainStrip.tsx`
- edit (light): `src/components/UnifiedTimeline.tsx`, optionally `src/components/ui/StatusBadge.tsx`

---

## Risks

1. **`CompleteActionModal` and `nakama_darbiba`** — switching from hardcoded `NEXT_ACTIONS` to a sourced list may break legacy free-text values already in the DB. Mitigation: keep the three pseudo-statuses (Pārdošana, Piedāvājums, Gaidu projektu) as a separate group; still write free text on submit.
2. **UnifiedTimeline unknown codes** — backend may emit new `event_type` values not in `EVENT_TYPE_LV`. Mitigation: `humanize()` fallback ensures we never show raw snake_case.
3. **Double localization** — some `STATUS_STYLES` keys are already LV (`pabeigts`, `atcelts`). If `StatusBadge` adds a translation map it must not double-translate. Mitigation: opt-in `mapKind` prop, default off.
4. **Gaidu projektu date semantics** — existing migration uses `today+7d 09:00 Europe/Riga`. Frontend default must match exactly, but the user can override; the RPC stores whatever ISO we send.
5. **`useTaskTypes` cache** — already cached via React Query. No new RPC calls.

---

## Exact BUILD prompt (to use next)

```
BUILD FRONTEND-ONLY UX CONSISTENCY FIXES.

Strict rules:
- no DB / migrations / RPC / workflow changes
- additive frontend only
- do not break existing TaskFormDialog or CompleteTaskModal behavior

1. CompleteTaskModal "Gaidu projektu" preset
   - File: src/components/CompleteTaskModal.tsx
   - Add a follow-up mode selector with three options:
     none | follow_up | wait_for_project
   - wait_for_project requires a date; default = today + 7 days at 09:00 local.
   - On submit, when wait_for_project: call existing rpc_create_task with
     p_task_type = "call" (configurable in a small select),
     p_title = "Gaidu projektu — atgādinājums",
     p_metadata = { source: "complete_task_modal",
                    parent_task_id, relation_type: "wait_for_project",
                    reason: "Gaidu projektu", owner_label }.
   - Reuse existing follow-up code path (no new RPC).

2. CompleteActionModal canonical labels
   - File: src/components/CompleteActionModal.tsx
   - Remove hardcoded NEXT_ACTIONS array.
   - Build the list from useTaskTypes().rows filtered to user-facing types,
     mapped to label_lv, plus a separate "Pārejas" group with
     ["Pārdošana", "Piedāvājums", "Gaidu projektu"] (free-text statuses).
   - Free-text nakama_darbiba write path unchanged.

3. Timeline translation layer
   - New file: src/lib/timelineLabels.ts
     Export RECORD_SOURCE_LV, EVENT_TYPE_LV,
     labelRecordSource(raw), labelEventType(raw),
     with humanize() fallback for unknown codes.
   - Edit: src/components/UnifiedTimeline.tsx
     Replace raw event_type / record_source text with the helpers.
     Keep icon picker unchanged.

4. Global label module
   - New file: src/lib/i18nLabels.ts
     Export TASK_STATUS_LV, QUEUE_STATUS_LV, COMM_STATUS_LV,
     DIRECTION_LV, CHANNEL_LV, helper lv(map, raw, fallback?).
   - Edit src/routes/lead.$leadId.tsx: delete inline QUEUE_STATUS_LV,
     import from @/lib/i18nLabels; use it everywhere queue status is rendered.
   - Edit src/components/WorkflowChainStrip.tsx: use lv(TASK_STATUS_LV, status).
   - Edit src/components/UnifiedTimeline.tsx: when metadata.outcome_code
     matches a known comm status, render via lv(COMM_STATUS_LV, ...).
   - Do NOT modify STATUS_STYLES; keep style tokens separate from labels.

Verification:
- Add Task and Complete Task both show identical task type lists (sourced from useTaskTypes).
- Complete Task → "Gaidu projektu" creates a follow-up task 7 days out by default.
- UnifiedTimeline never displays raw snake_case codes; unknowns show humanized text.
- Lead360 planned queue, WorkflowChainStrip, UnifiedTimeline all show identical LV status wording.

Return: exact files changed and any code paths still using inline labels that
were intentionally left (e.g. column headers).
```
