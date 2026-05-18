-- Lead Email Workflow Automation v5 (re-run with step_name fix)

----------------------------------------------------------------------
-- 1. Singleton rate-limit state
----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS crm.email_send_state (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  last_sent_at         timestamptz,
  current_day          date,
  sent_count_today     int  NOT NULL DEFAULT 0,
  daily_limit          int  NOT NULL DEFAULT 80,
  min_interval_seconds int  NOT NULL DEFAULT 120,
  send_window_start    time NOT NULL DEFAULT '08:00',
  send_window_end      time NOT NULL DEFAULT '18:00',
  timezone             text NOT NULL DEFAULT 'Europe/Riga',
  resend_endpoint      text NOT NULL DEFAULT 'https://api.resend.com/emails',
  from_address         text NOT NULL DEFAULT 'noreply@tivohouses.com',
  updated_at           timestamptz NOT NULL DEFAULT now()
);
INSERT INTO crm.email_send_state(id) VALUES (1) ON CONFLICT DO NOTHING;

----------------------------------------------------------------------
-- 2. Views
----------------------------------------------------------------------
CREATE OR REPLACE VIEW crm.v_communication_queue_state AS
SELECT q.*,
  CASE
    WHEN q.status = 'sent'      THEN 'sent'
    WHEN q.status = 'sending'   THEN 'sending'
    WHEN q.status = 'failed'    THEN 'failed'
    WHEN q.status = 'cancelled' THEN 'cancelled'
    WHEN q.status = 'blocked'   THEN 'blocked'
    WHEN q.requires_approval AND q.approved_at IS NULL THEN 'awaiting_approval'
    WHEN q.scheduled_for > now() THEN 'scheduled'
    ELSE 'ready'
  END AS ui_state
FROM crm.communication_queue q;

CREATE OR REPLACE VIEW crm.v_lead_planned_actions AS
SELECT 'next_action'::text AS source, na.id, na.lead_id,
       na.action_type AS kind, na.status,
       na.due_at AS scheduled_for, NULL::text AS title, na.metadata
FROM crm.lead_next_actions na
WHERE na.status IN ('pending','in_progress')
UNION ALL
SELECT 'queue', q.id, q.lead_id, q.channel, q.status,
       q.scheduled_for, q.subject, q.metadata
FROM crm.communication_queue q
WHERE q.status IN ('queued','sending','blocked')
UNION ALL
SELECT 'task', t.id, t.lead_id, COALESCE(t.task_type,'task'), t.status,
       t.due_at, t.title, t.metadata
FROM crm.tasks t
WHERE t.completed_at IS NULL;

----------------------------------------------------------------------
-- 3. Helpers
----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION crm.lead_email_recipient(p_lead_id uuid)
RETURNS text LANGUAGE sql STABLE AS $f$
  SELECT COALESCE(
    l.raw_data->>'email_normalized',
    l.raw_data->>'email_raw',
    l.raw_data->>'email'
  )
  FROM crm.leads l WHERE l.id = p_lead_id
$f$;

CREATE OR REPLACE FUNCTION crm.lead_has_tag(p_lead_id uuid, p_slug text)
RETURNS boolean LANGUAGE sql STABLE AS $f$
  SELECT EXISTS (
    SELECT 1 FROM crm.lead_tags lt
    JOIN crm.tags t ON t.id = lt.tag_id
    WHERE lt.lead_id = p_lead_id AND t.slug = p_slug
  )
$f$;

CREATE OR REPLACE FUNCTION crm.email_workflow_key_for_lead(p_lead_id uuid)
RETURNS text LANGUAGE sql STABLE AS $f$
  SELECT CASE
    WHEN crm.lead_has_tag(p_lead_id,'getestimate') THEN 'getestimate'
    WHEN crm.lead_has_tag(p_lead_id,'sketch')      THEN 'sketch'
    ELSE NULL END
$f$;

CREATE OR REPLACE FUNCTION crm.get_lead_hot_removed_at(p_lead_id uuid)
RETURNS timestamptz LANGUAGE plpgsql STABLE AS $f$
DECLARE v_ts timestamptz;
BEGIN
  SELECT max(ae.created_at) INTO v_ts
  FROM crm.audit_events ae
  WHERE ae.entity_type = 'lead'
    AND ae.entity_id   = p_lead_id
    AND ae.event_key  IN ('lead_tag_removed','tag_removed')
    AND (ae.metadata->>'tag_slug' = 'hot' OR ae.metadata->>'slug' = 'hot');

  IF v_ts IS NULL AND to_regclass('crm.lead_tag_events') IS NOT NULL THEN
    EXECUTE 'SELECT max(occurred_at) FROM crm.lead_tag_events WHERE lead_id=$1 AND tag_slug=''hot'' AND event=''removed'''
      INTO v_ts USING p_lead_id;
  END IF;
  RETURN v_ts;
END $f$;

CREATE OR REPLACE FUNCTION crm.get_published_template(p_template_key text)
RETURNS TABLE(version_id uuid, subject text, content_html text, content_text text)
LANGUAGE sql STABLE AS $f$
  SELECT v.id, v.subject, v.content_html, v.content_text
  FROM crm.message_templates t
  JOIN crm.message_template_versions v ON v.template_id = t.id
  WHERE t.template_key = p_template_key AND v.is_published = true
  ORDER BY v.created_at DESC LIMIT 1
$f$;

----------------------------------------------------------------------
-- 4. Planner
----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION crm.generate_email_plan_for_lead(
  p_lead_id uuid, p_reason text DEFAULT 'tag_trigger')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=crm,public AS $f$
DECLARE
  v_workflow_key text; v_workflow_id uuid;
  v_started_at timestamptz; v_hot_removed timestamptz; v_lead_created timestamptz;
  v_instance_id uuid; v_recipient text;
  v_step record; v_tpl record;
  v_status text; v_blocked text; v_body text;
  v_warnings jsonb := '[]'::jsonb;
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

  SELECT created_at INTO v_lead_created FROM crm.leads WHERE id=p_lead_id;
  v_hot_removed := crm.get_lead_hot_removed_at(p_lead_id);
  v_started_at  := GREATEST(v_lead_created, COALESCE(v_hot_removed, v_lead_created));
  v_recipient   := crm.lead_email_recipient(p_lead_id);

  INSERT INTO crm.workflow_instances
    (entity_type, entity_id, workflow_key, workflow_name,
     status, started_at, current_step_key, metadata)
  VALUES ('lead', p_lead_id, v_workflow_key, v_workflow_key,
          'running', v_started_at, NULL,
          jsonb_build_object('reason',p_reason,
                             'hot_removed_at',v_hot_removed,
                             'lead_created_at',v_lead_created))
  RETURNING id INTO v_instance_id;

  FOR v_step IN
    SELECT * FROM crm.workflow_steps
    WHERE workflow_id = v_workflow_id AND is_active = true
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
                               'content_text', v_tpl.content_text));
  END LOOP;

  INSERT INTO crm.audit_events(entity_type, entity_id, event_key, metadata)
  VALUES ('lead', p_lead_id, 'email_plan_generated',
          jsonb_build_object('workflow_key', v_workflow_key,
                             'instance_id', v_instance_id,
                             'reason', p_reason,
                             'warnings', v_warnings));
  RETURN v_instance_id;
END $f$;

----------------------------------------------------------------------
-- 5. Pause / resume / trigger / batch
----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION crm.pause_email_workflow_for_lead(p_lead_id uuid)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path=crm,public AS $f$
DECLARE v_count int := 0;
BEGIN
  UPDATE crm.workflow_instances
     SET status='paused',
         metadata = COALESCE(metadata,'{}'::jsonb)
                  || jsonb_build_object('paused_at', now(), 'pause_reason','hot_tag_added')
   WHERE entity_type='lead' AND entity_id=p_lead_id
     AND status IN ('pending','running');

  UPDATE crm.communication_queue
     SET status='blocked',
         blocked_reason='hot_tag',
         metadata = COALESCE(metadata,'{}'::jsonb)
                  || jsonb_build_object('blocked_at', now())
   WHERE lead_id=p_lead_id AND status IN ('queued','sending');
  GET DIAGNOSTICS v_count = ROW_COUNT;

  UPDATE crm.lead_next_actions
     SET status='cancelled'
   WHERE lead_id=p_lead_id AND status='pending'
     AND source='email_workflow';

  INSERT INTO crm.audit_events(entity_type, entity_id, event_key, metadata)
  VALUES ('lead', p_lead_id, 'email_plan_paused',
          jsonb_build_object('blocked_queue_rows', v_count));
  RETURN v_count;
END $f$;

CREATE OR REPLACE FUNCTION crm.resume_email_workflow_for_lead(p_lead_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=crm,public AS $f$
DECLARE v_new_instance uuid;
BEGIN
  v_new_instance := crm.generate_email_plan_for_lead(p_lead_id,'hot_removed');
  IF v_new_instance IS NOT NULL THEN
    UPDATE crm.workflow_instances
       SET metadata = COALESCE(metadata,'{}'::jsonb)
                    || jsonb_build_object('superseded_by', v_new_instance,
                                          'superseded_at', now())
     WHERE entity_type='lead' AND entity_id=p_lead_id
       AND status='paused' AND id <> v_new_instance;
  END IF;
  RETURN v_new_instance;
END $f$;

CREATE OR REPLACE FUNCTION crm.tg_lead_tags_email_workflow()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=crm,public AS $f$
DECLARE v_slug text;
BEGIN
  IF TG_OP='INSERT' THEN
    SELECT slug INTO v_slug FROM crm.tags WHERE id = NEW.tag_id;
    IF v_slug='hot' THEN
      PERFORM crm.pause_email_workflow_for_lead(NEW.lead_id);
    ELSIF v_slug IN ('getestimate','sketch') THEN
      PERFORM crm.generate_email_plan_for_lead(NEW.lead_id,'tag_added:'||v_slug);
    END IF;
    RETURN NEW;
  ELSIF TG_OP='DELETE' THEN
    SELECT slug INTO v_slug FROM crm.tags WHERE id = OLD.tag_id;
    IF v_slug='hot' THEN
      PERFORM crm.resume_email_workflow_for_lead(OLD.lead_id);
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END $f$;

DROP TRIGGER IF EXISTS lead_tags_email_workflow ON crm.lead_tags;
CREATE TRIGGER lead_tags_email_workflow
  AFTER INSERT OR DELETE ON crm.lead_tags
  FOR EACH ROW EXECUTE FUNCTION crm.tg_lead_tags_email_workflow();

CREATE OR REPLACE FUNCTION crm.generate_email_plans_batch(p_limit int DEFAULT 200)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path=crm,public AS $f$
DECLARE v_id uuid; v_count int := 0;
BEGIN
  FOR v_id IN
    SELECT DISTINCT l.id
      FROM crm.leads l
      JOIN crm.lead_tags lt ON lt.lead_id = l.id
      JOIN crm.tags t ON t.id = lt.tag_id
     WHERE t.slug IN ('getestimate','sketch')
       AND NOT crm.lead_has_tag(l.id,'hot')
       AND NOT EXISTS (
         SELECT 1 FROM crm.workflow_instances wi
         WHERE wi.entity_type='lead' AND wi.entity_id=l.id
           AND wi.status IN ('pending','running','paused'))
     ORDER BY l.id
     LIMIT p_limit
  LOOP
    PERFORM crm.generate_email_plan_for_lead(v_id,'batch');
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END $f$;

----------------------------------------------------------------------
-- 6. UI write RPCs
----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION crm.queue_item_cancel(p_id uuid, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=crm,public AS $f$
BEGIN
  UPDATE crm.communication_queue
     SET status='cancelled',
         blocked_reason = COALESCE(blocked_reason, p_reason),
         metadata = COALESCE(metadata,'{}'::jsonb)
                  || jsonb_build_object('cancel_reason', p_reason,
                                        'cancelled_at',  now(),
                                        'cancelled_by',  auth.uid())
   WHERE id = p_id AND status IN ('queued','blocked');

  INSERT INTO crm.audit_events(entity_type, entity_id, event_key, metadata)
  SELECT 'communication_queue', p_id, 'queue_item_cancelled',
         jsonb_build_object('reason', p_reason);
END $f$;

CREATE OR REPLACE FUNCTION crm.queue_item_reschedule(p_id uuid, p_when timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=crm,public AS $f$
BEGIN
  UPDATE crm.communication_queue
     SET scheduled_for = p_when,
         metadata = COALESCE(metadata,'{}'::jsonb)
                  || jsonb_build_object('rescheduled_at', now(),
                                        'rescheduled_by', auth.uid())
   WHERE id = p_id AND status IN ('queued','blocked');

  INSERT INTO crm.audit_events(entity_type, entity_id, event_key, metadata)
  SELECT 'communication_queue', p_id, 'queue_item_rescheduled',
         jsonb_build_object('scheduled_for', p_when);
END $f$;

CREATE OR REPLACE FUNCTION crm.queue_item_edit(
  p_id uuid, p_subject text, p_body text,
  p_recipient text, p_template_key text,
  p_content_html text DEFAULT NULL, p_content_text text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=crm,public AS $f$
BEGIN
  UPDATE crm.communication_queue
     SET subject       = COALESCE(p_subject, subject),
         body          = COALESCE(p_body, body),
         recipient     = COALESCE(p_recipient, recipient),
         template_key  = COALESCE(p_template_key, template_key),
         metadata = COALESCE(metadata,'{}'::jsonb)
                  || jsonb_strip_nulls(jsonb_build_object(
                       'content_html', p_content_html,
                       'content_text', p_content_text,
                       'edited_at',    now(),
                       'edited_by',    auth.uid()))
   WHERE id = p_id AND status IN ('queued','blocked');
END $f$;

CREATE OR REPLACE FUNCTION crm.queue_item_approve(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=crm,public AS $f$
BEGIN
  UPDATE crm.communication_queue
     SET approved_at = now(), approved_by = auth.uid()
   WHERE id = p_id AND status = 'queued' AND approved_at IS NULL;
END $f$;

CREATE OR REPLACE FUNCTION crm.workflow_step_set_delay(p_id uuid, p_minutes int)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=crm,public AS $f$
  UPDATE crm.workflow_steps
     SET delay_minutes = GREATEST(0, p_minutes), updated_at = now()
   WHERE id = p_id AND step_type = 'email';
$f$;

----------------------------------------------------------------------
-- 7. Async dispatcher
----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION crm.dispatch_email_queue_once()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER
SET search_path = crm, public, extensions AS $f$
DECLARE
  v_state    crm.email_send_state%ROWTYPE;
  v_now_local timestamptz; v_today date;
  v_row      crm.communication_queue%ROWTYPE;
  v_payload  jsonb;
  v_req_id   bigint;
  v_api_key  text;
  v_html     text; v_text text;
BEGIN
  SELECT * INTO v_state FROM crm.email_send_state WHERE id = 1 FOR UPDATE;

  v_now_local := now() AT TIME ZONE v_state.timezone;
  v_today     := (v_now_local)::date;

  IF (v_now_local::time) < v_state.send_window_start
     OR (v_now_local::time) >= v_state.send_window_end THEN
    RETURN 0;
  END IF;

  IF v_state.current_day IS DISTINCT FROM v_today THEN
    UPDATE crm.email_send_state
       SET current_day = v_today, sent_count_today = 0, updated_at = now()
     WHERE id = 1 RETURNING * INTO v_state;
  END IF;

  IF v_state.sent_count_today >= v_state.daily_limit THEN RETURN 0; END IF;

  IF v_state.last_sent_at IS NOT NULL
     AND now() - v_state.last_sent_at < make_interval(secs => v_state.min_interval_seconds) THEN
    RETURN 0;
  END IF;

  SELECT q.* INTO v_row
    FROM crm.communication_queue q
   WHERE q.status='queued' AND q.channel='email'
     AND q.scheduled_for <= now()
     AND (q.requires_approval = false OR q.approved_at IS NOT NULL)
     AND q.recipient IS NOT NULL
     AND NOT crm.lead_has_tag(q.lead_id,'hot')
   ORDER BY q.scheduled_for
   FOR UPDATE SKIP LOCKED LIMIT 1;

  IF NOT FOUND THEN RETURN 0; END IF;

  SELECT decrypted_secret INTO v_api_key
    FROM vault.decrypted_secrets WHERE name='RESEND_API_KEY' LIMIT 1;
  IF v_api_key IS NULL THEN
    UPDATE crm.communication_queue
       SET status='blocked', blocked_reason='missing_resend_api_key'
     WHERE id = v_row.id;
    RETURN 0;
  END IF;

  v_html := COALESCE(v_row.metadata->>'content_html', v_row.body);
  v_text := v_row.metadata->>'content_text';

  v_payload := jsonb_strip_nulls(jsonb_build_object(
    'from',    v_state.from_address,
    'to',      jsonb_build_array(v_row.recipient),
    'subject', v_row.subject,
    'html',    v_html,
    'text',    v_text));

  SELECT net.http_post(
    url     := v_state.resend_endpoint,
    headers := jsonb_build_object(
      'Authorization','Bearer '||v_api_key,
      'Content-Type','application/json'),
    body    := v_payload
  ) INTO v_req_id;

  UPDATE crm.communication_queue
     SET status        = 'sending',
         attempt_count = COALESCE(attempt_count,0) + 1,
         metadata = COALESCE(metadata,'{}'::jsonb)
                  || jsonb_build_object('pg_net_request_id', v_req_id,
                                        'dispatched_at', now())
   WHERE id = v_row.id;

  UPDATE crm.email_send_state
     SET last_sent_at     = now(),
         sent_count_today = sent_count_today + 1,
         updated_at       = now()
   WHERE id = 1;

  INSERT INTO crm.audit_events(entity_type, entity_id, event_key, metadata)
  VALUES ('communication_queue', v_row.id, 'email_dispatched',
          jsonb_build_object('pg_net_request_id', v_req_id,
                             'recipient', v_row.recipient,
                             'template_key', v_row.template_key));
  RETURN 1;
END $f$;

----------------------------------------------------------------------
-- 8. Reconciler
----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION crm.reconcile_email_send_responses(p_limit int DEFAULT 200)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER
SET search_path = crm, public, extensions AS $f$
DECLARE
  v_row     crm.communication_queue%ROWTYPE;
  v_req_id  bigint;
  v_resp    record;
  v_count   int := 0;
  v_msg_id  text;
  v_html    text;
BEGIN
  FOR v_row IN
    SELECT * FROM crm.communication_queue
     WHERE status = 'sending'
       AND (metadata ? 'pg_net_request_id')
     ORDER BY (metadata->>'dispatched_at')::timestamptz NULLS FIRST
     LIMIT p_limit
     FOR UPDATE SKIP LOCKED
  LOOP
    v_req_id := (v_row.metadata->>'pg_net_request_id')::bigint;

    SELECT id, status_code, content, error_msg, timed_out
      INTO v_resp
      FROM net._http_response
     WHERE id = v_req_id;

    IF NOT FOUND THEN CONTINUE; END IF;

    IF v_resp.status_code BETWEEN 200 AND 299 THEN
      BEGIN
        v_msg_id := (v_resp.content::jsonb)->>'id';
      EXCEPTION WHEN OTHERS THEN v_msg_id := NULL;
      END;

      v_html := COALESCE(v_row.metadata->>'content_html', v_row.body);

      INSERT INTO crm.communications
        (lead_id, channel, direction, subject, body,
         status, provider, provider_message_id, raw_payload)
      VALUES
        (v_row.lead_id, 'email', 'outbound', v_row.subject, v_html,
         'sent', 'resend', v_msg_id,
         jsonb_build_object(
           'queue_id',             v_row.id,
           'workflow_instance_id', v_row.workflow_instance_id,
           'recipient',            v_row.recipient,
           'template_key',         v_row.template_key,
           'pg_net_request_id',    v_req_id,
           'content_text',         v_row.metadata->>'content_text',
           'resend_response',      v_resp.content));

      UPDATE crm.communication_queue
         SET status='sent',
             metadata = COALESCE(metadata,'{}'::jsonb)
                      || jsonb_build_object('sent_at', now(),
                                            'provider_message_id', v_msg_id,
                                            'http_status', v_resp.status_code)
       WHERE id = v_row.id;

      UPDATE crm.lead_next_actions
         SET status='completed'
       WHERE lead_id = v_row.lead_id
         AND status  = 'pending'
         AND workflow_step_id = (v_row.metadata->>'workflow_step_id')::uuid;

      UPDATE crm.workflow_instances
         SET current_step_key = v_row.template_key,
             status = CASE
               WHEN NOT EXISTS (
                 SELECT 1 FROM crm.communication_queue cq
                 WHERE cq.workflow_instance_id = v_row.workflow_instance_id
                   AND cq.id <> v_row.id
                   AND cq.status IN ('queued','sending','blocked'))
               THEN 'completed' ELSE status END,
             completed_at = CASE
               WHEN NOT EXISTS (
                 SELECT 1 FROM crm.communication_queue cq
                 WHERE cq.workflow_instance_id = v_row.workflow_instance_id
                   AND cq.id <> v_row.id
                   AND cq.status IN ('queued','sending','blocked'))
               THEN now() ELSE completed_at END
       WHERE id = v_row.workflow_instance_id;

      INSERT INTO crm.audit_events(entity_type, entity_id, event_key, metadata)
      VALUES ('communication_queue', v_row.id, 'email_sent',
              jsonb_build_object('http_status', v_resp.status_code,
                                 'provider_message_id', v_msg_id,
                                 'pg_net_request_id', v_req_id));

    ELSE
      IF COALESCE(v_row.attempt_count,0) >= COALESCE(v_row.max_attempts,3) THEN
        UPDATE crm.communication_queue
           SET status='failed',
               blocked_reason = COALESCE(blocked_reason,
                  'http_'||COALESCE(v_resp.status_code::text,'error')),
               metadata = COALESCE(metadata,'{}'::jsonb)
                        || jsonb_build_object(
                             'failed_at', now(),
                             'http_status', v_resp.status_code,
                             'error_msg', v_resp.error_msg,
                             'timed_out', v_resp.timed_out,
                             'response',  v_resp.content)
         WHERE id = v_row.id;

        INSERT INTO crm.audit_events(entity_type, entity_id, event_key, metadata)
        VALUES ('communication_queue', v_row.id, 'email_failed_terminal',
                jsonb_build_object('http_status', v_resp.status_code,
                                   'error_msg', v_resp.error_msg));
      ELSE
        UPDATE crm.communication_queue
           SET status='queued',
               metadata = COALESCE(metadata,'{}'::jsonb)
                        || jsonb_build_object(
                             'last_error_at', now(),
                             'last_http_status', v_resp.status_code,
                             'last_error_msg', v_resp.error_msg)
         WHERE id = v_row.id;

        INSERT INTO crm.audit_events(entity_type, entity_id, event_key, metadata)
        VALUES ('communication_queue', v_row.id, 'email_failed_retry',
                jsonb_build_object('http_status', v_resp.status_code,
                                   'attempt', v_row.attempt_count));
      END IF;
    END IF;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END $f$;

----------------------------------------------------------------------
-- 9. Seed workflow_steps (idempotent UPDATE-then-INSERT) - fixed step_name
----------------------------------------------------------------------
DO $seed$
DECLARE r record;
BEGIN
  FOR r IN
    WITH steps(workflow_id, step_key, template_key, ord, delay_minutes) AS (VALUES
      ('e72ab303-9d0c-4d03-8032-1589383cbec5'::uuid,'email_getestimate_1','email_getestimate_1',1,0),
      ('e72ab303-9d0c-4d03-8032-1589383cbec5'::uuid,'email_getestimate_2','email_getestimate_2',2,4320),
      ('e72ab303-9d0c-4d03-8032-1589383cbec5'::uuid,'email_getestimate_3','email_getestimate_3',3,11520),
      ('e72ab303-9d0c-4d03-8032-1589383cbec5'::uuid,'email_getestimate_4','email_getestimate_4',4,23040),
      ('e72ab303-9d0c-4d03-8032-1589383cbec5'::uuid,'email_transition_to_sketch','email_transition_to_sketch',5,34560),
      ('e72ab303-9d0c-4d03-8032-1589383cbec5'::uuid,'email_sketch_1','email_sketch_1',6,37440),
      ('e72ab303-9d0c-4d03-8032-1589383cbec5'::uuid,'email_sketch_2','email_sketch_2',7,41760),
      ('e72ab303-9d0c-4d03-8032-1589383cbec5'::uuid,'email_sketch_3','email_sketch_3',8,48960),
      ('e72ab303-9d0c-4d03-8032-1589383cbec5'::uuid,'email_sketch_4','email_sketch_4',9,60480),
      ('67366140-d847-4855-a3a5-53e4265e78ca'::uuid,'email_sketch_1','email_sketch_1',1,2880),
      ('67366140-d847-4855-a3a5-53e4265e78ca'::uuid,'email_sketch_2','email_sketch_2',2,4320),
      ('67366140-d847-4855-a3a5-53e4265e78ca'::uuid,'email_sketch_3','email_sketch_3',3,11520),
      ('67366140-d847-4855-a3a5-53e4265e78ca'::uuid,'email_sketch_4','email_sketch_4',4,23040)
    )
    SELECT * FROM steps
  LOOP
    UPDATE crm.workflow_steps
       SET step_name     = r.step_key,
           template_key  = r.template_key,
           step_order    = r.ord,
           delay_minutes = r.delay_minutes,
           step_type     = 'email',
           responsible_type = 'system',
           is_active     = true,
           updated_at    = now()
     WHERE workflow_id = r.workflow_id AND step_key = r.step_key;

    IF NOT FOUND THEN
      INSERT INTO crm.workflow_steps
        (workflow_id, step_key, step_name, step_type, responsible_type,
         template_key, step_order, delay_minutes, is_active)
      VALUES (r.workflow_id, r.step_key, r.step_key, 'email', 'system',
              r.template_key, r.ord, r.delay_minutes, true);
    END IF;
  END LOOP;
END $seed$;