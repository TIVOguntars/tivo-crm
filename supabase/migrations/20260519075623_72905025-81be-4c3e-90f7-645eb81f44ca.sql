
DO $$
DECLARE
  v_lead uuid := 'e6602b7c-bcef-44a7-a457-2cbd61aae716';
  v_a uuid;
  v_b uuid;
  v_rel uuid;
  v_a_due_0 timestamptz;
  v_b_due_0 timestamptz;
  v_a_due_1 timestamptz;
  v_b_due_1 timestamptz;
  v_new_due timestamptz := date_trunc('second', now()) + interval '15 days';
  v_a_status_final text;
  v_b_status_final text;
  v_audit_count int;
  v_result jsonb;
BEGIN
  INSERT INTO crm.tasks (lead_id, task_type, title, due_at, status, metadata)
  VALUES (v_lead, 'call', 'TEST 2b.1 anchor A', now() + interval '10 days', 'pending', '{"test":"2b.1"}'::jsonb)
  RETURNING id, due_at INTO v_a, v_a_due_0;

  INSERT INTO crm.tasks (lead_id, task_type, title, due_at, status, metadata)
  VALUES (v_lead, 'manual_email', 'TEST 2b.1 dependent B', now() + interval '20 days', 'pending', '{"test":"2b.1"}'::jsonb)
  RETURNING id, due_at INTO v_b, v_b_due_0;

  INSERT INTO crm.task_relations (
    lead_id, from_kind, from_id, to_kind, to_id, relation_type, metadata
  )
  VALUES (
    v_lead, 'task', v_a, 'task', v_b, 'schedule_anchor_after',
    jsonb_build_object(
      'anchor_event', 'due_at',
      'offset_minutes', 4320,
      'dynamic_recalc', true,
      'cancel_with_anchor', true
    )
  )
  RETURNING id INTO v_rel;

  PERFORM crm.rpc_reschedule_task(v_a, v_new_due, 'TEST 2b.1 reschedule', NULL, '{}'::jsonb);

  SELECT due_at INTO v_a_due_1 FROM crm.tasks WHERE id = v_a;
  SELECT due_at INTO v_b_due_1 FROM crm.tasks WHERE id = v_b;

  PERFORM crm.rpc_cancel_task(v_a, 'TEST 2b.1 cancel', NULL, '{}'::jsonb);

  SELECT status INTO v_a_status_final FROM crm.tasks WHERE id = v_a;
  SELECT status INTO v_b_status_final FROM crm.tasks WHERE id = v_b;

  SELECT count(*) INTO v_audit_count
  FROM crm.audit_events
  WHERE entity_type='task' AND entity_id IN (v_a, v_b);

  v_result := jsonb_build_object(
    'ran_at', now(),
    'lead_id', v_lead,
    'task_a_id', v_a,
    'task_b_id', v_b,
    'relation_id', v_rel,
    'a_due_initial', v_a_due_0,
    'b_due_initial', v_b_due_0,
    'a_due_after_reschedule', v_a_due_1,
    'b_due_after_reschedule', v_b_due_1,
    'expected_b_due', v_new_due + interval '3 days',
    'b_recompute_match', (v_b_due_1 = v_new_due + interval '3 days'),
    'a_status_final', v_a_status_final,
    'b_status_final', v_b_status_final,
    'b_cancelled_with_anchor', (v_b_status_final = 'cancelled'),
    'audit_events_for_test_tasks', v_audit_count
  );

  INSERT INTO crm.settings (setting_key, setting_group, value_json, description, is_active)
  VALUES ('workflow.smoketest.2b1', 'workflow', v_result, 'Phase 2b.1 smoke test results', true)
  ON CONFLICT (setting_key) DO UPDATE
    SET value_json = EXCLUDED.value_json,
        updated_at = now();

  DELETE FROM crm.task_relations WHERE from_id IN (v_a, v_b) OR to_id IN (v_a, v_b);
  DELETE FROM crm.activities WHERE task_id IN (v_a, v_b);
  DELETE FROM crm.audit_events WHERE entity_type='task' AND entity_id IN (v_a, v_b);
  DELETE FROM crm.tasks WHERE id IN (v_a, v_b);
END $$;
