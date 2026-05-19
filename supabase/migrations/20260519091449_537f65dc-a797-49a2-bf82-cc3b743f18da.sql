CREATE OR REPLACE FUNCTION crm.rpc_create_task(p_lead_id uuid, p_task_type text, p_due_at timestamp with time zone, p_title text, p_description text DEFAULT NULL::text, p_assigned_user_id uuid DEFAULT NULL::uuid, p_required_role text DEFAULT NULL::text, p_workflow_instance_id uuid DEFAULT NULL::uuid, p_parent_task_id uuid DEFAULT NULL::uuid, p_metadata jsonb DEFAULT '{}'::jsonb, p_is_auto_created boolean DEFAULT false, p_priority text DEFAULT 'normal'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'crm', 'public', 'extensions'
AS $function$
DECLARE
  v_task_id          uuid;
  v_assigned_user_id uuid := p_assigned_user_id;
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

  -- Canonical source for allowed task types: crm.task_types (is_active = true)
  IF NOT EXISTS (
    SELECT 1 FROM crm.task_types
    WHERE type_key = p_task_type AND COALESCE(is_active, true) = true
  ) THEN
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
$function$;