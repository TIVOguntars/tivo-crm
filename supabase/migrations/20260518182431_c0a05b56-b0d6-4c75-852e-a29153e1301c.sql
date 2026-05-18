-- F1 BUILD: backfill 'Gaida' rows from crm.lead_next_actions into crm.tasks.
-- Strict scope: INSERT only. No status changes on lead_next_actions.
-- Dedup key: metadata->>'lead_next_action_id'.

BEGIN;

INSERT INTO crm.tasks (
    lead_id,
    task_type,
    status,
    priority,
    title,
    description,
    due_at,
    assigned_user_id,
    is_auto_created,
    workflow_instance_id,
    metadata,
    created_at
)
SELECT
    lna.lead_id,
    'other'::text                                                      AS task_type,
    'planned'::text                                                    AS status,
    'normal'::text                                                     AS priority,
    lna.action_type                                                    AS title,
    'Backfill from lead_next_actions ('
        || COALESCE(lna.metadata->>'workflow_key', '?') || '/'
        || COALESCE(lna.metadata->>'step_key', '?') || ')'             AS description,
    lna.due_at,
    NULL::uuid                                                         AS assigned_user_id,
    true                                                               AS is_auto_created,
    NULL::uuid                                                         AS workflow_instance_id,
    jsonb_build_object(
        'lead_next_action_id',  lna.id,
        'source',               'f1_backfill',
        'original_action_type', lna.action_type,
        'workflow_id',          lna.workflow_id,
        'workflow_step_id',     lna.workflow_step_id,
        'step_key',             lna.metadata->>'step_key',
        'workflow_key',         lna.metadata->>'workflow_key'
    )                                                                  AS metadata,
    lna.created_at
FROM crm.lead_next_actions lna
WHERE lna.status = 'Gaida'
  AND NOT EXISTS (
      SELECT 1
      FROM crm.tasks t
      WHERE t.metadata->>'lead_next_action_id' = lna.id::text
  );

COMMIT;