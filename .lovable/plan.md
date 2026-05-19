# Phase 2b — Workflow chains, task_relations, dependent tasks, dynamic scheduling

Additive plan only. No code changes in this step.

## A. Recommended architecture

Keep `crm.tasks` as the single canonical entity. Add three thin layers around it:

1. **Workflow templates** as data rows in `crm.settings` (`setting_group='workflow'`). No new table.
2. **task_relations** as the structural link between an anchor task and its dependents. One row per directed edge. Carries scheduling offset + cancel-with-anchor flag in `metadata`.
3. **A single SQL resolver function** (`crm.rpc_recompute_dependent_tasks(p_anchor_task_id)`) called from the existing lifecycle RPCs (`rpc_complete_task`, `rpc_reschedule_task`, `rpc_cancel_task`) at the END of their existing body. No new triggers. No new cron. No loop risk because resolver only touches tasks where the current task is the `from_id` anchor, and never re-enters anchors.

Approval, fan-out, and dependent creation are all expressed through `task_relations` rows + per-row `metadata`. No new tables for approvals or workflow runtime in 2b.

## B. DB / settings model

### `crm.settings` rows (new, additive)

- `workflow.task_type_defaults` →
  ```
  { "draw_sketches": { "default_owner_code": "EG", "default_duration_days": 7,
                       "requires_server_folder": true, "visible_in_form": true },
    "estimate":      { "default_owner_code": null, "default_duration_days": 3,
                       "visible_in_form": true },
    "prepare_offer": { "default_owner_code": null, "default_duration_days": 2,
                       "visible_in_form": true } }
  ```
- `workflow.templates` →
  ```
  { "object_preparation_v1": {
      "label_lv": "Objekta sagatavošana",
      "requires_server_folder": true,
      "steps": [
        { "step": 1, "task_type": "draw_sketches",  "offset_days_from_start": 0,
          "owner_code": "EG" },
        { "step": 2, "task_type": "estimate",
          "anchor_step": 1, "anchor_event": "completed_at", "offset_days": 3 },
        { "step": 3, "task_type": "prepare_offer",
          "anchor_step": 2, "anchor_event": "completed_at", "offset_days": 2 }
      ] } }
  ```

No new "workflows" table — instances live as the actual `crm.tasks` rows tied by `task_relations`, sharing one `workflow_instance_id` (column already exists on `crm.tasks`).

## C. Exact relation metadata model

`crm.task_relations` row shape:
- `from_kind = 'task'`, `from_id = anchor task id`
- `to_kind   = 'task'`, `to_id   = dependent task id`
- `relation_type` (additive enum-of-text, no DB enum change):
  - `sequence_next` — dependent runs after anchor completes
  - `schedule_anchor_after` — dependent scheduled relative to anchor's `due_at`/`completed_at`, AFTER it
  - `schedule_anchor_before` — dependent scheduled BEFORE anchor (e.g. confirmation email before zoom)
  - `related` — informational link only, no scheduling effect
  - `follow_up_of` — manual follow-up created from another task
- `metadata`:
  ```
  { "anchor_event": "completed_at" | "due_at" | "sent_at",
    "offset_minutes": 4320,
    "dynamic_recalc": true,
    "cancel_with_anchor": true,
    "requires_approval": true,
    "approver_source": "anchor_task_owner",
    "workflow_template_key": "object_preparation_v1",
    "workflow_step": 2 }
  ```

This matches the `RelativeTo` shape already in `src/lib/taskTypes.ts`, so the existing dialog metadata maps 1:1.

## D. Recommended first workflow implementation

For "Zīmēt skices → Tāmēšana → Piedāvājuma sagatavošana" use **Option A**: create only the first task immediately, create the next when the previous completes.

Why A over B/C:
- Owner of step 2/3 is often unknown at creation time → avoids placeholder assignments and avoids cancelling stale future tasks if the deal pivots.
- Audit stays linear and easy to read.
- Dynamic recalculation reduces to "compute one due_at from one anchor" instead of cascading recomputes across 3 future tasks.
- Cancel semantics are trivial: cancelling step 1 simply prevents step 2 from being spawned; no fan-out of cancellations needed for MVP.
- Still allows full template visibility in UI (show the chain as planned, but only step 1 exists as a real task).

Option C (let the user choose) is deferred — adds UX complexity with no business value yet.

## E. DB migration preview (no execution this step)

Migration 1 — `task_types` seed additions:
- `draw_sketches` (channel `human`, mode `human`, completion_rule `human_complete`, `requires_body=false`, icon `pencil-ruler`)
- `estimate` (same shape, icon `calculator`)
- `prepare_offer` (same shape, icon `file-text`)
- `is_active=true`, `sort_order` after existing rows.
- `metadata_schema` for `draw_sketches` requires `server_folder_url` (string, URL).

Migration 2 — `crm.settings` inserts for `workflow.task_type_defaults` and `workflow.templates` (see B).

Migration 3 — new `SECURITY DEFINER` function `crm.rpc_recompute_dependent_tasks(p_anchor_task_id uuid)`:
- For every `task_relations` row where `from_id = p_anchor_task_id` AND `relation_type IN ('sequence_next','schedule_anchor_after','schedule_anchor_before')` AND `metadata->>'dynamic_recalc' = 'true'`:
  - If anchor `status='cancelled'` AND `metadata->>'cancel_with_anchor' = 'true'` → set dependent `status='cancelled'`, write audit event.
  - Else recompute `due_at = anchor.<anchor_event> + (offset_minutes * interval '1 minute')`, update only if changed.
- Single statement per dependent; no recursion (resolver does NOT re-call itself on dependents — dependents recompute only when THEIR own anchor changes).

Migration 4 — extend existing lifecycle RPCs (`rpc_complete_task`, `rpc_reschedule_task`, `rpc_cancel_task`) with a tail call to `rpc_recompute_dependent_tasks(p_task_id)`. Additive; no signature change.

Migration 5 — new RPC `crm.rpc_spawn_next_workflow_task(p_anchor_task_id uuid)` invoked from `rpc_complete_task` when the completed task carries `metadata->'workflow_template_key'`. Looks up the next step in `workflow.templates`, inserts the dependent task, writes the `task_relations` row, copies `workflow_instance_id`.

No destructive changes. No column drops. No FK changes.

Note on auth FK: this depends on the existing `.lovable/plan.md` fix to `crm.create_audit_event` being applied first; otherwise dependent task creation will hit the same `audit_events_actor_user_id_fkey` issue.

## F. Frontend plan (preview only, no edits this step)

- `src/lib/taskTypes.ts` — add `draw_sketches`, `estimate`, `prepare_offer` to `TASK_TYPE_KEYS`; add Zod schemas (`draw_sketches` requires `server_folder_url` URL).
- `src/hooks/useTaskTypes.ts` — no change; reads `crm.task_types` already.
- `src/hooks/useWorkflowSettings.ts` (new) — reads `workflow.task_type_defaults` and `workflow.templates` from `crm.settings` via existing `useCrmView`.
- `src/components/TaskFormDialog.tsx`:
  - When task_type is `draw_sketches`, render required `server_folder_url` field and a "Sākt darbplūsmu: Objekta sagatavošana" checkbox (default on). Persist into `metadata.workflow_template_key` + `metadata.server_folder_url`.
  - Apply `workflow.task_type_defaults` for default owner / default due offset.
- `src/components/TaskActionsMenu.tsx` — no behavior change in UI; spawning is handled server-side inside `rpc_complete_task` tail. UI just invalidates queries (already does).
- `src/routes/lead.$leadId.tsx` — render a small "Darbplūsma" strip above the task list showing template steps (planned / in progress / done / cancelled) derived from `task_relations` + `workflow_instance_id`.
- `src/routes/uzdevumi.tsx` — no change in 2b.1.

## G. Risks

- **Loop risk in recompute**: avoided by recomputing only direct dependents and never recursing.
- **Stale dependents when anchor reschedules past dependent**: handled by always overwriting `due_at` when `dynamic_recalc=true`; user manual edits should set `dynamic_recalc=false` on that relation row (UI for that is out of scope for 2b.1).
- **Owner missing for next step**: spawn step with `assigned_user_id=NULL`; lead profile already surfaces unassigned tasks.
- **Audit FK violation**: requires the pre-existing `create_audit_event` guard from `.lovable/plan.md`. Block 2b.1 on that fix.
- **Template drift**: storing templates in `crm.settings` rather than a typed table means no FK validation against `task_types`. Mitigation: validation inside `rpc_spawn_next_workflow_task` returns a clear error if a step's `task_type` isn't an active row in `crm.task_types`.
- **Fan-out timing collisions** (Phase 2b.3): multiple dependents spawned from one anchor — handled by inserting all rows in one transaction inside the spawn RPC.
- **Approval engine not built**: `requires_approval=true` is stored as metadata only; nothing enforces it yet. Document clearly so reviewers don't assume tasks are gated.

## H. Phased rollout

**Phase 2b.1 — Foundations (smallest safe step)**
- Seed 3 new task_types.
- Seed `workflow.task_type_defaults` and `workflow.templates` rows.
- Add `crm.rpc_recompute_dependent_tasks` + wire tail calls in lifecycle RPCs.
- No frontend changes yet. No spawn RPC yet.
- Manual SQL test: insert two tasks, link with `schedule_anchor_after`, reschedule anchor, confirm dependent due_at moves.

**Phase 2b.2 — Spawn + first workflow UI**
- Add `crm.rpc_spawn_next_workflow_task` and invoke from `rpc_complete_task`.
- Frontend: `useWorkflowSettings`, TaskFormDialog server_folder_url + workflow toggle, lead profile workflow strip.
- Manual approval metadata stored but not enforced.

**Phase 2b.3 — Fan-out + approval surfacing**
- Allow templates to declare multiple dependents per step (array).
- Surface `requires_approval` as a visible badge + a "Apstiprināt" action on the dependent task (action just flips a metadata flag; no engine).
- Add UI to toggle `dynamic_recalc` per relation.

---

## Exact next Build prompt (Phase 2b.1 only)

```
Build Phase 2b.1: workflow foundations. DB-only. No frontend changes.

Preconditions:
- The crm.create_audit_event actor-resolution fix from .lovable/plan.md
  must already be applied. If not, apply it first in the SAME migration set.

Scope:

1. Seed 3 new rows into crm.task_types (additive, is_active=true):
   - draw_sketches (channel='human', mode='human', completion_rule='human_complete',
     requires_body=false, requires_subject=false, requires_meeting_url=false,
     requires_communication_proof=false, default_priority='normal',
     icon_key='pencil-ruler', sort_order after existing rows,
     metadata_schema requires server_folder_url:string url)
   - estimate (same shape, icon_key='calculator', no extra required metadata)
   - prepare_offer (same shape, icon_key='file-text', no extra required metadata)

2. Insert two crm.settings rows (setting_group='workflow'):
   - workflow.task_type_defaults  (per-type defaults: owner code, duration days,
     requires_server_folder, visible_in_form)
   - workflow.templates           (object_preparation_v1 with the 3 steps,
     anchor_event='completed_at', offsets in days)

3. Create crm.rpc_recompute_dependent_tasks(p_anchor_task_id uuid)
   SECURITY DEFINER, search_path=crm.
   For every task_relations row where from_id=p_anchor_task_id AND
   relation_type IN ('sequence_next','schedule_anchor_after','schedule_anchor_before')
   AND metadata->>'dynamic_recalc'='true':
     - if anchor status='cancelled' AND metadata->>'cancel_with_anchor'='true'
       → update dependent set status='cancelled' (only if not already terminal),
         call crm.create_audit_event for the change
     - else recompute dependent.due_at from
       anchor.<metadata->>'anchor_event'> + (metadata->>'offset_minutes')::int * interval '1 minute'
       and update only if changed; emit audit event with before/after due_at
   No recursion. No call to itself with dependent ids.

4. Add a tail call to crm.rpc_recompute_dependent_tasks(p_task_id)
   at the END of: rpc_complete_task, rpc_reschedule_task, rpc_cancel_task.
   Do not change their signatures, their existing audit emissions, or
   any other behavior.

5. Grants: EXECUTE on the new function to the same role(s) that already
   have EXECUTE on rpc_complete_task.

Do NOT:
- add a spawn RPC (next phase)
- change frontend code
- create new tables
- drop or alter any existing column, FK, or RPC signature
- implement approval enforcement

Verify with SQL:
- Insert anchor task A (due in 10 days) and dependent task B.
  Insert task_relations row: from=A, to=B, relation_type='schedule_anchor_after',
  metadata={"anchor_event":"completed_at","offset_minutes":4320,
            "dynamic_recalc":true,"cancel_with_anchor":true}.
- Complete A → B.due_at = A.completed_at + 3 days.
- Reschedule A → B.due_at recomputes (because anchor_event='completed_at'
  and A is not completed yet, no change expected; switch metadata to
  anchor_event='due_at' for a second test and confirm B moves).
- Cancel A → B.status='cancelled'.
- Audit rows exist for each change, no FK errors.

Return:
- list of migrations applied
- SQL bodies
- test transcript
```
