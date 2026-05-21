CREATE TABLE IF NOT EXISTS crm._backup_tasks_pretest_20260521 AS
SELECT * FROM crm.tasks
 WHERE is_auto_created = true
   AND task_type = 'call'
   AND status IN ('planned','overdue')
   AND metadata->>'source' = 'daily_planned_task_generator'
   AND task_type NOT IN ('email','manual_email')
   AND COALESCE(metadata->>'source','') NOT ILIKE '%email%'
   AND NOT (metadata ? 'communication_id');

DELETE FROM crm.tasks
 WHERE is_auto_created = true
   AND task_type = 'call'
   AND status IN ('planned','overdue')
   AND metadata->>'source' = 'daily_planned_task_generator'
   AND task_type NOT IN ('email','manual_email')
   AND COALESCE(metadata->>'source','') NOT ILIKE '%email%'
   AND NOT (metadata ? 'communication_id');