-- 1. Backup
CREATE TABLE crm._backup_tasks_cancelled_delete_20260521 AS
SELECT * FROM crm.tasks WHERE status = 'cancelled';

-- 2. Detach activities referencing cancelled tasks
UPDATE crm.activities
   SET task_id = NULL
 WHERE task_id IN (SELECT id FROM crm.tasks WHERE status = 'cancelled');

-- 3. Delete cancelled tasks
DELETE FROM crm.tasks WHERE status = 'cancelled';