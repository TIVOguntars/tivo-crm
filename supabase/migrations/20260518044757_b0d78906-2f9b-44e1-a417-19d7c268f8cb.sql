-- 1. Backfill allocator
CREATE OR REPLACE FUNCTION crm.rebalance_backfill_email_schedule(
    p_start_date date DEFAULT current_date
)
RETURNS TABLE(
    queue_id        uuid,
    old_scheduled   timestamptz,
    new_scheduled   timestamptz,
    slot_date       date
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = crm, public, extensions
AS $$
DECLARE
    v_tz            constant text     := 'Europe/Riga';
    v_window_start  constant time     := time '08:00';
    v_window_end    constant time     := time '18:00';
    v_spacing       constant interval := interval '2 minutes';
    v_daily_cap     constant int      := 80;

    v_current_date     date := p_start_date;
    v_slot_local       timestamp;
    v_slot_utc         timestamptz;
    v_allocated_today  int  := 0;
    r                  record;
BEGIN
    v_slot_local := (v_current_date::timestamp + v_window_start);

    FOR r IN
        SELECT q.id,
               q.scheduled_for,
               q.created_at,
               COALESCE((q.metadata->>'priority_score')::numeric, 0) AS prio
        FROM crm.communication_queue q
        WHERE q.status = 'queued'
          AND q.channel = 'email'
          AND q.metadata->>'daily_bucket' = 'existing'
          AND q.scheduled_for <= now()
          AND COALESCE((q.metadata->>'allocator_locked')::boolean, false) = false
        ORDER BY prio DESC,
                 q.scheduled_for ASC NULLS LAST,
                 q.created_at ASC
        FOR UPDATE SKIP LOCKED
    LOOP
        IF v_allocated_today >= v_daily_cap THEN
            v_current_date    := v_current_date + 1;
            v_slot_local      := (v_current_date::timestamp + v_window_start);
            v_allocated_today := 0;
        END IF;

        IF v_slot_local::time >= v_window_end THEN
            v_current_date    := v_current_date + 1;
            v_slot_local      := (v_current_date::timestamp + v_window_start);
            v_allocated_today := 0;
        END IF;

        v_slot_utc := (v_slot_local AT TIME ZONE v_tz);

        UPDATE crm.communication_queue
           SET scheduled_for = v_slot_utc,
               metadata = COALESCE(metadata, '{}'::jsonb)
                          || jsonb_build_object(
                                'rebalanced_at',       now(),
                                'rebalanced_for_date', v_current_date::text,
                                'allocator',           'backfill_scheduler_v1'
                             )
         WHERE id = r.id;

        queue_id      := r.id;
        old_scheduled := r.scheduled_for;
        new_scheduled := v_slot_utc;
        slot_date     := v_current_date;
        RETURN NEXT;

        v_allocated_today := v_allocated_today + 1;
        v_slot_local      := v_slot_local + v_spacing;
    END LOOP;

    RETURN;
END;
$$;

-- 2. queue_item_reschedule: stamp allocator_locked
CREATE OR REPLACE FUNCTION crm.queue_item_reschedule(p_id uuid, p_when timestamptz)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'crm', 'public'
AS $function$
BEGIN
  UPDATE crm.communication_queue
     SET scheduled_for = p_when,
         metadata = COALESCE(metadata,'{}'::jsonb)
                  || jsonb_build_object('rescheduled_at', now(),
                                        'rescheduled_by', auth.uid(),
                                        'allocator_locked', true)
   WHERE id = p_id AND status IN ('queued','blocked');

  INSERT INTO crm.audit_events(entity_type, entity_id, action_type, source_type, event_key, event_name, metadata)
  SELECT 'communication_queue', p_id, 'automation', 'automation', 'queue_item_rescheduled', 'queue_item_rescheduled',
         jsonb_build_object('scheduled_for', p_when);
END $function$;

-- 3. generate_email_plan_for_lead: strict explicit backfill + bucket metadata
CREATE OR REPLACE FUNCTION crm.generate_email_plan_for_lead(p_lead_id uuid, p_reason text DEFAULT 'tag_trigger'::text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'crm', 'public'
AS $function$
DECLARE
  v_workflow_key text; v_workflow_id uuid;
  v_started_at timestamptz; v_hot_removed timestamptz; v_lead_created timestamptz;
  v_instance_id uuid; v_recipient text;
  v_step record; v_tpl record;
  v_status text; v_blocked text; v_body text;
  v_warnings jsonb := '[]'::jsonb;
  v_last_tpl_key text;
  v_last_step_order int;
  v_max_step_order int;
  v_is_backfill boolean;
  v_priority_score numeric := 0;
  v_queue_metadata jsonb;
BEGIN
  IF crm.lead_has_tag(p_lead_id,'hot') THEN RETURN NULL; END IF;
  v_workflow_key := crm.email_workflow_key_for_lead(p_lead_id);
  IF v_workflow_key IS NULL THEN RETURN NULL; END IF;

  SELECT id INTO v_workflow_id FROM crm.workflow_definitions
   WHERE workflow_key = v_workflow_key LIMIT 1;
  IF v_workflow_id IS NULL THEN RETURN NULL; END IF;

  IF EXISTS (SELECT 1 FROM crm.workflow_instances
             WHERE entity_type='lead' AND entity_id=p_lead_id
               AND workflow_key=v_workflow_key
               AND status IN ('pending','running','paused'))
  THEN RETURN NULL; END IF;

  SELECT last_completed_template_key INTO v_last_tpl_key
    FROM crm.v_lead_workflow_progress WHERE lead_id = p_lead_id;

  IF v_last_tpl_key IS NOT NULL THEN
    SELECT step_order INTO v_last_step_order
      FROM crm.workflow_steps
     WHERE workflow_id = v_workflow_id AND is_active = true
       AND template_key = v_last_tpl_key
     ORDER BY step_order DESC LIMIT 1;

    SELECT MAX(step_order) INTO v_max_step_order
      FROM crm.workflow_steps
     WHERE workflow_id = v_workflow_id AND is_active = true;

    IF v_last_step_order IS NOT NULL AND v_last_step_order >= v_max_step_order THEN
      INSERT INTO crm.audit_events(entity_type, entity_id, action_type, source_type, event_key, event_name, metadata)
      VALUES ('lead', p_lead_id, 'automation', 'automation',
              'email_plan_skipped_already_completed','email_plan_skipped_already_completed',
              jsonb_build_object('workflow_key', v_workflow_key,
                                 'reason', p_reason,
                                 'last_completed_template_key', v_last_tpl_key,
                                 'last_completed_step_order', v_last_step_order,
                                 'max_step_order', v_max_step_order));
      RETURN NULL;
    END IF;
  END IF;

  SELECT created_at INTO v_lead_created FROM crm.leads WHERE id=p_lead_id;
  v_hot_removed := crm.get_lead_hot_removed_at(p_lead_id);
  v_started_at  := GREATEST(v_lead_created, COALESCE(v_hot_removed, v_lead_created));
  v_recipient   := crm.lead_email_recipient(p_lead_id);

  v_is_backfill := (p_reason IN ('backfill', 'historical_import'));

  IF v_is_backfill THEN
    v_queue_metadata := jsonb_build_object(
      'queue_type',     'backfill',
      'daily_bucket',   'existing',
      'priority_score', v_priority_score
    );
  ELSE
    v_queue_metadata := jsonb_build_object(
      'queue_type',     'new_lead',
      'daily_bucket',   'new',
      'priority_score', v_priority_score
    );
  END IF;

  INSERT INTO crm.workflow_instances
    (entity_type, entity_id, workflow_key, workflow_name,
     status, started_at, current_step_key, metadata)
  VALUES ('lead', p_lead_id, v_workflow_key, v_workflow_key,
          'running', v_started_at, NULL,
          jsonb_build_object('reason',p_reason,
                             'hot_removed_at',v_hot_removed,
                             'lead_created_at',v_lead_created,
                             'last_completed_template_key', v_last_tpl_key,
                             'last_completed_step_order', v_last_step_order))
  RETURNING id INTO v_instance_id;

  FOR v_step IN
    SELECT * FROM crm.workflow_steps
    WHERE workflow_id = v_workflow_id AND is_active = true
      AND (v_last_step_order IS NULL OR step_order > v_last_step_order)
    ORDER BY step_order
  LOOP
    SELECT * INTO v_tpl FROM crm.get_published_template(v_step.template_key);

    v_status := 'queued'; v_blocked := NULL;
    IF v_tpl.version_id IS NULL THEN
      v_status := 'blocked'; v_blocked := 'no_published_template_version';
      v_warnings := v_warnings || jsonb_build_object(
        'template_key', v_step.template_key, 'warning', v_blocked);
    ELSIF v_recipient IS NULL OR v_recipient = '' THEN
      v_status := 'blocked'; v_blocked := 'missing_email';
    END IF;

    v_body := COALESCE(v_tpl.content_html, v_tpl.content_text);

    INSERT INTO crm.lead_next_actions
      (lead_id, action_type, status, due_at, workflow_step_id, source, metadata)
    VALUES (p_lead_id, 'send_email', 'pending',
            v_started_at + make_interval(mins => v_step.delay_minutes),
            v_step.id, 'email_workflow',
            jsonb_build_object('workflow_instance_id', v_instance_id,
                               'template_key', v_step.template_key));

    INSERT INTO crm.communication_queue
      (lead_id, channel, direction, template_key, recipient,
       subject, body, scheduled_for, status, requires_approval,
       blocked_reason, workflow_instance_id,
       max_attempts, attempt_count, metadata)
    VALUES (p_lead_id, 'email', 'outbound', v_step.template_key, v_recipient,
            v_tpl.subject, v_body,
            v_started_at + make_interval(mins => v_step.delay_minutes),
            v_status, false, v_blocked, v_instance_id, 3, 0,
            jsonb_build_object('workflow_step_id', v_step.id,
                               'template_version_id', v_tpl.version_id,
                               'content_html', v_tpl.content_html,
                               'content_text', v_tpl.content_text)
            || v_queue_metadata);
  END LOOP;

  INSERT INTO crm.audit_events(entity_type, entity_id, action_type, source_type, event_key, event_name, metadata)
  VALUES ('lead', p_lead_id, 'automation', 'automation', 'email_plan_generated', 'email_plan_generated',
          jsonb_build_object('workflow_key', v_workflow_key,
                             'instance_id', v_instance_id,
                             'reason', p_reason,
                             'queue_type', CASE WHEN v_is_backfill THEN 'backfill' ELSE 'new_lead' END,
                             'last_completed_template_key', v_last_tpl_key,
                             'last_completed_step_order', v_last_step_order,
                             'warnings', v_warnings));
  RETURN v_instance_id;
END $function$;