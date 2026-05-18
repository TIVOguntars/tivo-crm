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
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = crm, public
AS $$
DECLARE
  v_task crm.tasks%ROWTYPE;
  v_activity_id uuid;
  v_activity_type text;
  v_valid_outcomes jsonb;
  v_status_map jsonb;
  v_new_status text;
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

  IF v_task.task_type = 'call' THEN
    SELECT value_json
    INTO v_valid_outcomes
    FROM crm.settings
    WHERE setting_key = 'call.outcomes'
      AND is_active = true;
  ELSIF v_task.task_type IN ('sms', 'whatsapp', 'email') THEN
    SELECT value_json
    INTO v_valid_outcomes
    FROM crm.settings
    WHERE setting_key = 'message.outcomes'
      AND is_active = true;
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

  IF p_create_activity THEN
    INSERT INTO crm.activities (
      lead_id,
      person_id,
      object_id,
      task_id,
      activity_type,
      activity_at,
      performed_by_user_id,
      summary,
      outcome_code,
      communication_basis,
      metadata
    )
    VALUES (
      v_task.lead_id,
      v_task.person_id,
      v_task.object_id,
      v_task.id,
      v_activity_type,
      p_completed_at,
      p_completed_by_user_id,
      p_summary,
      p_outcome_code,
      p_communication_basis,
      COALESCE(p_metadata, '{}'::jsonb)
        || jsonb_build_object('notes', p_notes)
    )
    RETURNING id INTO v_activity_id;

    INSERT INTO crm.task_relations (
      lead_id,
      from_kind,
      from_id,
      to_kind,
      to_id,
      relation_type,
      metadata,
      created_by
    )
    VALUES (
      v_task.lead_id,
      'task',
      v_task.id,
      'activity',
      v_activity_id,
      'follows',
      '{}'::jsonb,
      p_completed_by_user_id
    );
  END IF;

  SELECT value_json
  INTO v_status_map
  FROM crm.settings
  WHERE setting_key = 'status.on_outcome'
    AND is_active = true;

  v_new_status := v_status_map ->> p_outcome_code;

  IF v_new_status IS NOT NULL THEN
    PERFORM crm.rpc_change_lead_status(
      p_lead_id := v_task.lead_id,
      p_new_status := v_new_status,
      p_reason := 'Outcome from completed task',
      p_changed_by_user_id := p_completed_by_user_id,
      p_create_activity := true,
      p_metadata := jsonb_build_object(
        'source_task_id', v_task.id,
        'source_activity_id', v_activity_id,
        'outcome_code', p_outcome_code
      )
    );
  END IF;

  INSERT INTO crm.audit_events (
    entity_type,
    entity_id,
    action_type,
    source_type,
    event_key,
    event_name,
    after_data,
    actor_user_id,
    metadata
  )
  VALUES (
    'task',
    v_task.id,
    'update',
    'manual',
    'task_completed',
    'Task completed',
    jsonb_build_object(
      'status', 'completed',
      'outcome_code', p_outcome_code,
      'activity_id', v_activity_id
    ),
    p_completed_by_user_id,
    COALESCE(p_metadata, '{}'::jsonb)
  );

  RETURN jsonb_build_object(
    'success', true,
    'task_id', v_task.id,
    'activity_id', v_activity_id,
    'outcome_code', p_outcome_code,
    'status_applied', v_new_status
  );
END;
$$;

REVOKE ALL ON FUNCTION crm.rpc_complete_task(uuid, timestamptz, uuid, text, text, text, boolean, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION crm.rpc_complete_task(uuid, timestamptz, uuid, text, text, text, boolean, text, text, jsonb) TO authenticated, service_role;