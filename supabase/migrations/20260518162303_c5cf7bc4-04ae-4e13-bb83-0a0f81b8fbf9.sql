-- ============================================================
-- RPC 1: rpc_resolve_assigned_user (strict multi-user handling)
-- ============================================================
CREATE OR REPLACE FUNCTION crm.rpc_resolve_assigned_user(
  p_lead_id        uuid,
  p_required_role  text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = crm, public, extensions
AS $$
DECLARE
  v_user_id  uuid;
  v_role_key text;
  v_count    integer;
BEGIN
  IF p_required_role IS NULL OR length(trim(p_required_role)) = 0 THEN
    RAISE EXCEPTION 'p_required_role is required' USING ERRCODE = '22023';
  END IF;

  IF p_required_role = 'PPV' THEN
    IF p_lead_id IS NULL THEN
      RAISE EXCEPTION 'p_lead_id required for PPV role' USING ERRCODE = '22023';
    END IF;
    SELECT l.ppv_user_id INTO v_user_id FROM crm.leads l WHERE l.id = p_lead_id;
    IF v_user_id IS NULL THEN
      RAISE EXCEPTION 'No PPV user assigned to lead %', p_lead_id USING ERRCODE = 'P0002';
    END IF;
    RETURN v_user_id;
  END IF;

  v_role_key := CASE p_required_role
    WHEN 'Mārketings'   THEN 'marketing'
    WHEN 'Projektētājs' THEN 'designer'
    WHEN 'Tāmētājs'     THEN 'estimator'
    ELSE NULL
  END;

  IF v_role_key IS NULL THEN
    SELECT r.role_key INTO v_role_key
    FROM crm.roles r
    WHERE lower(r.role_key)  = lower(p_required_role)
       OR lower(r.role_name) = lower(p_required_role)
    LIMIT 1;
  END IF;

  IF v_role_key IS NULL OR NOT EXISTS (SELECT 1 FROM crm.roles WHERE role_key = v_role_key) THEN
    RAISE EXCEPTION 'Unknown required_role: %', p_required_role USING ERRCODE = '22023';
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM crm.user_roles ur
  JOIN crm.roles    r ON r.id = ur.role_id
  JOIN crm.profiles p ON p.id = ur.user_id
  WHERE r.role_key = v_role_key
    AND COALESCE(p.is_active, true) = true;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'No active user found for role %', p_required_role USING ERRCODE = 'P0002';
  ELSIF v_count > 1 THEN
    RAISE EXCEPTION 'Multiple users for role; explicit assignment required' USING ERRCODE = 'P0001';
  END IF;

  SELECT p.id INTO v_user_id
  FROM crm.user_roles ur
  JOIN crm.roles    r ON r.id = ur.role_id
  JOIN crm.profiles p ON p.id = ur.user_id
  WHERE r.role_key = v_role_key
    AND COALESCE(p.is_active, true) = true
  LIMIT 1;

  RETURN v_user_id;
END;
$$;

REVOKE ALL ON FUNCTION crm.rpc_resolve_assigned_user(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION crm.rpc_resolve_assigned_user(uuid, text) TO authenticated, service_role;


-- ============================================================
-- RPC 2: rpc_create_task (now with p_priority)
-- ============================================================
CREATE OR REPLACE FUNCTION crm.rpc_create_task(
  p_lead_id               uuid,
  p_task_type             text,
  p_due_at                timestamptz,
  p_title                 text,
  p_description           text     DEFAULT NULL,
  p_assigned_user_id      uuid     DEFAULT NULL,
  p_required_role         text     DEFAULT NULL,
  p_workflow_instance_id  uuid     DEFAULT NULL,
  p_parent_task_id        uuid     DEFAULT NULL,
  p_metadata              jsonb    DEFAULT '{}'::jsonb,
  p_is_auto_created       boolean  DEFAULT false,
  p_priority              text     DEFAULT 'normal'
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = crm, public, extensions
AS $$
DECLARE
  v_task_id          uuid;
  v_assigned_user_id uuid := p_assigned_user_id;
  v_allowed          jsonb;
  v_actor            uuid := auth.uid();
BEGIN
  IF p_lead_id IS NULL THEN
    RAISE EXCEPTION 'p_lead_id is required' USING ERRCODE = '22023';
  END IF;
  IF p_task_type IS NULL OR length(trim(p_task_type)) = 0 THEN
    RAISE EXCEPTION 'p_task_type is required' USING ERRCODE = '22023';
  END IF;
  IF p_title IS NULL OR length(trim(p_title)) = 0 THEN
    RAISE EXCEPTION 'p_title is required' USING ERRCODE = '22023';
  END IF;
  IF length(p_title) > 500 THEN
    RAISE EXCEPTION 'p_title too long (max 500 chars)' USING ERRCODE = '22023';
  END IF;
  IF p_priority IS NULL OR length(trim(p_priority)) = 0 THEN
    RAISE EXCEPTION 'p_priority is required' USING ERRCODE = '22023';
  END IF;
  IF length(p_priority) > 32 THEN
    RAISE EXCEPTION 'p_priority too long (max 32 chars)' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM crm.leads WHERE id = p_lead_id) THEN
    RAISE EXCEPTION 'lead % not found', p_lead_id USING ERRCODE = 'P0002';
  END IF;
  IF p_parent_task_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM crm.tasks WHERE id = p_parent_task_id) THEN
    RAISE EXCEPTION 'parent_task_id % not found', p_parent_task_id USING ERRCODE = 'P0002';
  END IF;
  IF p_workflow_instance_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM crm.workflow_instances WHERE id = p_workflow_instance_id) THEN
    RAISE EXCEPTION 'workflow_instance % not found', p_workflow_instance_id USING ERRCODE = 'P0002';
  END IF;

  SELECT value_json->'values' INTO v_allowed
  FROM crm.settings WHERE setting_key = 'task.types' AND is_active = true;
  IF v_allowed IS NULL THEN
    RAISE EXCEPTION 'setting task.types missing' USING ERRCODE = 'P0002';
  END IF;
  IF NOT (v_allowed ? p_task_type) THEN
    RAISE EXCEPTION 'invalid task_type: %', p_task_type USING ERRCODE = '22023';
  END IF;

  IF v_assigned_user_id IS NULL AND p_required_role IS NOT NULL THEN
    v_assigned_user_id := crm.rpc_resolve_assigned_user(p_lead_id, p_required_role);
  END IF;

  IF v_assigned_user_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM crm.profiles
       WHERE id = v_assigned_user_id AND COALESCE(is_active, true) = true
     ) THEN
    RAISE EXCEPTION 'assigned_user_id % not found or inactive', v_assigned_user_id USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO crm.tasks (
    lead_id, parent_task_id, task_type, status, priority,
    assigned_user_id, created_by_user_id, title, description, due_at,
    is_auto_created, metadata, required_role, workflow_instance_id
  ) VALUES (
    p_lead_id, p_parent_task_id, p_task_type, 'planned', p_priority,
    v_assigned_user_id, v_actor, p_title, p_description, p_due_at,
    p_is_auto_created, COALESCE(p_metadata, '{}'::jsonb), p_required_role, p_workflow_instance_id
  )
  RETURNING id INTO v_task_id;

  PERFORM crm.create_audit_event(
    'task', v_task_id, 'create', 'rpc',
    'task.created', 'Task created', NULL,
    NULL,
    jsonb_build_object(
      'lead_id', p_lead_id, 'task_type', p_task_type, 'title', p_title,
      'priority', p_priority,
      'assigned_user_id', v_assigned_user_id, 'required_role', p_required_role,
      'workflow_instance_id', p_workflow_instance_id, 'is_auto_created', p_is_auto_created
    ),
    NULL, v_actor, NULL, NULL, NULL, 'rpc_create_task',
    NULL, NULL, NULL, NULL, COALESCE(p_metadata, '{}'::jsonb)
  );

  RETURN v_task_id;
END;
$$;

REVOKE ALL ON FUNCTION crm.rpc_create_task(uuid, text, timestamptz, text, text, uuid, text, uuid, uuid, jsonb, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION crm.rpc_create_task(uuid, text, timestamptz, text, text, uuid, text, uuid, uuid, jsonb, boolean, text) TO authenticated, service_role;


-- ============================================================
-- RPC 3: rpc_log_activity (outcome validation + task_relations link)
-- ============================================================
CREATE OR REPLACE FUNCTION crm.rpc_log_activity(
  p_lead_id                 uuid,
  p_activity_type           text,
  p_activity_at             timestamptz,
  p_summary                 text,
  p_task_id                 uuid     DEFAULT NULL,
  p_communication_id        uuid     DEFAULT NULL,
  p_performed_by_user_id    uuid     DEFAULT NULL,
  p_outcome_code            text     DEFAULT NULL,
  p_communication_basis     text     DEFAULT NULL,
  p_metadata                jsonb    DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = crm, public, extensions
AS $$
DECLARE
  v_activity_id     uuid;
  v_allowed_type    jsonb;
  v_outcome_setting text;
  v_outcome_allowed jsonb;
  v_actor           uuid := COALESCE(p_performed_by_user_id, auth.uid());
BEGIN
  IF p_lead_id IS NULL THEN
    RAISE EXCEPTION 'p_lead_id is required' USING ERRCODE = '22023';
  END IF;
  IF p_activity_type IS NULL OR length(trim(p_activity_type)) = 0 THEN
    RAISE EXCEPTION 'p_activity_type is required' USING ERRCODE = '22023';
  END IF;
  IF p_summary IS NOT NULL AND length(p_summary) > 2000 THEN
    RAISE EXCEPTION 'p_summary too long (max 2000 chars)' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM crm.leads WHERE id = p_lead_id) THEN
    RAISE EXCEPTION 'lead % not found', p_lead_id USING ERRCODE = 'P0002';
  END IF;
  IF p_task_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM crm.tasks WHERE id = p_task_id) THEN
    RAISE EXCEPTION 'task % not found', p_task_id USING ERRCODE = 'P0002';
  END IF;
  IF p_communication_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM crm.communications WHERE id = p_communication_id) THEN
    RAISE EXCEPTION 'communication % not found', p_communication_id USING ERRCODE = 'P0002';
  END IF;

  SELECT value_json->'values' INTO v_allowed_type
  FROM crm.settings WHERE setting_key = 'activity.types' AND is_active = true;
  IF v_allowed_type IS NULL THEN
    RAISE EXCEPTION 'setting activity.types missing' USING ERRCODE = 'P0002';
  END IF;
  IF NOT (v_allowed_type ? p_activity_type) THEN
    RAISE EXCEPTION 'invalid activity_type: %', p_activity_type USING ERRCODE = '22023';
  END IF;

  -- outcome_code validation against settings
  IF p_outcome_code IS NOT NULL THEN
    v_outcome_setting := CASE
      WHEN p_activity_type = 'call'                          THEN 'call.outcomes'
      WHEN p_activity_type IN ('sms','whatsapp','email')     THEN 'message.outcomes'
      ELSE NULL
    END;

    IF v_outcome_setting IS NULL THEN
      RAISE EXCEPTION 'outcome_code not allowed for activity_type %', p_activity_type USING ERRCODE = '22023';
    END IF;

    SELECT value_json->'values' INTO v_outcome_allowed
    FROM crm.settings WHERE setting_key = v_outcome_setting AND is_active = true;
    IF v_outcome_allowed IS NULL THEN
      RAISE EXCEPTION 'setting % missing', v_outcome_setting USING ERRCODE = 'P0002';
    END IF;
    IF NOT (v_outcome_allowed ? p_outcome_code) THEN
      RAISE EXCEPTION 'invalid outcome_code % for %', p_outcome_code, p_activity_type USING ERRCODE = '22023';
    END IF;
  END IF;

  INSERT INTO crm.activities (
    lead_id, task_id, communication_id, activity_type, activity_at,
    performed_by_user_id, summary, metadata, outcome_code, communication_basis
  ) VALUES (
    p_lead_id, p_task_id, p_communication_id, p_activity_type,
    COALESCE(p_activity_at, now()),
    v_actor, p_summary, COALESCE(p_metadata, '{}'::jsonb),
    p_outcome_code, p_communication_basis
  )
  RETURNING id INTO v_activity_id;

  -- Link to task via task_relations graph
  IF p_task_id IS NOT NULL THEN
    INSERT INTO crm.task_relations (
      lead_id, from_kind, from_id, to_kind, to_id, relation_type, metadata, created_by
    ) VALUES (
      p_lead_id, 'task', p_task_id, 'activity', v_activity_id, 'follows',
      jsonb_build_object('source','rpc_log_activity'), v_actor
    )
    ON CONFLICT (from_kind, from_id, to_kind, to_id, relation_type) DO NOTHING;
  END IF;

  PERFORM crm.create_audit_event(
    'activity', v_activity_id, 'create', 'rpc',
    'activity.logged', 'Activity logged', NULL,
    NULL,
    jsonb_build_object(
      'lead_id', p_lead_id, 'activity_type', p_activity_type,
      'task_id', p_task_id, 'communication_id', p_communication_id,
      'outcome_code', p_outcome_code, 'communication_basis', p_communication_basis
    ),
    NULL, v_actor, NULL, NULL, NULL, 'rpc_log_activity',
    NULL, NULL, NULL, NULL, COALESCE(p_metadata, '{}'::jsonb)
  );

  RETURN v_activity_id;
END;
$$;

REVOKE ALL ON FUNCTION crm.rpc_log_activity(uuid, text, timestamptz, text, uuid, uuid, uuid, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION crm.rpc_log_activity(uuid, text, timestamptz, text, uuid, uuid, uuid, text, text, jsonb) TO authenticated, service_role;