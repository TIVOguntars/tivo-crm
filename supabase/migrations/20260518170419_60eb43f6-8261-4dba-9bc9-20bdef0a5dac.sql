CREATE OR REPLACE FUNCTION crm.rpc_apply_outcome_action(
  p_lead_id uuid,
  p_outcome_code text,
  p_source_task_id uuid DEFAULT NULL,
  p_source_activity_id uuid DEFAULT NULL,
  p_actor_user_id uuid DEFAULT auth.uid(),
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = crm, public
AS $$
DECLARE
  v_status_map jsonb;
  v_new_status text;
  v_change_result jsonb;
BEGIN
  IF p_lead_id IS NULL THEN
    RAISE EXCEPTION 'LEAD_ID_REQUIRED';
  END IF;

  IF p_outcome_code IS NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'action_applied', false,
      'reason', 'NO_OUTCOME_CODE'
    );
  END IF;

  SELECT value_json
  INTO v_status_map
  FROM crm.settings
  WHERE setting_key = 'status.on_outcome'
    AND is_active = true;

  IF v_status_map IS NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'action_applied', false,
      'reason', 'STATUS_ON_OUTCOME_NOT_CONFIGURED'
    );
  END IF;

  v_new_status := v_status_map ->> p_outcome_code;

  IF v_new_status IS NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'action_applied', false,
      'reason', 'NO_ACTION_FOR_OUTCOME',
      'outcome_code', p_outcome_code
    );
  END IF;

  v_change_result := crm.rpc_change_lead_status(
    p_lead_id := p_lead_id,
    p_new_status := v_new_status,
    p_reason := 'Outcome action engine',
    p_changed_by_user_id := p_actor_user_id,
    p_create_activity := true,
    p_metadata := COALESCE(p_metadata, '{}'::jsonb)
      || jsonb_build_object(
        'source', 'rpc_apply_outcome_action',
        'source_task_id', p_source_task_id,
        'source_activity_id', p_source_activity_id,
        'outcome_code', p_outcome_code
      )
  );

  RETURN jsonb_build_object(
    'success', true,
    'action_applied', true,
    'outcome_code', p_outcome_code,
    'status_applied', v_new_status,
    'change_result', v_change_result
  );
END;
$$;

REVOKE ALL ON FUNCTION crm.rpc_apply_outcome_action(
  uuid,
  text,
  uuid,
  uuid,
  uuid,
  jsonb
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION crm.rpc_apply_outcome_action(
  uuid,
  text,
  uuid,
  uuid,
  uuid,
  jsonb
) TO authenticated, service_role;