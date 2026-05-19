
## Schema introspection (real, verified)

`crm.tasks` columns used by this guard exist and have correct types:
- `id uuid`
- `status text` (observed values include `planned`, `in_progress`, `completed`, `cancelled`, `skipped`)
- `metadata jsonb` (NOT NULL, default `{}`)

Confirmed live data uses the exact keys from the spec:
- `metadata->>'workflow_group_id'` (uuid as text)
- `metadata->>'workflow_step'` (integer as text)

Example rows (one workflow group):

```text
draw_sketches  step=1  status=planned
estimate       step=2  status=planned
prepare_offer  step=3  status=planned
```

`crm.rpc_complete_task` sets `status = 'completed'` in a single `UPDATE crm.tasks ... WHERE id = p_task_id` block, after the `TASK_ALREADY_FINALIZED` check and before the activity insert. The guard must run BEFORE that `UPDATE`.

## What the guard does

Before completion, if the task being completed has:
- `metadata->>'workflow_group_id' IS NOT NULL`, AND
- `(metadata->>'workflow_step')::int > 1`

…look up the sibling task in the same `workflow_group_id` whose `workflow_step = current - 1`. If that previous step's `status <> 'completed'`, raise `WORKFLOW_PREVIOUS_STEP_NOT_COMPLETED`.

Rules respected:
- Step 1 is never blocked.
- Tasks without `workflow_group_id` are untouched.
- Legacy `workflow_instance_id` chains are untouched (different key, not read).
- RPC signature unchanged. No new columns. No new tables. No spawn/lifecycle rewrite. `crm.tasks` remains canonical.

## SQL preview (NOT applied)

This is an additive `CREATE OR REPLACE` that preserves the existing body byte-for-byte and inserts only the guard block right after the `TASK_ALREADY_FINALIZED` check. Final apply will reuse the current function body verbatim — shown here in abbreviated form for review:

```sql
CREATE OR REPLACE FUNCTION crm.rpc_complete_task(
  p_task_id uuid,
  p_completed_at timestamptz DEFAULT now(),
  p_completed_by_user_id uuid DEFAULT auth.uid(),
  p_outcome_code text DEFAULT NULL,
  p_summary text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_create_activity boolean DEFAULT true,
  p_activity_type text DEFAULT NULL,
  p_communication_basis text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'crm','public'
AS $function$
DECLARE
  v_task crm.tasks%ROWTYPE;
  v_activity_id uuid;
  v_activity_type text;
  v_valid_outcomes jsonb;
  v_outcome_result jsonb;
  v_status_applied text;
  v_wf_group_id text;            -- NEW
  v_wf_step int;                 -- NEW
  v_prev_status text;            -- NEW
BEGIN
  SELECT * INTO v_task FROM crm.tasks WHERE id = p_task_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'TASK_NOT_FOUND'; END IF;
  IF v_task.status IN ('completed','cancelled','skipped') THEN
    RAISE EXCEPTION 'TASK_ALREADY_FINALIZED';
  END IF;

  ---------------------------------------------------------------
  -- NEW: workflow_group_id step-order guard (additive, minimal)
  ---------------------------------------------------------------
  v_wf_group_id := v_task.metadata->>'workflow_group_id';
  BEGIN
    v_wf_step := NULLIF(v_task.metadata->>'workflow_step','')::int;
  EXCEPTION WHEN invalid_text_representation THEN
    v_wf_step := NULL;
  END;

  IF v_wf_group_id IS NOT NULL AND v_wf_step IS NOT NULL AND v_wf_step > 1 THEN
    SELECT t.status
      INTO v_prev_status
    FROM crm.tasks t
    WHERE t.metadata->>'workflow_group_id' = v_wf_group_id
      AND NULLIF(t.metadata->>'workflow_step','')::int = v_wf_step - 1
    ORDER BY t.created_at ASC
    LIMIT 1;

    IF v_prev_status IS NULL OR v_prev_status <> 'completed' THEN
      RAISE EXCEPTION 'WORKFLOW_PREVIOUS_STEP_NOT_COMPLETED';
    END IF;
  END IF;
  ---------------------------------------------------------------

  -- (rest of the existing function body is preserved verbatim:
  --   outcome validation, activity_type validation against
  --   crm.settings 'activity.types', UPDATE crm.tasks SET status='completed',
  --   activity insert, task_relations insert, outcome action, audit_events insert)
END;
$function$;
```

## Self-check vs real schema

```text
invalid_columns_present:        no
invalid_fk_targets_present:     no  (guard does not write any FK)
uses_nonexistent_fields:        no  (only crm.tasks.metadata / status / created_at)
preview_matches_real_schema:    yes
```

Notes:
- `metadata` is `jsonb NOT NULL`, so `->>` is safe.
- `workflow_step` is read as text and cast via `NULLIF(...,'')::int` inside a `BEGIN/EXCEPTION` block so a malformed value never aborts completion of unrelated tasks.
- Tie-break on `created_at ASC` covers the (unexpected) case of duplicate step rows; behavior is conservative — the earliest sibling must be completed.
- Legacy `workflow_instance_id` paths are not read by this guard.

## Out of scope (explicit)

- No changes to `rpc_create_task`, `rpc_reschedule_task`, `rpc_skip_task`, `rpc_cancel_task`.
- No spawn-engine changes.
- No new tables, columns, indexes, triggers, or settings.
- No frontend changes in this step (the existing `TaskActionsMenu` will surface `WORKFLOW_PREVIOUS_STEP_NOT_COMPLETED` via the standard error toast). A small LV-translation of that error message can be added in a follow-up if desired.

Awaiting approval before applying.
