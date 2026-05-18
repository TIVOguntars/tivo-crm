GRANT USAGE ON SCHEMA crm TO anon, authenticated, service_role;
GRANT SELECT ON crm.v_tasks_queue_ui TO anon, authenticated, service_role;
NOTIFY pgrst, 'reload schema';