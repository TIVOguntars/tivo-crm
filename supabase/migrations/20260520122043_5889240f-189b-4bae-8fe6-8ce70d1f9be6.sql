UPDATE crm.tasks
SET status = 'cancelled',
    metadata = COALESCE(metadata,'{}'::jsonb) || jsonb_build_object(
      'cancel_reason','legacy_generator_cleanup_v2',
      'cancelled_at', now(),
      'cancelled_by','system_stabilization'
    )
WHERE status = 'planned'
  AND metadata->>'source' = 'daily_planned_task_generator'
  AND (metadata->'definition'->>'rule_key') IS NULL;