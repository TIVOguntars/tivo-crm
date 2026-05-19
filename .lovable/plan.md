# Phase 2b.1 — SQL preview (no apply yet)

Read-only inspection completed. Below is the exact SQL I will submit via the migration tool once you approve. Nothing has been applied.

## Findings that change the plan slightly

1. **`crm.task_relations.relation_type` already has a CHECK constraint** restricting values to: `follows`, `caused`, `triggered`, `replaced_by`. The plan adds new values (`sequence_next`, `schedule_anchor_after`, `schedule_anchor_before`, `related`, `follow_up_of`). Postgres requires DROP CONSTRAINT + ADD CONSTRAINT to widen a CHECK. **This is technically an ALTER but it is value-widening only — no row is invalidated, no column dropped, no FK touched.** I flag it explicitly per your rule. If you prefer to avoid even this widening ALTER, alternative is to skip the CHECK and store relation_type as-is — but then constraint becomes weaker than today. I recommend the widening.

2. **`rpc_reschedule_task` does NOT have the `EXISTS (crm.profiles ...)` guard** on its `actor_user_id` insert (the other two do). If we tail-call recompute from inside reschedule, the reschedule itself can still fail at the audit insert for users missing from `crm.profiles`. Per scope ("do not change their existing audit emissions"), I will NOT patch that in 2b.1. Existing behavior preserved.

3. `crm.create_audit_event` is **not used** by the lifecycle RPCs (they `INSERT` directly). So the `.lovable/plan.md` actor-resolution fix is NOT a precondition for 2b.1 strictly. I will leave `create_audit_event` untouched.

4. `crm.task_types` PK is `type_key` — seed via `INSERT ... ON CONFLICT (type_key) DO NOTHING`. Safe re-run.

5. `crm.settings` has `(setting_group, setting_key)` — seed via `ON CONFLICT (setting_key) DO NOTHING` (need to verify unique index — I'll add a defensive WHERE NOT EXISTS instead to avoid assuming an index).

## Safety confirmation

- No `DROP TABLE`, no `DROP COLUMN`, no `DROP FUNCTION`.
- No `ALTER COLUMN` changing type or nullability.
- One CHECK constraint widened on `task_relations.relation_type` (drop + recreate with strictly larger value set). All existing rows remain valid.
- No RPC signature changes. `rpc_complete_task`, `rpc_reschedule_task`, `rpc_cancel_task` keep identical parameters, return type, and pre-existing behavior. Only a tail call to `crm.rpc_recompute_dependent_tasks(p_task_id)` is appended before the final `RETURN`.
- New function `crm.rpc_recompute_dependent_tasks` is additive.
- No grants revoked; only new EXECUTE grants on the new function.
- No frontend code changes.

---

## SQL to apply (single migration)

```sql
-- =========================================================================
-- Phase 2b.1 — Workflow foundations (additive)
-- =========================================================================

-- 1) Widen relation_type CHECK on crm.task_relations (additive, value-widening)
ALTER TABLE crm.task_relations
  DROP CONSTRAINT task_relations_relation_type_check;

ALTER TABLE crm.task_relations
  ADD CONSTRAINT task_relations_relation_type_check
  CHECK (relation_type = ANY (ARRAY[
    'follows',
    'caused',
    'triggered',
    'replaced_by',
    'sequence_next',
    'schedule_anchor_after',
    'schedule_anchor_before',
    'related',
    'follow_up_of'
  ]));

-- 2) Seed 3 new rows into crm.task_types (additive, idempotent)
INSERT INTO crm.task_types (
  type_key, label_lv, label_en, channel, mode, completion_rule,
  requires_communication_proof, requires_body, requires_subject, requires_meeting_url,
  default_priority, metadata_schema, icon_key, is_active, sort_order
) VALUES
  ('draw_sketches', 'Zīmēt skices', 'Draw sketches',
   'human', 'human', 'human_complete',
   false, false, false, false,
   'normal',
   jsonb_build_object(
     'type','object',
     'required', jsonb_build_array('server_folder_url'),
     'properties', jsonb_build_object(
       'server_folder_url', jsonb_build_object('type','string','format','uri')
     )
   ),
   'pencil-ruler', true, 100),
  ('estimate', 'Tāmēšana', 'Estimate',
   'human', 'human', 'human_complete',
   false, false, false, false,
   'normal',
   '{}'::jsonb,
   'calculator', true, 110),
  ('prepare_offer', 'Piedāvājuma sagatavošana', 'Prepare offer',
   'human', 'human', 'human_complete',
   false, false, false, false,
   'normal',
   '{}'::jsonb,
   'file-text', true, 120)
ON CONFLICT (type_key) DO NOTHING;

-- 3) Seed workflow settings rows (additive, idempotent via WHERE NOT EXISTS)
INSERT INTO crm.settings (setting_group, setting_key, value_json, description, is_active)
SELECT 'workflow', 'workflow.task_type_defaults',
  jsonb_build_object(
    'draw_sketches', jsonb_build_object(
      'default_owner_code','EG','default_duration_days',7,
      'requires_server_folder',true,'visible_in_form',true),
    'estimate', jsonb_build_object(
      'default_owner_code',null,'default_duration_days',3,
      'visible_in_form',true),
    'prepare_offer', jsonb_build_object(
      'default_owner_code',null,'default_duration_days',2,
      'visible_in_form',true)
  ),
  'Per-task-type workflow defaults (owner, duration, flags). Phase 2b.',
  true
WHERE NOT EXISTS (
  SELECT 1 FROM crm.settings WHERE setting_key = 'workflow.task_type_defaults'
);

INSERT INTO crm.settings (setting_group, setting_key, value_json, description, is_active)
SELECT 'workflow', 'workflow.templates',
  jsonb_build_object(
    'object_preparation_v1', jsonb_build_object(
      'label_lv','Objekta sagatavošana',
      'requires_server_folder', true,
      'steps', jsonb_build_array(
        jsonb_build_object('step',1,'task_type','draw_sketches',
          'offset_days_from_start',0,'owner_code','EG'),
        jsonb_build_object('step',2,'task_type','estimate',
          'anchor_step',1,'anchor_event','completed_at','offset_days',3),
        jsonb_build_object('step',3,'task_type','prepare_offer',
          'anchor_step',2,'anchor_event','completed_at','offset_days',2)
      )
    )
  ),
  'Workflow templates (declarative). Phase 2b.',
  true
WHERE NOT EXISTS (
  SELECT 1 FROM crm.settings WHERE setting_key = 'workflow.templates'
);

-- 4) New resolver: recompute or cancel direct dependents of an anchor task.
--    SECURITY DEFINER, never recurses. No-op if no dependents.
CREATE OR REPLACE FUNCTION crm.rpc_recompute_dependent_tasks(p_anchor_task_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'crm'
AS $fn$
DECLARE
  v_anchor          crm.tasks%ROWTYPE;
  v_rel             RECORD;
  v_dep             crm.tasks%ROWTYPE;
  v_anchor_event    text;
  v_offset_minutes  int;
  v_cancel_with     boolean;
  v_anchor_ts       timestamptz;
  v_new_due         timestamptz;
  v_updated_count   int := 0;
  v_cancelled_count int := 0;
BEGIN
  IF p_anchor_task_id IS NULL THEN
    RETURN jsonb_build_object('updated',0,'cancelled',0,'reason','null_anchor');
  END IF;

  SELECT * INTO v_anchor FROM crm.tasks WHERE id = p_anchor_task_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('updated',0,'cancelled',0,'reason','anchor_not_found');
  END IF;

  FOR v_rel IN
    SELECT *
    FROM crm.task_relations
    WHERE from_kind = 'task'
      AND from_id   = p_anchor_task_id
      AND to_kind   = 'task'
      AND relation_type IN ('sequence_next','schedule_anchor_after','schedule_anchor_before')
      AND COALESCE(metadata->>'dynamic_recalc','false') = 'true'
  LOOP
    SELECT * INTO v_dep FROM crm.tasks WHERE id = v_rel.to_id;
    IF NOT FOUND THEN CONTINUE; END IF;

    -- Skip already terminal dependents
    IF v_dep.status IN ('completed','cancelled','skipped','failed') THEN
      CONTINUE;
    END IF;

    v_cancel_with := COALESCE((v_rel.metadata->>'cancel_with_anchor')::boolean, false);

    -- Cancel propagation
    IF v_anchor.status = 'cancelled' AND v_cancel_with THEN
      UPDATE crm.tasks
         SET status = 'cancelled',
             cancelled_reason = COALESCE(cancelled_reason,'cascade_from_anchor'),
             updated_at = now(),
             metadata = COALESCE(metadata,'{}'::jsonb)
               || jsonb_build_object(
                    'cascade_cancelled_from_task_id', v_anchor.id,
                    'cascade_cancelled_at', now())
       WHERE id = v_dep.id;

      INSERT INTO crm.audit_events (
        entity_type, entity_id, action_type, source_type,
        event_key, event_name, before_data, after_data,
        changed_fields, actor_user_id, reason, metadata
      ) VALUES (
        'task', v_dep.id, 'update', 'system',
        'task_cancelled_cascade', 'Dependent task cancelled with anchor',
        jsonb_build_object('status', v_dep.status),
        jsonb_build_object('status', 'cancelled'),
        jsonb_build_array('status'),
        NULL, 'cascade_from_anchor',
        jsonb_build_object('anchor_task_id', v_anchor.id,
                           'relation_id', v_rel.id)
      );
      v_cancelled_count := v_cancelled_count + 1;
      CONTINUE;
    END IF;

    -- Recompute due_at
    v_anchor_event   := COALESCE(v_rel.metadata->>'anchor_event','completed_at');
    v_offset_minutes := COALESCE((v_rel.metadata->>'offset_minutes')::int, 0);

    v_anchor_ts := CASE v_anchor_event
      WHEN 'completed_at' THEN v_anchor.completed_at
      WHEN 'due_at'       THEN v_anchor.due_at
      WHEN 'started_at'   THEN v_anchor.started_at
      ELSE NULL
    END;

    IF v_anchor_ts IS NULL THEN
      CONTINUE; -- nothing to compute from yet
    END IF;

    v_new_due := v_anchor_ts + make_interval(mins => v_offset_minutes);

    IF v_dep.due_at IS DISTINCT FROM v_new_due THEN
      UPDATE crm.tasks
         SET due_at = v_new_due,
             updated_at = now(),
             metadata = COALESCE(metadata,'{}'::jsonb)
               || jsonb_build_object(
                    'last_dynamic_recalc_at', now(),
                    'last_dynamic_recalc_from_task_id', v_anchor.id,
                    'last_dynamic_recalc_anchor_event', v_anchor_event,
                    'last_dynamic_recalc_offset_minutes', v_offset_minutes)
       WHERE id = v_dep.id;

      INSERT INTO crm.audit_events (
        entity_type, entity_id, action_type, source_type,
        event_key, event_name, before_data, after_data,
        changed_fields, actor_user_id, reason, metadata
      ) VALUES (
        'task', v_dep.id, 'update', 'system',
        'task_dynamic_recalc', 'Dependent due_at recomputed from anchor',
        jsonb_build_object('due_at', v_dep.due_at),
        jsonb_build_object('due_at', v_new_due),
        jsonb_build_array('due_at'),
        NULL, NULL,
        jsonb_build_object('anchor_task_id', v_anchor.id,
                           'relation_id', v_rel.id,
                           'anchor_event', v_anchor_event,
                           'offset_minutes', v_offset_minutes)
      );
      v_updated_count := v_updated_count + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'anchor_task_id', p_anchor_task_id,
    'updated', v_updated_count,
    'cancelled', v_cancelled_count
  );
END;
$fn$;

GRANT EXECUTE ON FUNCTION crm.rpc_recompute_dependent_tasks(uuid)
  TO authenticated, service_role;

-- 5) Tail-call recompute from each lifecycle RPC.
--    Existing bodies preserved verbatim; one line added before final RETURN.
--    Below: full CREATE OR REPLACE for each, identical to current except for
--    the PERFORM crm.rpc_recompute_dependent_tasks(...) before RETURN.
```

The CREATE OR REPLACE bodies for `rpc_complete_task`, `rpc_reschedule_task`, `rpc_cancel_task` will be byte-for-byte identical to the current production bodies (which I have already fetched) with a single new statement inserted before the final `RETURN jsonb_build_object(...)`:

```sql
PERFORM crm.rpc_recompute_dependent_tasks(v_task.id);
```

I will include all three full bodies in the actual migration, not abbreviated, so the user can review the full diff in the migration approval UI.

---

## Verification after apply (manual SQL, no UI)

```sql
-- Pick a real lead
WITH l AS (SELECT id FROM crm.leads ORDER BY created_at DESC LIMIT 1)
INSERT INTO crm.tasks (lead_id, task_type, status, priority, title, due_at, metadata)
SELECT id, 'call', 'planned', 'normal', '2b.1 anchor test', now() + interval '10 days', '{}'::jsonb
FROM l RETURNING id;
-- → A_ID

WITH l AS (SELECT lead_id FROM crm.tasks WHERE id = 'A_ID')
INSERT INTO crm.tasks (lead_id, task_type, status, priority, title, due_at, metadata)
SELECT lead_id, 'manual_email', 'planned', 'normal', '2b.1 dependent test', now() + interval '20 days', '{}'::jsonb
FROM l RETURNING id;
-- → B_ID

INSERT INTO crm.task_relations (lead_id, from_kind, from_id, to_kind, to_id, relation_type, metadata)
SELECT lead_id, 'task', 'A_ID', 'task', 'B_ID', 'schedule_anchor_after',
       jsonb_build_object('anchor_event','completed_at',
                          'offset_minutes', 3*24*60,
                          'dynamic_recalc', true,
                          'cancel_with_anchor', true)
FROM crm.tasks WHERE id = 'A_ID';

-- Reschedule A — B should NOT move (anchor_event=completed_at, A not completed)
SELECT crm.rpc_reschedule_task('A_ID', now() + interval '5 days', 'test');
SELECT due_at FROM crm.tasks WHERE id = 'B_ID';

-- Complete A — B.due_at should = A.completed_at + 3 days
SELECT crm.rpc_complete_task('A_ID');
SELECT a.completed_at, b.due_at
FROM crm.tasks a, crm.tasks b
WHERE a.id = 'A_ID' AND b.id = 'B_ID';

-- Cancel A (reset first if needed) — B should cascade cancel
-- (Reset path is out of scope; tested by creating a fresh anchor.)

-- Inspect audit
SELECT event_key, after_data, metadata
FROM crm.audit_events
WHERE entity_id IN ('A_ID'::uuid, 'B_ID'::uuid)
ORDER BY occurred_at;
```

---

## Confirmations (against your gates)

- no DROP — **confirmed** (no `DROP TABLE/COLUMN/FUNCTION`)
- no destructive ALTER — **partially**: one widening CHECK constraint replacement on `task_relations.relation_type` (only enlarges allowed value set; all existing rows remain valid). Flagged explicitly for your call.
- no RPC signature changes — **confirmed** (parameters and return types of all three lifecycle RPCs unchanged)
- existing task lifecycle behavior preserved — **confirmed**, only an additional tail `PERFORM` before the final RETURN

## Decision needed from you

Reply with one of:

- **"Apply"** — I submit the migration as-is (with the widening CHECK replacement).
- **"Apply without CHECK widening"** — I drop the CHECK widening; new `relation_type` values will fail to insert until a follow-up step. (Not recommended — blocks 2b.2.)
- **"Hold"** — adjust something first.
