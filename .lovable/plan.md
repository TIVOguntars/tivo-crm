## Frontend view consolidation: `v_next_action_queue`

### Files to change (3)

**1. `src/server/analytics.ts`** (lines ~237–240)
- Remove from `CRM_VIEWS` whitelist:
  - `next_action_queue_v2`
  - `next_action_queue_ui_v2`
  - `next_action_queue_display_v2`
  - `next_action_queue_filter_ui_v2`
- Add: `v_next_action_queue`

**2. `src/components/ReachabilityBreakdown.tsx`** (line ~73)
- `useCrmView("next_action_queue_display_v2", …)` → `useCrmView("v_next_action_queue", …)`

**3. `src/components/UnreachableBreakdown.tsx`** (line ~69)
- Same replacement.

### Out of scope
DB schema, RLS, public schema, queue/task logic, migrations, other files.

### Verification
- `rg "next_action_queue_(v2|ui_v2|display_v2|filter_ui_v2)" src/` → 0 matches
- `/leadi` loads without errors
- ReachabilityBreakdown + UnreachableBreakdown render
- No new console/runtime errors
- `v_next_action_queue` row count = 131 (already confirmed server-side)
