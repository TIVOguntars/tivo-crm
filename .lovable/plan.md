# Lead360 Activity timeline — UX uplift (frontend-only)

Scope: improve `Aktivitātes` panel in `src/routes/lead.$leadId.tsx`. No DB / RPC / workflow changes. No backend query changes.

## 1. Current timeline item shape

Local timeline (`TLItem`) in `lead.$leadId.tsx`:

```text
{ key, kind: "comm" | "note" | "task", ts, raw: Row }
```

- `comm` raw: communications row + optional `rawPayloadById` (Postmark raw_payload with `html_body`, `text_body`, `sent_at`, `to_address`, `current_status`, `automation_step`, `template_key`, `metadata`).
- `note` raw: note row (`content`/`body`, `note_type`, `created_at`, `note_subtype` may carry `pre_task_*`/`task_completion_*` markers).
- `task` raw: completed task row (`task_type`, `status`, `outcome_code`, `metadata.completion_notes`, `completed_at`, `metadata.relation_type`, `metadata.reason`).

`UnifiedTimeline` (additive view) yields a separate normalized row set with `event_type`, `record_source`, `title`, `description`, `metadata`, `actor`.

## 2. Files to create / edit

Create:
- `src/lib/activityStyles.ts` — single source of truth for row colors + icons.
- `src/components/timeline/ActivityDetailDialog.tsx` — unified detail dialog for all three local kinds (comm / note / task). Reuses email reply/forward logic currently inlined.
- `src/components/timeline/TimelineFilters.tsx` — type + date filter UI rendered inside the `Aktivitātes` panel header.
- `src/lib/timelineFilters.ts` — pure helpers: `classifyItem(it) → ActivityKind` and `filterTimeline(items, { type, date })`.

Edit:
- `src/routes/lead.$leadId.tsx`
  - Pull row-style classes from `activityStyles.ts` (remove inline `bg*`/`border-l-*` ternaries for both comm and task branches).
  - Wrap every row (incl. tasks and notes) in a `<button>` opening the new dialog (currently only comm rows are clickable; tasks and notes are inert divs).
  - Replace inline detail `<Dialog>` body with `<ActivityDetailDialog item={openItem} … />`.
  - Render `<TimelineFilters />` next to the `Panel` title; apply `filterTimeline(timeline, …)` before `.map()`.
- `src/components/UnifiedTimeline.tsx` — also consume `activityStyles.ts` so the additive section uses the same palette (consistency); no behavior change.
- `src/components/overview/Panel.tsx` — accept an optional `actions?: ReactNode` slot rendered to the right of title/count (used for filters). If the component already supports children-in-header, reuse; otherwise add the prop.

No edit to `i18nLabels.ts` / `timelineLabels.ts` (already cover statuses).

## 3. Row color config — `src/lib/activityStyles.ts`

```text
ActivityKind =
  | "email_in" | "email_out"
  | "call_in" | "call_out"
  | "sms_in" | "sms_out" | "whatsapp_in" | "whatsapp_out"
  | "note"
  | "task" | "workflow"
  | "automation" | "audit"
  | "error"
  | "other"
```

Mapping (Tailwind tokens; `bg`, `accent` = left border):

| Kind           | bg                                 | accent              | icon         |
| -------------- | ---------------------------------- | ------------------- | ------------ |
| email_in       | bg-emerald-50 / dark emerald/20    | border-l-emerald-500 | Mail        |
| email_out      | bg-blue-50 / dark blue/20          | border-l-blue-500    | Mail        |
| call_in/out    | bg-emerald-50 / bg-blue-50         | matching accent      | Phone       |
| sms_*/whatsapp_* | bg-violet-50 / dark violet/20    | emerald/blue accent  | MessageSquare |
| note           | bg-amber-50 / dark amber/20        | border-l-amber-400   | StickyNote  |
| task           | bg-slate-50 / dark slate/20        | border-l-slate-400   | CheckSquare |
| workflow       | bg-violet-50/40 / dark violet/15   | border-l-violet-500  | Workflow    |
| automation     | bg-muted/40                        | border-l-muted-foreground/40 | Activity |
| audit          | bg-muted/30                        | border-l-muted-foreground/30 | Activity |
| error          | bg-rose-50 / dark rose/20          | border-l-rose-500    | AlertTriangle |
| other          | bg-muted/30                        | border-l-muted-foreground/40 | Activity |

Rules:
- Completed tasks NO LONGER turn green. They keep the `task` slate palette regardless of `status === "completed"`. Status is communicated via the existing `<StatusBadge mapKind="task" />` only.
- Cancelled tasks → `error` palette. Skipped → `note` (amber) palette. Active/in_progress → `task` slate.
- Inbound email keeps green-left accent on blue body (matches goal "incoming emails = green").
- Outbound email → blue body + blue accent.
- Bounced/failed comm (`status` in `{bounced, failed, error}`) → `error` palette regardless of channel.

Classifier `classifyItem(it: TLItem): ActivityKind`:
1. `kind === "note"` → `note`.
2. `kind === "task"`: outcome/status → cancelled→error, skipped→note, else task.
3. `kind === "comm"`: read `channel` + `direction` + `status`.
   - status bounced/failed → `error`.
   - channel `mail` → `email_in|email_out`; `phone`/`call` → `call_*`; `sms` → `sms_*`; `whats` → `whatsapp_*`.
   - else `other`.
4. UnifiedTimeline rows: map `record_source` (`workflow`→workflow, `audit_event`→audit, `automation_*`→automation, `task`→task, `communication`→comm via event_type, `note`→note).

Export: `getActivityStyle(kind) → { bg, accent, Icon, ringTone }`.

## 4. Expandable details — `ActivityDetailDialog`

One dialog for all kinds (replaces current inline `<Dialog>`). Props: `item: TLItem | UnifiedItem | null`, `onOpenChange`, `primaryEmail`, `rawPayloadById`.

Sections rendered conditionally:
- Header: icon + Latvian kind label + subject/title + close. For email keeps `Atbildēt` / `Pārsūtīt`.
- Meta grid (operator-friendly LV labels only): Datums, Kanāls, Virziens, Statuss (`StatusBadge`), Sniedzējs, Saņēmējs (`to_address`), Veidne (`automation_step` or resolved label), Imports (`fmtDate(created_at)`).
- "Iznākums" block (tasks): outcome code via `lv(COMM_STATUS_LV, …)` fallback `humanize`.
- "Piezīmes pirms uzdevuma" — notes authored before the task `completed_at` and linked via `metadata.task_id`/`related_task_id` (search the locally loaded `notes` array; pure frontend filter — no new query).
- "Piezīmes uzdevuma izpildē" — `metadata.completion_notes` and any note whose `note_subtype` starts with `task_completion`.
- "Kopsavilkums" — `metadata.summary` if present.
- "Saturs" — full HTML/text body for comm (existing DOMPurify path), full `content`/`body` for notes.
- Operator-friendly metadata: render only known whitelisted keys (`reason`, `relation_type`, `next_action`, `wait_until`, `summary`) translated via `lv()`. Raw JSON dump goes to a collapsed `<details>Tehniskie dati</details>` block — hidden by default for operators.

Behavior:
- All three row kinds (comm, note, task) become `<button>` opening this dialog. Today notes/tasks render as inert `<div>`s.

## 5. Header filters — `TimelineFilters`

Rendered inside `Panel title="Aktivitātes"` actions slot.

State (frontend-only, lives in `lead.$leadId.tsx`):
```text
const [tlType, setTlType] = useState<TypeFilter>("all");
const [tlDate, setTlDate] = useState<DateFilter>("all");
```

Type filter options (Latvian):
`Visi | E-pasti | Ienākošie | Izejošie | Uzdevumi | Piezīmes | Zvani | SMS | WhatsApp | Process | Automātika`

Date filter options:
`Viss periods | Šodien | Pēdējās 7 dienas | Pēdējās 30 dienas | Šis mēnesis | Iepriekšējais mēnesis`

UI: two small `<Select>`s (shadcn) inline; on narrow screens stack below title.

Filtering (`filterTimeline`):
- Type: maps each filter value to a predicate over `classifyItem` + `direction`. `Ienākošie`/`Izejošie` cut across all comm channels. `Process` matches `kind === "task"` whose `metadata.workflow_*` is set OR UnifiedTimeline `record_source === "workflow"`. `Automātika` matches automation/audit kinds.
- Date: compute boundary using Europe/Riga local day, filter on `it.ts`.

Count shown in `<Panel count>` reflects filtered length; an unfiltered total is shown as `… no N` when filter is active.

Filters apply ONLY to the primary (local) timeline AND the additive `UnifiedTimeline` (passed in as props so both stay in sync). Backend queries unchanged.

## 6. Localization

All new visible strings in LV; no raw `sent / delivered / planned / completed / activity / audit_event / Email` surfaces. Uses existing `lv()`, `COMM_STATUS_LV`, `TASK_STATUS_LV`, `EVENT_TYPE_LV`, `labelRecordSource`, `labelEventType`. Detail dialog field labels in LV: `Kanāls, Virziens, Statuss, Sniedzējs, Datums, Saņēmējs, Veidne, Imports, Tips, Iznākums, Saturs, Kopsavilkums, Tehniskie dati`. Inline `Field label="To"|"Template"|"Automation step"|"Imported at"` strings in the current modal get replaced.

## 7. Risks

- `Panel` may not have an `actions` slot today → minor additive prop change.
- Notes linked to tasks via metadata: linkage may be missing for legacy notes — fallback to "no pre-task notes" empty state; not an error.
- UnifiedTimeline filtering requires the child to expose a callback or accept filter props; will add a `filter` prop and a `getKind` mapper — no data fetch changes.
- Color cohesion: existing branding for inbound (emerald accent on blue body) preserved to match goal #2.
- No DB/RPC mutations; pure presentational refactor.

## 8. BUILD prompt (paste back to execute)

```
BUILD LEAD360 TIMELINE UX UPLIFT.

Frontend only. No DB / RPC / workflow / view changes. No new queries.

1. CREATE src/lib/activityStyles.ts
   - export type ActivityKind and getActivityStyle(kind) → { bg, accent, Icon }
   - palette per plan (completed tasks NOT green; inbound email green accent on blue body; bounced/failed → rose; notes amber; tasks slate; workflow violet; automation/audit muted).

2. CREATE src/lib/timelineFilters.ts
   - export TypeFilter, DateFilter unions, DEFAULTS, OPTIONS (LV labels), classifyItem(item), filterTimeline(items, { type, date }) using Europe/Riga day math.

3. CREATE src/components/timeline/TimelineFilters.tsx
   - Two shadcn <Select>s; controlled via props; LV labels from timelineFilters OPTIONS.

4. CREATE src/components/timeline/ActivityDetailDialog.tsx
   - Lift the inline Dialog body from lead.$leadId.tsx (lines ~1373–1556).
   - Add sections: meta grid (LV labels), Iznākums, Piezīmes pirms uzdevuma, Piezīmes uzdevuma izpildē, Kopsavilkums, Saturs, collapsible "Tehniskie dati" raw JSON.
   - Pre-task notes pulled from props.notes filtered by metadata.task_id/related_task_id and created_at < task.completed_at.
   - Keep DOMPurify + Atbildēt/Pārsūtīt for email.

5. EDIT src/components/overview/Panel.tsx
   - Add optional `actions?: ReactNode` rendered right of title/count if not already supported.

6. EDIT src/routes/lead.$leadId.tsx
   - Replace inline color ternaries (task and comm branches) with getActivityStyle(classifyItem(it)).
   - Make task and note rows clickable <button> → setOpenItem(it).
   - Replace inline detail <Dialog> JSX with <ActivityDetailDialog ... />.
   - Add tlType/tlDate state; pass <TimelineFilters /> into <Panel actions=…>.
   - Apply filterTimeline(timeline, { type: tlType, date: tlDate }) before render; show "N no TOTAL" when filtered.

7. EDIT src/components/UnifiedTimeline.tsx
   - Use getActivityStyle for row palette.
   - Accept optional { type, date } filter props and apply same classifyItem-based filter.
   - Behavior remains additive; onUnavailable preserved.

8. VERIFY
   - Lead profile loads; no green completed tasks; inbound emails green accent; clicking any row (incl. notes/tasks) opens dialog; filters narrow both timelines; all UI strings LV; build passes.

RETURN exact files changed and any UI string that remained intentionally untranslated.
```
