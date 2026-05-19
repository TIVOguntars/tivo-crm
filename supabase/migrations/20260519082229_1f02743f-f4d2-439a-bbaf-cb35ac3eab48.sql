
-- 1) Idempotency: partial unique index on (workflow_instance_id, step)
CREATE UNIQUE INDEX IF NOT EXISTS tasks_workflow_step_uniq
  ON crm.tasks (workflow_instance_id, ((metadata->'workflow'->>'step')))
  WHERE workflow_instance_id IS NOT NULL AND status <> 'cancelled';

-- 2) Spawn function
CREATE OR REPLACE FUNCTION crm.rpc_spawn_next_workflow_task(p_completed_task_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'crm','public'
AS $fn$
DECLARE
  v_parent          crm.tasks%ROWTYPE;
  v_templates       jsonb;
  v_template        jsonb;
  v_template_key    text;
  v_parent_step     int;
  v_child_step      int;
  v_child_step_def  jsonb;
  v_child_task_type text;
  v_owner_code      text;
  v_assigned        uuid;
  v_defaults        jsonb;
  v_type_defaults   jsonb;
  v_anchor_event    text;
  v_offset_days     int;
  v_anchor_ts       timestamptz;
  v_due_at          timestamptz;
  v_existing_id     uuid;
  v_new_task_id     uuid;
  v_new_instance_id uuid;
  v_priority        text;
  v_server_folder   text;
  v_audit_reason    text;
BEGIN
  IF p_completed_task_id IS NULL THEN
    RETURN jsonb_build_object('spawned', false, 'reason', 'null_input');
  END IF;

  SELECT * INTO v_parent FROM crm.tasks WHERE id = p_completed_task_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('spawned', false, 'reason', 'parent_not_found');
  END IF;

  IF v_parent.status <> 'completed' THEN
    RETURN jsonb_build_object('spawned', false, 'reason', 'parent_not_completed');
  END IF;

  v_template_key := v_parent.metadata->'workflow'->>'template_key';
  v_parent_step  := NULLIF(v_parent.metadata->'workflow'->>'step','')::int;

  IF v_template_key IS NULL OR v_parent_step IS NULL THEN
    RETURN jsonb_build_object('spawned', false, 'reason', 'parent_not_in_workflow');
  END IF;

  SELECT value_json INTO v_templates
  FROM crm.settings
  WHERE setting_key = 'workflow.templates' AND is_active = true;

  v_template := v_templates -> v_template_key;
  IF v_template IS NULL THEN
    RETURN jsonb_build_object('spawned', false, 'reason', 'template_not_found');
  END IF;

  v_child_step := v_parent_step + 1;

  SELECT s INTO v_child_step_def
  FROM jsonb_array_elements(v_template->'steps') AS s
  WHERE (s->>'step')::int = v_child_step;

  IF v_child_step_def IS NULL THEN
    RETURN jsonb_build_object('spawned', false, 'reason', 'no_next_step',
                              'parent_step', v_parent_step);
  END IF;

  v_child_task_type := v_child_step_def->>'task_type';

  -- Bootstrap workflow_instances row if parent has none yet
  IF v_parent.workflow_instance_id IS NULL THEN
    INSERT INTO crm.workflow_instances (
      workflow_key, workflow_name, entity_type, entity_id,
      status, current_step_key, metadata, created_by
    ) VALUES (
      v_template_key,
      v_template->>'label_lv',
      'lead',
      v_parent.lead_id,
      'running',
      v_parent_step::text,
      jsonb_build_object(
        'root_task_id', v_parent.id,
        'bootstrapped_by', 'rpc_spawn_next_workflow_task'
      ),
      NULLIF(v_parent.metadata->>'completed_by_user_id','')::uuid
    )
    RETURNING id INTO v_new_instance_id;

    UPDATE crm.tasks
       SET workflow_instance_id = v_new_instance_id,
           updated_at = now()
     WHERE id = v_parent.id;

    v_parent.workflow_instance_id := v_new_instance_id;
  END IF;

  -- Idempotency
  SELECT id INTO v_existing_id
  FROM crm.tasks
  WHERE workflow_instance_id = v_parent.workflow_instance_id
    AND (metadata->'workflow'->>'step')::int = v_child_step
    AND status <> 'cancelled'
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RETURN jsonb_build_object('spawned', false, 'reason', 'already_exists',
                              'existing_task_id', v_existing_id,
                              'workflow_instance_id', v_parent.workflow_instance_id);
  END IF;

  -- Owner resolution
  SELECT value_json INTO v_defaults
  FROM crm.settings
  WHERE setting_key = 'workflow.task_type_defaults' AND is_active = true;
  v_type_defaults := COALESCE(v_defaults -> v_child_task_type, '{}'::jsonb);

  v_assigned := NULLIF(v_parent.metadata->'workflow'->>'override_owner_user_id','')::uuid;

  IF v_assigned IS NULL THEN
    v_owner_code := COALESCE(
      v_child_step_def->>'owner_code',
      v_type_defaults->>'default_owner_code'
    );
    IF v_owner_code IS NOT NULL THEN
      SELECT id INTO v_assigned
      FROM crm.profiles
      WHERE user_code = v_owner_code
        AND COALESCE(is_active, true) = true
      ORDER BY created_at ASC
      LIMIT 1;
    END IF;
  END IF;

  IF v_assigned IS NULL THEN
    v_assigned := v_parent.assigned_user_id;
  END IF;

  IF v_assigned IS NULL THEN
    v_audit_reason := 'owner_unresolved';
  END IF;

  v_priority := COALESCE(v_type_defaults->>'default_priority', v_parent.priority, 'medium');

  -- Due date
  v_anchor_event := COALESCE(v_child_step_def->>'anchor_event','completed_at');
  v_offset_days  := COALESCE((v_child_step_def->>'offset_days')::int, 0);
  v_anchor_ts := CASE v_anchor_event
    WHEN 'completed_at' THEN v_parent.completed_at
    WHEN 'due_at'       THEN v_parent.due_at
    WHEN 'started_at'   THEN v_parent.started_at
    ELSE v_parent.completed_at
  END;
  v_due_at := v_anchor_ts + make_interval(days => v_offset_days);

  v_server_folder := v_parent.metadata->'workflow'->>'server_folder_url';

  -- Insert child task
  INSERT INTO crm.tasks (
    lead_id, person_id, object_id, parent_task_id,
    task_type, status, priority,
    assigned_user_id, created_by_user_id,
    title, due_at, is_auto_created,
    workflow_instance_id, metadata
  )
  VALUES (
    v_parent.lead_id, v_parent.person_id, v_parent.object_id, v_parent.id,
    v_child_task_type, 'planned', v_priority,
    v_assigned,
    NULLIF(v_parent.metadata->>'completed_by_user_id','')::uuid,
    v_child_task_type,
    v_due_at,
    true,
    v_parent.workflow_instance_id,
    jsonb_build_object(
      'workflow', jsonb_build_object(
        'template_key', v_template_key,
        'step', v_child_step,
        'spawned_from_task_id', v_parent.id,
        'server_folder_url', v_server_folder,
        'automatic_spawn', true
      )
    )
  )
  RETURNING id INTO v_new_task_id;

  -- Sequence edge
  INSERT INTO crm.task_relations (
    lead_id, from_kind, from_id, to_kind, to_id, relation_type, metadata
  ) VALUES (
    v_parent.lead_id, 'task', v_parent.id, 'task', v_new_task_id, 'sequence_next',
    jsonb_build_object(
      'template_key', v_template_key,
      'parent_step', v_parent_step,
      'child_step', v_child_step,
      'automatic_spawn', true,
      'spawn_on', 'completed'
    )
  );

  -- Schedule anchor edge (no dynamic recalc; completed_at is the real anchor)
  INSERT INTO crm.task_relations (
    lead_id, from_kind, from_id, to_kind, to_id, relation_type, metadata
  ) VALUES (
    v_parent.lead_id, 'task', v_parent.id, 'task', v_new_task_id, 'schedule_anchor_after',
    jsonb_build_object(
      'anchor_event', v_anchor_event,
      'offset_minutes', v_offset_days * 1440,
      'dynamic_recalc', false,
      'cancel_with_anchor', false
    )
  );

  -- Audit
  INSERT INTO crm.audit_events (
    entity_type, entity_id, action_type, source_type,
    event_key, event_name, after_data, actor_user_id, reason, metadata
  ) VALUES (
    'task', v_new_task_id, 'create', 'automation',
    'workflow_task_spawned', 'Workflow next task spawned',
    jsonb_build_object(
      'task_type', v_child_task_type,
      'status', 'planned',
      'due_at', v_due_at,
      'assigned_user_id', v_assigned,
      'priority', v_priority
    ),
    NULL,
    v_audit_reason,
    jsonb_build_object(
      'template_key', v_template_key,
      'parent_step', v_parent_step,
      'child_step', v_child_step,
      'spawned_from_task_id', v_parent.id,
      'workflow_instance_id', v_parent.workflow_instance_id,
      'automatic_spawn', true
    )
  );

  RETURN jsonb_build_object(
    'spawned', true,
    'child_task_id', v_new_task_id,
    'workflow_instance_id', v_parent.workflow_instance_id,
    'step', v_child_step,
    'reason', v_audit_reason
  );
END;
$fn$;

-- 3) rpc_complete_task — body extended with guarded tail-call to spawn
CREATE OR REPLACE FUNCTION crm.rpc_complete_task(
  p_task_id uuid,
  p_completed_at timestamp with time zone DEFAULT now(),
  p_completed_by_user_id uuid DEFAULT auth.uid(),
  p_outcome_code text DEFAULT NULL::text,
  p_summary text DEFAULT NULL::text,
  p_notes text DEFAULT NULL::text,
  p_create_activity boolean DEFAULT true,
  p_activity_type text DEFAULT NULL::text,
  p_communication_basis text DEFAULT NULL::text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'crm','public'
AS $fn$
DECLARE
  v_task crm.tasks%ROWTYPE;
  v_activity_id uuid;
  v_activity_type text;
  v_valid_outcomes jsonb;
  v_outcome_result jsonb;
  v_status_applied text;
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
$fn$;

-- 4) Grants
GRANT EXECUTE ON FUNCTION crm.rpc_spawn_next_workflow_task(uuid)
  TO authenticated, service_role;
