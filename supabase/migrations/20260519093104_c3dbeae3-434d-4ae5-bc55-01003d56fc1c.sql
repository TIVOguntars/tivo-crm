DELETE FROM crm.activities WHERE task_id IN (SELECT id FROM crm.tasks WHERE title = 'Sākotnējā pārbaude');
DELETE FROM crm.tasks WHERE title = 'Sākotnējā pārbaude';