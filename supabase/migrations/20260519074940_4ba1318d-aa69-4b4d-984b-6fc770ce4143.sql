
-- =========================================================================
-- Phase 2b.1 — Workflow foundations (additive)
-- =========================================================================

-- 1) Widen relation_type CHECK on crm.task_relations (additive widening)
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

-- 2) Seed 3 new rows into crm.task_types (idempotent)
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

-- 3) Seed workflow settings rows (idempotent)
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

-- 4) New resolver: recompute or cancel direct dependents of an anchor task
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

    IF v_dep.status IN ('completed','cancelled','skipped','failed') THEN
      CONTINUE;
    END IF;

    v_cancel_with := COALESCE((v_rel.metadata->>'cancel_with_anchor')::boolean, false);

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

    v_anchor_event   := COALESCE(v_rel.metadata->>'anchor_event','completed_at');
    v_offset_minutes := COALESCE((v_rel.metadata->>'offset_minutes')::int, 0);

    v_anchor_ts := CASE v_anchor_event
      WHEN 'completed_at' THEN v_anchor.completed_at
      WHEN 'due_at'       THEN v_anchor.due_at
      WHEN 'started_at'   THEN v_anchor.started_at
      ELSE NULL
    END;

    IF v_anchor_ts IS NULL THEN
      CONTINUE;
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
--    Bodies are byte-for-byte the current production bodies with one
--    PERFORM line added before the final RETURN. Signatures unchanged.

-- 5a) rpc_complete_task
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
SET search_path TO 'crm', 'public'
AS $function$
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
      CASE
        WHEN EXISTS (
          SELECT 1
          FROM crm.profiles p
          WHERE p.id = p_completed_by_user_id
        )
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
    CASE
      WHEN EXISTS (
        SELECT 1
        FROM crm.profiles p
        WHERE p.id = p_completed_by_user_id
      )
      THEN p_completed_by_user_id
      ELSE NULL
    END,
    COALESCE(p_metadata, '{}'::jsonb)
  );

  PERFORM crm.rpc_recompute_dependent_tasks(v_task.id);

  RETURN jsonb_build_object(
    'success', true,
    'task_id', v_task.id,
    'activity_id', v_activity_id,
    'outcome_code', p_outcome_code,
    'status_applied', v_status_applied
  );
END;
$function$;

-- 5b) rpc_reschedule_task
CREATE OR REPLACE FUNCTION crm.rpc_reschedule_task(
  p_task_id uuid,
  p_new_due_at timestamp with time zone,
  p_reason text DEFAULT NULL::text,
  p_rescheduled_by_user_id uuid DEFAULT auth.uid(),
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'crm', 'public'
AS $function$
DECLARE
  v_task crm.tasks%ROWTYPE;
  v_previous_due_at timestamptz;
  v_activity_id uuid;
BEGIN
  IF p_task_id IS NULL THEN
    RAISE EXCEPTION 'TASK_ID_REQUIRED';
  END IF;
  IF p_new_due_at IS NULL THEN
    RAISE EXCEPTION 'NEW_DUE_AT_REQUIRED';
  END IF;

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

  v_previous_due_at := v_task.due_at;

  UPDATE crm.tasks
  SET
    due_at = p_new_due_at,
    status = 'in_progress',
    updated_at = now(),
    metadata = COALESCE(metadata, '{}'::jsonb)
      || jsonb_build_object(
        'last_rescheduled_at', now(),
        'last_rescheduled_by_user_id', p_rescheduled_by_user_id,
        'last_reschedule_reason', p_reason,
        'previous_due_at', v_previous_due_at,
        'new_due_at', p_new_due_at
      )
  WHERE id = p_task_id;

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
    'note',
    now(),
    p_rescheduled_by_user_id,
    'Task rescheduled',
    NULL,
    NULL,
    COALESCE(p_metadata, '{}'::jsonb)
      || jsonb_build_object(
        'event_type', 'rescheduled',
        'previous_due_at', v_previous_due_at,
        'new_due_at', p_new_due_at,
        'reason', p_reason
      )
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
    jsonb_build_object('event_type', 'rescheduled'),
    p_rescheduled_by_user_id
  );

  INSERT INTO crm.audit_events (
    entity_type,
    entity_id,
    action_type,
    source_type,
    event_key,
    event_name,
    before_data,
    after_data,
    changed_fields,
    actor_user_id,
    reason,
    metadata
  )
  VALUES (
    'task',
    v_task.id,
    'update',
    'manual',
    'task_rescheduled',
    'Task rescheduled',
    jsonb_build_object(
      'due_at', v_previous_due_at,
      'status', v_task.status
    ),
    jsonb_build_object(
      'due_at', p_new_due_at,
      'status', 'in_progress'
    ),
    jsonb_build_array('due_at', 'status'),
    p_rescheduled_by_user_id,
    p_reason,
    COALESCE(p_metadata, '{}'::jsonb)
  );

  PERFORM crm.rpc_recompute_dependent_tasks(v_task.id);

  RETURN jsonb_build_object(
    'success', true,
    'task_id', v_task.id,
    'activity_id', v_activity_id,
    'previous_due_at', v_previous_due_at,
    'new_due_at', p_new_due_at,
    'status', 'in_progress'
  );
END;
$function$;

-- 5c) rpc_cancel_task
CREATE OR REPLACE FUNCTION crm.rpc_cancel_task(
  p_task_id uuid,
  p_cancelled_reason text,
  p_cancelled_by_user_id uuid DEFAULT auth.uid(),
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'crm', 'public'
AS $function$
DECLARE
  v_task crm.tasks%ROWTYPE;
  v_activity_id uuid;
BEGIN
  IF p_task_id IS NULL THEN
    RAISE EXCEPTION 'TASK_ID_REQUIRED';
  END IF;
  IF p_cancelled_reason IS NULL OR btrim(p_cancelled_reason) = '' THEN
    RAISE EXCEPTION 'CANCELLED_REASON_REQUIRED';
  END IF;

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

  UPDATE crm.tasks
  SET
    status = 'cancelled',
    cancelled_reason = p_cancelled_reason,
    updated_at = now(),
    metadata = COALESCE(metadata, '{}'::jsonb)
      || jsonb_build_object(
        'cancelled_at', now(),
        'cancelled_by_user_id', p_cancelled_by_user_id,
        'cancelled_reason', p_cancelled_reason
      )
  WHERE id = p_task_id;

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
    'note',
    now(),
    p_cancelled_by_user_id,
    'Task cancelled',
    NULL,
    NULL,
    COALESCE(p_metadata, '{}'::jsonb)
      || jsonb_build_object(
        'event_type', 'cancelled',
        'reason', p_cancelled_reason,
        'previous_status', v_task.status
      )
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
    jsonb_build_object('event_type', 'cancelled'),
    p_cancelled_by_user_id
  );

  INSERT INTO crm.audit_events (
    entity_type,
    entity_id,
    action_type,
    source_type,
    event_key,
    event_name,
    before_data,
    after_data,
    changed_fields,
    actor_user_id,
    reason,
    metadata
  )
  VALUES (
    'task',
    v_task.id,
    'update',
    'manual',
    'task_cancelled',
    'Task cancelled',
    jsonb_build_object(
      'status', v_task.status,
      'cancelled_reason', v_task.cancelled_reason
    ),
    jsonb_build_object(
      'status', 'cancelled',
      'cancelled_reason', p_cancelled_reason
    ),
    jsonb_build_array('status', 'cancelled_reason'),
    p_cancelled_by_user_id,
    p_cancelled_reason,
    COALESCE(p_metadata, '{}'::jsonb)
  );

  PERFORM crm.rpc_recompute_dependent_tasks(v_task.id);

  RETURN jsonb_build_object(
    'success', true,
    'task_id', v_task.id,
    'activity_id', v_activity_id,
    'status', 'cancelled',
    'cancelled_reason', p_cancelled_reason
  );
END;
$function$;
