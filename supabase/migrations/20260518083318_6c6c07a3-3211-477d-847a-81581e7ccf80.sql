
CREATE OR REPLACE FUNCTION crm.cleanup_already_sent_queue(p_lead_id uuid)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'crm','public' AS $$
DECLARE v_count int;
BEGIN
  WITH sent_keys AS (
    SELECT lower(regexp_replace(raw_payload->>'template_key','^e_?mail_','','i')) AS k
      FROM crm.communications
     WHERE lead_id = p_lead_id AND direction='outbound'
       AND raw_payload->>'template_key' IS NOT NULL
       AND raw_payload->>'template_key' !~ '^[0-9a-f]{8}-'
    UNION
    SELECT lower(regexp_replace(replace(lower(raw_payload->>'automation_step'),' ','_'),'^e_?mail_','','i'))
      FROM crm.communications
     WHERE lead_id = p_lead_id AND direction='outbound'
       AND raw_payload->>'automation_step' IS NOT NULL
  ),
  upd AS (
    UPDATE crm.communication_queue q
       SET status='cancelled',
           blocked_reason='already_sent_historically',
           metadata = COALESCE(metadata,'{}'::jsonb)
                   || jsonb_build_object('cancelled_at', now(),
                                         'cancelled_reason','already_sent_historically')
     WHERE q.lead_id = p_lead_id
       AND q.status IN ('queued','blocked')
       AND lower(regexp_replace(q.template_key,'^e_?mail_','','i'))
           IN (SELECT k FROM sent_keys WHERE k IS NOT NULL AND k <> '')
     RETURNING 1)
  SELECT count(*) INTO v_count FROM upd;
  RETURN v_count;
END$$;

-- Patch planner dedup CTE in the same way (drop template_key column ref)
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
  v_hist_step_order int;
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
  END IF;

  WITH sent_keys AS (
    SELECT lower(regexp_replace(raw_payload->>'template_key','^e_?mail_','','i')) AS k
      FROM crm.communications
     WHERE lead_id = p_lead_id AND direction='outbound'
       AND raw_payload->>'template_key' IS NOT NULL
       AND raw_payload->>'template_key' !~ '^[0-9a-f]{8}-'
    UNION
    SELECT lower(regexp_replace(replace(lower(raw_payload->>'automation_step'),' ','_'),'^e_?mail_','','i'))
      FROM crm.communications
     WHERE lead_id = p_lead_id AND direction='outbound'
       AND raw_payload->>'automation_step' IS NOT NULL
  )
  SELECT MAX(ws.step_order) INTO v_hist_step_order
    FROM crm.workflow_steps ws
    JOIN sent_keys sk
      ON sk.k = lower(regexp_replace(ws.template_key,'^e_?mail_','','i'))
   WHERE ws.workflow_id = v_workflow_id AND ws.is_active = true
     AND sk.k IS NOT NULL AND sk.k <> '';

  v_last_step_order := GREATEST(COALESCE(v_last_step_order,0), COALESCE(v_hist_step_order,0));
  IF v_last_step_order = 0 THEN v_last_step_order := NULL; END IF;

  SELECT MAX(step_order) INTO v_max_step_order
    FROM crm.workflow_steps
   WHERE workflow_id = v_workflow_id AND is_active = true;

  IF v_last_step_order IS NOT NULL AND v_last_step_order >= v_max_step_order THEN
    INSERT INTO crm.audit_events(entity_type, entity_id, action_type, source_type, event_key, event_name, metadata)
    VALUES ('lead', p_lead_id, 'automation', 'automation',
            'email_plan_skipped_already_completed','email_plan_skipped_already_completed',
            jsonb_build_object('workflow_key', v_workflow_key,'reason', p_reason,
                               'last_completed_template_key', v_last_tpl_key,
                               'last_completed_step_order', v_last_step_order,
                               'max_step_order', v_max_step_order));
    RETURN NULL;
  END IF;

  SELECT created_at INTO v_lead_created FROM crm.leads WHERE id=p_lead_id;
  v_hot_removed := crm.get_lead_hot_removed_at(p_lead_id);
  v_started_at  := GREATEST(v_lead_created, COALESCE(v_hot_removed, v_lead_created));
  v_recipient   := crm.lead_email_recipient(p_lead_id);

  v_is_backfill := (p_reason IN ('backfill', 'historical_import'));
  IF v_is_backfill THEN
    v_queue_metadata := jsonb_build_object('queue_type','backfill','daily_bucket','existing','priority_score',v_priority_score);
  ELSE
    v_queue_metadata := jsonb_build_object('queue_type','new_lead','daily_bucket','new','priority_score',v_priority_score);
  END IF;

  INSERT INTO crm.workflow_instances
    (entity_type, entity_id, workflow_key, workflow_name, status, started_at, current_step_key, metadata)
  VALUES ('lead', p_lead_id, v_workflow_key, v_workflow_key, 'running', v_started_at, NULL,
          jsonb_build_object('reason',p_reason,'hot_removed_at',v_hot_removed,
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
      v_warnings := v_warnings || jsonb_build_object('template_key', v_step.template_key, 'warning', v_blocked);
    ELSIF v_recipient IS NULL OR v_recipient = '' THEN
      v_status := 'blocked'; v_blocked := 'missing_email';
    END IF;
    v_body := COALESCE(v_tpl.content_html, v_tpl.content_text);

    INSERT INTO crm.lead_next_actions
      (lead_id, action_type, status, due_at, workflow_step_id, source, metadata)
    VALUES (p_lead_id, 'send_email', 'pending',
            v_started_at + make_interval(mins => v_step.delay_minutes),
            v_step.id, 'email_workflow',
            jsonb_build_object('workflow_instance_id', v_instance_id,'template_key', v_step.template_key));

    INSERT INTO crm.communication_queue
      (lead_id, channel, direction, template_key, recipient, subject, body, scheduled_for, status,
       requires_approval, blocked_reason, workflow_instance_id, max_attempts, attempt_count, metadata)
    VALUES (p_lead_id, 'email', 'outbound', v_step.template_key, v_recipient, v_tpl.subject, v_body,
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
          jsonb_build_object('workflow_key', v_workflow_key,'instance_id', v_instance_id,'reason', p_reason,
                             'queue_type', CASE WHEN v_is_backfill THEN 'backfill' ELSE 'new_lead' END,
                             'last_completed_template_key', v_last_tpl_key,
                             'last_completed_step_order', v_last_step_order,
                             'warnings', v_warnings));
  RETURN v_instance_id;
END $function$;

DO $$
DECLARE v_lead uuid; v_total int := 0; v_n int;
BEGIN
  FOR v_lead IN SELECT DISTINCT lead_id FROM crm.communication_queue WHERE status IN ('queued','blocked') LOOP
    v_n := crm.cleanup_already_sent_queue(v_lead);
    v_total := v_total + COALESCE(v_n,0);
  END LOOP;
  RAISE NOTICE 'cleanup_rerun cancelled=%', v_total;
END$$;
