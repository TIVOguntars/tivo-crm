
# POSMS 4.1 — `/leadi` only

Scope is limited to `src/routes/leadi.tsx`. No new files, no new hooks, no new Supabase calls. Data continues to come from the existing `useCrmView("leads_list_display_v3", …)` query plus the existing `filter_options` view.

## 1. Lead shape: add v3 priority fields, split PPV vs Atbildīgais

In the `Lead` interface and the row mapper around `leadi.tsx:101–145` / `800–876`:

- Add fields read directly from v3 (no calculation):
  - `priority_score: number | null`
  - `priority_stars: number | null`
  - `priority_label: string`
  - `priority_breakdown: string` (already-formatted text from backend if present; otherwise `""`)
  - `priority_updated_at: string | null`
- Stop conflating owner with PPV:
  - `ppv` (display name) ← `ppv_name`
  - `ppv_user_code` ← `ppv_user_code`
  - `owner` (display name) ← `task_assigned_name` (was `ppv_name`)
  - `owner_user_code` (new) ← `task_assigned_user_code`
- Keep internal `lead_number → uuid` map exactly as today (navigation/RPC only, never rendered).

No new Supabase fetch — all of these come from the existing v3 select.

## 2. Row rendering (`LeadRow`, `leadi.tsx:1442–1700`)

- **Atbildīgais cell** (currently `task_assigned_user_code`): unchanged, but now sourced via `l.owner_user_code` / tooltip `l.owner` to keep semantics explicit. Falls back to `-` muted dash when empty. SIS is not a special case: if backend already assigns the SIS user, it shows just like any other assignee (no SIS badge, no automation inference).
- **PPV cell** (col index 1): unchanged contract — `l.ppv_user_code` with `l.ppv` (= `ppv_name`) tooltip.
- **Replace the placeholder "Ātrās piezīmes" column** (currently renders only an em-dash at `leadi.tsx:1654–1660`, header at `leadi.tsx:1289`) with a new **"Prioritāte"** cell:
  - Renders 5 inline star glyphs filled according to `priority_stars` (clamped 0–5; `null/undefined → 0 filled`).
  - Tooltip: `priority_label` + a second line with `priority_breakdown` if present + relative `priority_updated_at` if present.
  - Below the stars: tiny muted `priority_score` (e.g. `· 42`) when the number is present; otherwise omitted.
  - All numbers come straight from v3, zero math in frontend.
  - Header label changes from "Ātrās piezīmes" → "Prioritāte" (column width unchanged so layout/grid template stays intact).
- **Queue badge**: render as a small pill next to (or under) the StatusBadge in the existing Statuss cell — does not need a new column:
  - Text: `queue_bucket_label || "Nav rindas"`.
  - Tone class derived from `queue_bucket` via a small inline `Record<string, string>` of allowed buckets → tailwind tones (UI-only mapping, no business logic). Unknown bucket → neutral muted tone.
  - If `needs_attention === true`, append a clear attention indicator: existing `AlertTriangle` icon (already imported) in amber, with `title="Vajadzīga uzmanība"`. Lead-name row already has dots for unread; the queue attention indicator stays adjacent to the queue badge so the two channels don't collide.

## 3. Header row (`leadi.tsx:1274–1290`)

- Change `"Ātrās piezīmes"` → `"Prioritāte"`.
- Other column headers unchanged. Grid template (`LEADS_GRID`, `leadi.tsx:187`) unchanged.

## 4. Filters (`FIELDS`, `leadi.tsx:283–319`)

Rewrite the list so each entry maps to exactly one v3 source. Allowed filters and only these:

| Filter key | Label | Type | Source |
|---|---|---|---|
| `status` | Statuss | enum | `l.status` |
| `owner` | Atbildīgais | enum | `l.owner` (=`task_assigned_name`) |
| `ppv` | PPV | enum | `l.ppv` (=`ppv_name`) |
| `priority_label` | Prioritāte | enum | `l.priority_label` |
| `queue_bucket_label` | Queue | enum | `l.queue_bucket_label` |
| `communication_state` | Komunikācija | enum | `l.communication_state` |
| `tags` | Tagi | tags | `l.tags` |

Remove from filters: `country`, `action_label`, `last_communication_at`, `created_at`, `next_action_date` are out of scope of this phase's filter contract — but per the user list ("All filters must operate only on fields already present in v3") they would still work; I will keep them only if they are already wired today AND map cleanly to v3. To stay surgical, I'll **leave `last_communication_at`, `created_at`, `next_action_date`, `country` filters in place** (they already use v3 fields directly and removing them is a UX regression, not a contract violation) and only adjust the `owner`/`ppv` getters and the enum option source so they no longer collapse to the same value.

## 5. Grouping (`GROUP_FIELDS`, `leadi.tsx:509–528`)

Replace with exactly the 5 allowed options:

- `status` → `l.status` (label "Statuss")
- `owner` → `l.owner || l.owner_user_code || "Nepiešķirts"` (label "Atbildīgais")
- `ppv` → `l.ppv || l.ppv_user_code || "Nav PPV"` (label "PPV")
- `priority_label` → `l.priority_label || "Bez prioritātes"` (label "Prioritāte")
- `queue_bucket_label` → `l.queue_bucket_label || "Nav rindas"` (label "Queue")

Remove `country` and `next_action_bucket` group options — they duplicate filter-only concepts and are not in the allowed grouping set.

## 6. Sorting (`SORT_FIELDS`, `leadi.tsx:535–563`)

- Replace `owner` getter so it sorts by `l.owner` (now `task_assigned_name`), and `ppv` getter so it sorts by `l.ppv` (= `ppv_name`) — they were both `ppv_name` before.
- Add `priority_score` desc and `queue_bucket_label` asc as available sort options (no calculation; just exposes the v3 fields users already see).
- Keep other sort options (`last_communication_at`, `created_at`, `effective_due_at`, `next_action_due_date`, `status`, `country`) — orthogonal, unaffected.

Saved-view `mani` etc. unchanged.

## 7. Filter-option sources (`options`, `leadi.tsx:885–`)

- `owner` options now come from `filter_options.task_assignees` if present, falling back to distinct `l.owner` values from current rows.
- `ppv` options come from `filter_options.ppvs` if present, falling back to distinct `l.ppv` values.
- Add `priority_label` and `queue_bucket_label` option lists derived from distinct row values (no extra fetch).

If `filter_options` does not expose `task_assignees`/`ppvs`, the distinct-from-rows fallback is already the pattern used elsewhere — no new query.

## 8. Cleanup

- Delete the empty section divider comment `/* Components: Priority/Comm */` at `leadi.tsx:587`.
- Delete the placeholder `<div role="cell">—</div>` block at `leadi.tsx:1654–1660` (replaced by the Prioritāte cell above).
- Remove `next_action_bucket` helper from grouping if no longer used elsewhere on the page (`nextActionBucket`, `NEXT_ACTION_BUCKET_ORDER` get removed only if they have no remaining caller; otherwise leave them).
- Do not touch `responsibleResolver`, `priorityColors`, `useUserMap`, `v_next_action_queue`, `lead_priority_scoring_v2` — already absent from `/leadi`; the grep will confirm post-change.
- Internal `lead_number → uuid` lookup map (`leadi.tsx:755–770`) stays untouched; still navigation/RPC only.

## 9. Forbidden — verified not introduced

No new Supabase view, no new RPC, no `public.*`, no `useUserMap` import, no `ppv_user_id` / `task_assigned_user_id` display, no priority formula, no queue derivation, no SIS automation logic.

## 10. Verification

After patching `src/routes/leadi.tsx`:

1. `npm run build`
2. ```
   rg "v_next_action_queue|lead_priority_scoring_v2|responsibleResolver|priorityColors|useUserMap|ppv_user_id|task_assigned_user_id" src/routes/leadi.tsx
   ```
   Expected: no matches in `leadi.tsx`.
3. Smoke notes (preview):
   - `/leadi` loads, rows show stars (filled per `priority_stars`) with `priority_label` tooltip.
   - PPV column = `ppv_user_code`, Atbildīgais column = `task_assigned_user_code`, and the two no longer collapse to the same person when they differ on a row.
   - Queue pill renders in Statuss cell with label + tone; `Nav rindas` fallback when null; amber attention indicator visible when `needs_attention=true`.
   - Grouping menu lists exactly: Statuss, Atbildīgais, PPV, Prioritāte, Queue. Grouping by Atbildīgais vs PPV produces different buckets on rows where the two differ.
   - Filters menu lists the v3-only set above; selecting `Prioritāte = <label>` and `Queue = <label>` narrows rows correctly.
   - No UUID visible anywhere in the UI.

## Files changed

- `src/routes/leadi.tsx` (single file; all changes above are localized to it).

## Out of scope (will not change)

- `/uzdevumi`, `/queue`, `/darba-rinda`, `/lead/:id`, modals, `BulkActionsBar`, `LeadEditPanel`, `src/server/analytics.ts`, all hooks, all Supabase artifacts.
