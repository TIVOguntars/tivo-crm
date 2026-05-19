CREATE OR REPLACE FUNCTION crm.rpc_complete_task(p_task_id uuid, p_completed_at timestamp with time zone DEFAULT now(), p_completed_by_user_id uuid DEFAULT auth.uid(), p_outcome_code text DEFAULT NULL::text, p_summary text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_create_activity boolean DEFAULT true, p_activity_type text DEFAULT NULL::text, p_communication_basis text DEFAULT NULL::text, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'crm', 'public'
AS $function$
DECLARE
  v_task crm.tasks%ROWTYPE;
  v_activity_id uuid;
  v_activity_type text;
  v_valid_outcomes jsonb;
  v_outcome_result jsonb;
  v_status_applied text;
  v_wf_group_id text;
  v_wf_step int;
  v_prev_status text;
BEGIN
  SELECT *
  INTO v_task
  FROM crm.tasks
  WHERE id = p_task_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TASK_NOT_FOUND';
  END IF;

  IF v_task.status IN ('completed', 'cancelled', 'skipped') THEN
    RAISE EXCEPTION 'TASK_ALREADY_FINALIZED';
  END IF;

  ---------------------------------------------------------------
  -- Workflow group step-order guard (additive, minimal).
  -- Blocks completing step N before step N-1 in the same
  -- metadata.workflow_group_id is completed. Step 1 and
  -- non-grouped tasks are never blocked. Legacy
  -- workflow_instance_id chains are not touched.
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
    LIMIT 1;

    IF v_prev_status IS NULL OR v_prev_status <> 'completed' THEN
      RAISE EXCEPTION 'WORKFLOW_PREVIOUS_STEP_NOT_COMPLETED';
    END IF;
  END IF;
  ---------------------------------------------------------------

  IF v_task.task_type = 'call' THEN
    SELECT value_json INTO v_valid_outcomes
    FROM crm.settings
    WHERE setting_key = 'call.outcomes' AND is_active = true;
  ELSIF v_task.task_type IN ('sms','whatsapp','email') THEN
    SELECT value_json INTO v_valid_outcomes
    FROM crm.settings
    WHERE setting_key = 'message.outcomes' AND is_active = true;
  ELSE
    v_valid_outcomes := NULL;
  END IF;

  IF p_outcome_code IS NOT NULL THEN
    IF v_valid_outcomes IS NULL THEN
      RAISE EXCEPTION 'OUTCOME_NOT_ALLOWED_FOR_TASK_TYPE';
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements_text(v_valid_outcomes->'values') AS x(value)
      WHERE x.value = p_outcome_code
    ) THEN
      RAISE EXCEPTION 'INVALID_OUTCOME_CODE';
    END IF;
  END IF;

  v_activity_type := COALESCE(p_activity_type, v_task.task_type);

  IF NOT EXISTS (
    SELECT 1
    FROM crm.settings s,
         jsonb_array_elements_text(s.value_json->'values') AS x(value)
    WHERE s.setting_key = 'activity.types'
      AND s.is_active = true
      AND x.value = v_activity_type
  ) THEN
    RAISE EXCEPTION 'INVALID_ACTIVITY_TYPE';
  END IF;

  UPDATE crm.tasks
  SET
    status = 'completed',
    completed_at = p_completed_at,
    outcome_code = p_outcome_code,
    updated_at = now(),
    metadata = COALESCE(metadata, '{}'::jsonb)
      || jsonb_build_object(
        'completed_by_user_id', p_completed_by_user_id,
        'completion_notes', p_notes
      )
  WHERE id = p_task_id;

  -- Re-read after update so tail-calls see canonical state
  SELECT * INTO v_task FROM crm.tasks WHERE id = p_task_id;

  IF p_create_activity THEN
    INSERT INTO crm.activities (
      lead_id, person_id, object_id, task_id,
      activity_type, activity_at, performed_by_user_id,
      summary, outcome_code, communication_basis, metadata
    ) VALUES (
      v_task.lead_id, v_task.person_id, v_task.object_id, v_task.id,
      v_activity_type, p_completed_at, p_completed_by_user_id,
      p_summary, p_outcome_code, p_communication_basis,
      COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object('notes', p_notes)
    )
    RETURNING id INTO v_activity_id;

    INSERT INTO crm.task_relations (
      lead_id, from_kind, from_id, to_kind, to_id, relation_type, metadata, created_by
    ) VALUES (
      v_task.lead_id, 'task', v_task.id, 'activity', v_activity_id, 'follows',
      '{}'::jsonb,
      CASE
        WHEN EXISTS (SELECT 1 FROM crm.profiles p WHERE p.id = p_completed_by_user_id)
          THEN p_completed_by_user_id
        ELSE NULL
      END
    );
  END IF;

  IF p_outcome_code IS NOT NULL THEN
    v_outcome_result := crm.rpc_apply_outcome_action(
      p_lead_id := v_task.lead_id,
      p_outcome_code := p_outcome_code,
      p_source_task_id := v_task.id,
      p_source_activity_id := v_activity_id,
      p_actor_user_id := p_completed_by_user_id,
      p_metadata := COALESCE(p_metadata, '{}'::jsonb)
    );
    v_status_applied := v_outcome_result ->> 'status_applied';
  END IF;

  INSERT INTO crm.audit_events (
    entity_type, entity_id, action_type, source_type,
    event_key, event_name, after_data, actor_user_id, metadata
  ) VALUES (
    'task', v_task.id, 'update', 'manual',
    'task_completed', 'Task completed',
    jsonb_build_object('status','completed','outcome_code',p_outcome_code,'activity_id',v_activity_id),
    CASE
      WHEN EXISTS (SELECT 1 FROM crm.profiles p WHERE p.id = p_completed_by_user_id)
        THEN p_completed_by_user_id
      ELSE NULL
    END,
    COALESCE(p_metadata, '{}'::jsonb)
  );

  PERFORM crm.rpc_recompute_dependent_tasks(v_task.id);

  -- Guarded tail-call: spawn next workflow task
  BEGIN
    PERFORM crm.rpc_spawn_next_workflow_task(v_task.id);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO crm.audit_events (
      entity_type, entity_id, action_type, source_type,
      event_key, event_name, actor_user_id, metadata
    ) VALUES (
      'task', v_task.id, 'update', 'automation',
      'workflow_task_spawn_failed', 'Workflow spawn failed',
      CASE
        WHEN EXISTS (SELECT 1 FROM crm.profiles p WHERE p.id = p_completed_by_user_id)
          THEN p_completed_by_user_id
        ELSE NULL
      END,
      jsonb_build_object(
        'sqlstate', SQLSTATE,
        'sqlerrm', SQLERRM,
        'completed_task_id', v_task.id
      )
    );
  END;

  RETURN jsonb_build_object(
    'success', true,
    'task_id', v_task.id,
    'activity_id', v_activity_id,
    'outcome_code', p_outcome_code,
    'status_applied', v_status_applied
  );
END;
$function$;