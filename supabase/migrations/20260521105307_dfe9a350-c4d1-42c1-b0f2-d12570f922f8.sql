
CREATE OR REPLACE FUNCTION crm.rpc_delete_task(p_task_id uuid, p_cascade boolean DEFAULT false, p_deleted_by_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'crm', 'public'
AS $function$
DECLARE
  v_root      crm.tasks%ROWTYPE;
  v_targets   uuid[];
  v_snapshots jsonb;
  v_count     integer;
BEGIN
  SELECT * INTO v_root FROM crm.tasks WHERE id = p_task_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TASK_NOT_FOUND: %', p_task_id;
  END IF;
  IF v_root.status = 'completed' THEN
    RAISE EXCEPTION 'CANNOT_DELETE_COMPLETED_TASK';
  END IF;

  WITH RECURSIVE chain(id, depth) AS (
    SELECT v_root.id, 0
    UNION ALL
    SELECT t.id, c.depth + 1
    FROM crm.tasks t
    JOIN chain c ON t.parent_task_id = c.id
  )
  SELECT array_agg(id ORDER BY depth DESC) INTO v_targets FROM chain;

  IF NOT p_cascade AND array_length(v_targets, 1) > 1 THEN
    RAISE EXCEPTION 'TASK_HAS_FOLLOWUPS: count=%', array_length(v_targets, 1) - 1;
  END IF;

  SELECT jsonb_agg(to_jsonb(t.*) ORDER BY array_position(v_targets, t.id))
    INTO v_snapshots
    FROM crm.tasks t
   WHERE t.id = ANY(v_targets);

  INSERT INTO crm.audit_events(entity_type, entity_id, action_type, source_type, source_system,
                               event_key, before_data, actor_user_id, metadata)
  VALUES ('task', p_task_id, 'delete', 'manual', 'uzdevumi_ui',
          'task.delete',
          jsonb_build_object('cascade', p_cascade, 'deleted_tasks', v_snapshots),
          p_deleted_by_user_id,
          jsonb_build_object('cascade', p_cascade, 'target_count', array_length(v_targets,1)));

  UPDATE crm.activities
     SET task_id = NULL,
         metadata = metadata || jsonb_build_object(
                       'detached_task_id', task_id,
                       'detached_at', now())
   WHERE task_id = ANY(v_targets);

  DELETE FROM crm.tasks WHERE id = ANY(v_targets);
  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'deleted_count', v_count,
    'deleted_task_ids', to_jsonb(v_targets),
    'cascade', p_cascade
  );
END;
$function$;

CREATE OR REPLACE FUNCTION crm.rpc_update_task(p_task_id uuid, p_task_type text DEFAULT NULL::text, p_title text DEFAULT NULL::text, p_description text DEFAULT NULL::text, p_due_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_assigned_user_id uuid DEFAULT NULL::uuid, p_priority text DEFAULT NULL::text, p_metadata_patch jsonb DEFAULT NULL::jsonb, p_notes text DEFAULT NULL::text, p_updated_by_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'crm', 'public'
AS $function$
DECLARE
  v_before        crm.tasks%ROWTYPE;
  v_after         crm.tasks%ROWTYPE;
  v_changed       jsonb := '{}'::jsonb;
  v_summary_parts text[] := ARRAY[]::text[];
BEGIN
  SELECT * INTO v_before FROM crm.tasks WHERE id = p_task_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TASK_NOT_FOUND: %', p_task_id;
  END IF;
  IF v_before.status IN ('completed','cancelled') THEN
    RAISE EXCEPTION 'CANNOT_UPDATE_CLOSED_TASK: status=%', v_before.status;
  END IF;

  UPDATE crm.tasks SET
    task_type        = COALESCE(p_task_type,        task_type),
    title            = COALESCE(p_title,            title),
    description      = COALESCE(p_description,      description),
    due_at           = COALESCE(p_due_at,           due_at),
    assigned_user_id = COALESCE(p_assigned_user_id, assigned_user_id),
    priority         = COALESCE(p_priority,         priority),
    metadata         = CASE WHEN p_metadata_patch IS NULL
                            THEN metadata
                            ELSE metadata || p_metadata_patch END,
    updated_at       = now()
  WHERE id = p_task_id
  RETURNING * INTO v_after;

  IF v_after.task_type        IS DISTINCT FROM v_before.task_type        THEN
    v_changed := v_changed || jsonb_build_object('task_type', jsonb_build_array(v_before.task_type, v_after.task_type));
    v_summary_parts := v_summary_parts || format('tips: %s → %s', v_before.task_type, v_after.task_type);
  END IF;
  IF v_after.title            IS DISTINCT FROM v_before.title            THEN
    v_changed := v_changed || jsonb_build_object('title', jsonb_build_array(v_before.title, v_after.title));
    v_summary_parts := v_summary_parts || 'nosaukums mainīts';
  END IF;
  IF v_after.description      IS DISTINCT FROM v_before.description      THEN
    v_changed := v_changed || jsonb_build_object('description', jsonb_build_array(v_before.description, v_after.description));
    v_summary_parts := v_summary_parts || 'apraksts mainīts';
  END IF;
  IF v_after.due_at           IS DISTINCT FROM v_before.due_at           THEN
    v_changed := v_changed || jsonb_build_object('due_at', jsonb_build_array(v_before.due_at, v_after.due_at));
    v_summary_parts := v_summary_parts || format('termiņš: %s → %s', v_before.due_at, v_after.due_at);
  END IF;
  IF v_after.assigned_user_id IS DISTINCT FROM v_before.assigned_user_id THEN
    v_changed := v_changed || jsonb_build_object('assigned_user_id', jsonb_build_array(v_before.assigned_user_id, v_after.assigned_user_id));
    v_summary_parts := v_summary_parts || 'atbildīgais mainīts';
  END IF;
  IF v_after.priority         IS DISTINCT FROM v_before.priority         THEN
    v_changed := v_changed || jsonb_build_object('priority', jsonb_build_array(v_before.priority, v_after.priority));
    v_summary_parts := v_summary_parts || format('prioritāte: %s → %s', v_before.priority, v_after.priority);
  END IF;
  IF v_after.metadata         IS DISTINCT FROM v_before.metadata         THEN
    v_changed := v_changed || jsonb_build_object('metadata', true);
  END IF;

  INSERT INTO crm.audit_events(entity_type, entity_id, action_type, source_type, source_system,
                               event_key, before_data, after_data, changed_fields, actor_user_id, metadata)
  VALUES ('task', p_task_id, 'update', 'manual', 'uzdevumi_ui',
          'task.update',
          to_jsonb(v_before), to_jsonb(v_after), v_changed, p_updated_by_user_id,
          '{}'::jsonb);

  IF v_changed <> '{}'::jsonb OR (p_notes IS NOT NULL AND p_notes <> '') THEN
    INSERT INTO crm.activities(lead_id, task_id, activity_type, activity_at,
                               performed_by_user_id, summary, metadata)
    VALUES (
      v_after.lead_id,
      v_after.id,
      'task_updated',
      now(),
      p_updated_by_user_id,
      NULLIF(
        btrim(
          COALESCE(array_to_string(v_summary_parts, '; '), '') ||
          CASE WHEN p_notes IS NOT NULL AND p_notes <> ''
               THEN E'\nPiezīmes: ' || p_notes ELSE '' END
        ), ''),
      jsonb_build_object(
        'changed_fields', v_changed,
        'notes', p_notes,
        'source', 'uzdevumi_ui'
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'task_id', p_task_id,
    'updated', true,
    'changed_fields', v_changed,
    'status', v_after.status
  );
END;
$function$;
