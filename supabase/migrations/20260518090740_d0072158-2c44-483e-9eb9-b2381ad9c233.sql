DO $$
DECLARE
  v_affected integer;
BEGIN
  WITH eligible AS (
    SELECT q.id AS queue_id, q.lead_id, q.template_key,
           q.scheduled_for AS current_scheduled_for,
           q.workflow_instance_id, q.created_at,
           wi.priority AS instance_priority,
           wi.started_at AS instance_started_at,
           wi.workflow_key
    FROM crm.communication_queue q
    JOIN crm.workflow_instances wi ON wi.id = q.workflow_instance_id
    WHERE q.status='queued' AND q.channel='email'
      AND q.workflow_instance_id IS NOT NULL
      AND COALESCE((q.metadata->>'allocator_locked')::boolean,false)=false
      AND (q.metadata->>'edited_at') IS NULL
      AND COALESCE(q.metadata->>'reschedule_batch','') <> 'global_instance_reschedule_v2'
  ),
  step_join AS (
    SELECT e.*, ws.step_order, ws.delay_minutes
    FROM eligible e
    JOIN crm.workflow_definitions wd ON wd.workflow_key = e.workflow_key
    JOIN crm.workflow_steps ws ON ws.workflow_id = wd.id AND ws.template_key = e.template_key
  ),
  per_instance AS (
    SELECT workflow_instance_id,
           min(instance_priority) AS instance_priority,
           min(instance_started_at) AS instance_started_at,
           min(delay_minutes) AS min_delay
    FROM step_join GROUP BY workflow_instance_id
  ),
  instance_slots AS (
    SELECT pi.*, (row_number() OVER (
      ORDER BY COALESCE(pi.instance_priority,0) DESC,
               pi.instance_started_at ASC NULLS LAST,
               pi.workflow_instance_id) - 1) AS slot
    FROM per_instance pi
  ),
  instance_anchors AS (
    SELECT s.*,
      (((CURRENT_DATE AT TIME ZONE 'Europe/Riga')::date + 1
         + INTERVAL '8 hours'
         + (slot/80) * INTERVAL '1 day'
         + (slot%80) * INTERVAL '2 minutes')
       AT TIME ZONE 'Europe/Riga') AS new_instance_anchor
    FROM instance_slots s
  ),
  proposed AS (
    SELECT sj.queue_id,
           (ia.new_instance_anchor + (sj.delay_minutes - ia.min_delay) * INTERVAL '1 minute') AS proposed_scheduled_for
    FROM step_join sj
    JOIN instance_anchors ia USING (workflow_instance_id)
  ),
  upd AS (
    UPDATE crm.communication_queue q
    SET    scheduled_for = p.proposed_scheduled_for,
           metadata = q.metadata || jsonb_build_object(
             'reschedule_batch','global_instance_reschedule_v2',
             'reschedule_at', now(),
             'previous_scheduled_for', q.scheduled_for
           ),
           updated_at = now()
    FROM   proposed p
    WHERE  q.id = p.queue_id
      AND  q.status='queued' AND q.channel='email'
      AND  COALESCE((q.metadata->>'allocator_locked')::boolean,false)=false
      AND  (q.metadata->>'edited_at') IS NULL
    RETURNING 1
  )
  SELECT count(*) INTO v_affected FROM upd;

  RAISE NOTICE 'rescheduled rows: %', v_affected;
END $$;