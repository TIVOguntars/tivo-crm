CREATE OR REPLACE VIEW crm.v_lead_planned_actions AS
SELECT 'next_action'::text AS source,
       na.id,
       na.lead_id,
       na.action_type AS kind,
       na.status,
       na.due_at AS scheduled_for,
       NULL::text AS title,
       na.metadata
  FROM crm.lead_next_actions na
 WHERE na.status = ANY (ARRAY['pending'::text, 'in_progress'::text])
   AND NOT EXISTS (
     SELECT 1
       FROM crm.communication_queue q
      WHERE q.workflow_instance_id = NULLIF(na.metadata->>'workflow_instance_id','')::uuid
        AND q.metadata->>'workflow_step_id' = na.workflow_step_id::text
   )
UNION ALL
SELECT 'queue'::text AS source,
       q.id,
       q.lead_id,
       q.channel AS kind,
       q.status,
       q.scheduled_for,
       q.subject AS title,
       q.metadata
  FROM crm.communication_queue q
 WHERE q.status = ANY (ARRAY['queued'::text, 'sending'::text, 'blocked'::text])
UNION ALL
SELECT 'task'::text AS source,
       t.id,
       t.lead_id,
       COALESCE(t.task_type, 'task'::text) AS kind,
       t.status,
       t.due_at AS scheduled_for,
       t.title,
       t.metadata
  FROM crm.tasks t
 WHERE t.completed_at IS NULL;