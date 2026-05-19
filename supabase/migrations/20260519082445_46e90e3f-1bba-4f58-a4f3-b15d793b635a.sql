
DO $smoke$
DECLARE
  v_lead_id        uuid := 'e6602b7c-bcef-44a7-a457-2cbd61aae716';
  v_a_id           uuid;
  v_b_id           uuid;
  v_c_id           uuid;
  v_d_id           uuid;
  v_wi_id          uuid;
  v_a_completed_at timestamptz;
  v_b              crm.tasks%ROWTYPE;
  v_rel_seq        int;
  v_rel_anchor     int;
  v_audit_spawned  int;
  v_audit_failed   int;
  v_spawn_again    jsonb;
  v_spawn_terminal jsonb;
  v_dup_count      int;
  v_results        jsonb := '{}'::jsonb;
  v_expected_due   timestamptz;
  v_d_status       text;
BEGIN
  -- ============================
  -- STEP 1: Create root task A (draw_sketches, step 1, no workflow_instance_id)
  -- ============================
  INSERT INTO crm.tasks (
    lead_id, task_type, status, priority,
    title, due_at, is_auto_created, metadata
  ) VALUES (
    v_lead_id, 'draw_sketches', 'planned', 'medium',
    'TEST 2b.2a — A draw_sketches', now() + interval '5 days', false,
    jsonb_build_object(
      'test_marker', 'TEST 2b.2a',
      'workflow', jsonb_build_object(
        'template_key','object_preparation_v1',
        'step', 1
      )
    )
  ) RETURNING id INTO v_a_id;

  -- ============================
  -- STEP 2: Complete A via rpc_complete_task → triggers spawn
  -- ============================
  PERFORM crm.rpc_complete_task(
    p_task_id := v_a_id,
    p_completed_at := now(),
    p_completed_by_user_id := NULL,
    p_outcome_code := NULL,
    p_summary := 'smoke A',
    p_notes := 'smoke',
    p_create_activity := true,
    p_activity_type := 'note',
    p_communication_basis := NULL,
    p_metadata := jsonb_build_object('test_marker','TEST 2b.2a')
  );

  SELECT completed_at, workflow_instance_id INTO v_a_completed_at, v_wi_id
  FROM crm.tasks WHERE id = v_a_id;

  -- ============================
  -- STEP 3: Assert child B exists with correct shape
  -- ============================
  SELECT * INTO v_b
  FROM crm.tasks
  WHERE parent_task_id = v_a_id
  LIMIT 1;

  v_b_id := v_b.id;
  v_expected_due := v_a_completed_at + interval '3 days';

  SELECT count(*) INTO v_rel_seq
  FROM crm.task_relations
  WHERE from_id = v_a_id AND to_id = v_b_id AND relation_type = 'sequence_next';

  SELECT count(*) INTO v_rel_anchor
  FROM crm.task_relations
  WHERE from_id = v_a_id AND to_id = v_b_id AND relation_type = 'schedule_anchor_after';

  SELECT count(*) INTO v_audit_spawned
  FROM crm.audit_events
  WHERE entity_id = v_b_id AND event_key = 'workflow_task_spawned';

  v_results := v_results || jsonb_build_object(
    'step3_spawn', jsonb_build_object(
      'a_id', v_a_id,
      'b_id', v_b_id,
      'workflow_instance_id', v_wi_id,
      'a_completed_at', v_a_completed_at,
      'b_task_type', v_b.task_type,
      'b_task_type_ok', v_b.task_type = 'estimate',
      'b_status', v_b.status,
      'b_status_ok', v_b.status = 'planned',
      'b_is_auto_created', v_b.is_auto_created,
      'b_workflow_instance_shared', v_b.workflow_instance_id = v_wi_id,
      'b_due_at', v_b.due_at,
      'expected_due_at', v_expected_due,
      'b_due_at_ok', v_b.due_at = v_expected_due,
      'b_step_metadata', v_b.metadata->'workflow'->>'step',
      'b_step_ok', v_b.metadata->'workflow'->>'step' = '2',
      'b_template_ok', v_b.metadata->'workflow'->>'template_key' = 'object_preparation_v1',
      'b_spawned_from_ok', v_b.metadata->'workflow'->>'spawned_from_task_id' = v_a_id::text,
      'relation_sequence_next_count', v_rel_seq,
      'relation_schedule_anchor_count', v_rel_anchor,
      'audit_workflow_task_spawned_count', v_audit_spawned
    )
  );

  -- ============================
  -- STEP 4: Idempotency — call spawn again, expect already_exists
  -- ============================
  v_spawn_again := crm.rpc_spawn_next_workflow_task(v_a_id);

  SELECT count(*) INTO v_dup_count
  FROM crm.tasks
  WHERE parent_task_id = v_a_id;

  v_results := v_results || jsonb_build_object(
    'step4_idempotency', jsonb_build_object(
      'spawn_again_result', v_spawn_again,
      'spawned_flag', v_spawn_again->>'spawned',
      'reason', v_spawn_again->>'reason',
      'children_of_a_count', v_dup_count,
      'no_duplicate_ok', v_dup_count = 1
    )
  );

  -- ============================
  -- STEP 5: Failure isolation — malformed metadata
  -- ============================
  INSERT INTO crm.tasks (
    lead_id, task_type, status, priority,
    title, due_at, is_auto_created, metadata
  ) VALUES (
    v_lead_id, 'draw_sketches', 'planned', 'medium',
    'TEST 2b.2a — C malformed', now() + interval '5 days', false,
    jsonb_build_object(
      'test_marker','TEST 2b.2a',
      'workflow', jsonb_build_object(
        'template_key','object_preparation_v1',
        'step','not-a-number'
      )
    )
  ) RETURNING id INTO v_c_id;

  BEGIN
    PERFORM crm.rpc_complete_task(
      p_task_id := v_c_id,
      p_completed_at := now(),
      p_completed_by_user_id := NULL,
      p_outcome_code := NULL,
      p_summary := 'smoke C',
      p_notes := 'smoke',
      p_create_activity := true,
      p_activity_type := 'note',
      p_communication_basis := NULL,
      p_metadata := jsonb_build_object('test_marker','TEST 2b.2a')
    );
  EXCEPTION WHEN OTHERS THEN
    -- Should NOT happen; parent completion must survive spawn failure
    NULL;
  END;

  SELECT count(*) INTO v_audit_failed
  FROM crm.audit_events
  WHERE entity_id = v_c_id AND event_key = 'workflow_task_spawn_failed';

  v_results := v_results || jsonb_build_object(
    'step5_failure_isolation', jsonb_build_object(
      'c_id', v_c_id,
      'c_status', (SELECT status FROM crm.tasks WHERE id = v_c_id),
      'c_status_ok', (SELECT status FROM crm.tasks WHERE id = v_c_id) = 'completed',
      'audit_spawn_failed_count', v_audit_failed,
      'no_child_for_c', (SELECT count(*) FROM crm.tasks WHERE parent_task_id = v_c_id)
    )
  );

  -- ============================
  -- STEP 6: Terminal step (step=3, no next) — no spawn
  -- ============================
  INSERT INTO crm.tasks (
    lead_id, task_type, status, priority,
    title, due_at, is_auto_created, metadata
  ) VALUES (
    v_lead_id, 'prepare_offer', 'planned', 'medium',
    'TEST 2b.2a — D terminal', now() + interval '5 days', false,
    jsonb_build_object(
      'test_marker','TEST 2b.2a',
      'workflow', jsonb_build_object(
        'template_key','object_preparation_v1',
        'step', 3
      )
    )
  ) RETURNING id INTO v_d_id;

  PERFORM crm.rpc_complete_task(
    p_task_id := v_d_id,
    p_completed_at := now(),
    p_completed_by_user_id := NULL,
    p_outcome_code := NULL,
    p_summary := 'smoke D',
    p_notes := 'smoke',
    p_create_activity := true,
    p_activity_type := 'note',
    p_communication_basis := NULL,
    p_metadata := jsonb_build_object('test_marker','TEST 2b.2a')
  );

  -- Call spawn directly to capture the no_next_step reason
  v_spawn_terminal := crm.rpc_spawn_next_workflow_task(v_d_id);
  SELECT status INTO v_d_status FROM crm.tasks WHERE id = v_d_id;

  v_results := v_results || jsonb_build_object(
    'step6_terminal', jsonb_build_object(
      'd_id', v_d_id,
      'd_status', v_d_status,
      'd_status_ok', v_d_status = 'completed',
      'spawn_terminal_result', v_spawn_terminal,
      'no_next_step_ok', v_spawn_terminal->>'reason' = 'no_next_step',
      'no_child_for_d', (SELECT count(*) FROM crm.tasks WHERE parent_task_id = v_d_id)
    )
  );

  -- ============================
  -- STEP 7: Overall verdict
  -- ============================
  v_results := v_results || jsonb_build_object(
    'verdict', jsonb_build_object(
      'a_to_b_spawn_passed',
        v_b.task_type = 'estimate'
        AND v_b.status = 'planned'
        AND v_b.workflow_instance_id = v_wi_id
        AND v_b.due_at = v_expected_due
        AND v_rel_seq = 1 AND v_rel_anchor = 1 AND v_audit_spawned = 1,
      'idempotency_passed',
        (v_spawn_again->>'spawned') = 'false'
        AND (v_spawn_again->>'reason') = 'already_exists'
        AND v_dup_count = 1,
      'malformed_did_not_break_parent',
        (SELECT status FROM crm.tasks WHERE id = v_c_id) = 'completed'
        AND v_audit_failed >= 1,
      'terminal_no_spawn',
        v_d_status = 'completed'
        AND (v_spawn_terminal->>'reason') = 'no_next_step'
        AND (SELECT count(*) FROM crm.tasks WHERE parent_task_id = v_d_id) = 0,
      'ran_at', now()
    )
  );

  -- ============================
  -- STEP 8: Cleanup
  -- ============================
  DELETE FROM crm.task_relations
   WHERE from_id IN (v_a_id, v_b_id, v_c_id, v_d_id)
      OR to_id   IN (v_a_id, v_b_id, v_c_id, v_d_id);

  DELETE FROM crm.activities
   WHERE task_id IN (v_a_id, v_b_id, v_c_id, v_d_id);

  DELETE FROM crm.audit_events
   WHERE entity_type = 'task'
     AND entity_id IN (v_a_id, v_b_id, v_c_id, v_d_id);

  -- Child first (FK parent_task_id), then parents
  DELETE FROM crm.tasks WHERE id = v_b_id;
  DELETE FROM crm.tasks WHERE id IN (v_a_id, v_c_id, v_d_id);

  IF v_wi_id IS NOT NULL THEN
    DELETE FROM crm.workflow_instances WHERE id = v_wi_id;
  END IF;

  v_results := v_results || jsonb_build_object(
    'cleanup', jsonb_build_object(
      'remaining_test_tasks',
        (SELECT count(*) FROM crm.tasks WHERE id IN (v_a_id, v_b_id, v_c_id, v_d_id)),
      'remaining_workflow_instance',
        (SELECT count(*) FROM crm.workflow_instances WHERE id = v_wi_id),
      'cleanup_ok', true
    )
  );

  -- ============================
  -- STEP 9: Persist results
  -- ============================
  INSERT INTO crm.settings (setting_group, setting_key, value_json, description, is_active)
  VALUES ('workflow','workflow.smoketest.2b2a', v_results,
          'Phase 2b.2a smoke test results', true)
  ON CONFLICT (setting_key) DO UPDATE
    SET value_json = EXCLUDED.value_json,
        updated_at = now();
END
$smoke$;
