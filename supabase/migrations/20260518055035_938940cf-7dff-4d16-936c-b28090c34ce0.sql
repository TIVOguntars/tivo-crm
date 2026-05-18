UPDATE crm.communication_queue AS q
SET
  metadata   = q.metadata || jsonb_build_object('daily_bucket', 'existing'),
  updated_at = now()
WHERE q.channel               = 'email'
  AND q.status                = 'queued'
  AND q.scheduled_for         < now()
  AND q.workflow_instance_id IS NOT NULL
  AND (q.metadata ->> 'daily_bucket') IS DISTINCT FROM 'existing';