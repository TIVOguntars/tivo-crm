CREATE TABLE IF NOT EXISTS crm._backup_tasks_cleanup_20260520 AS
WITH base AS (
  SELECT
    t.id                AS task_id,
    t.lead_id,
    t.assigned_user_id,
    t.status            AS status_before,
    t.created_at        AS task_created_at,
    l.status            AS lead_status,
    l.created_at        AS lead_created_at,
    COALESCE(ct.phone_validated, false) AS has_valid_phone
  FROM crm.tasks t
  LEFT JOIN crm.leads    l  ON l.id  = t.lead_id
  LEFT JOIN crm.contacts ct ON ct.id = l.contact_id
  WHERE t.task_type             = 'call'
    AND t.status                = 'planned'
    AND t.is_auto_created       = true
    AND t.assigned_user_id      = '477b82e1-b09a-428d-9f65-32aa2ea5a551'
    AND t.metadata->>'source'   = 'daily_planned_task_generator'
),
ranked_callable AS (
  SELECT
    task_id,
    ROW_NUMBER() OVER (
      ORDER BY
        (lead_status = 'Jauns')  DESC,
        lead_created_at          DESC NULLS LAST,
        task_created_at          DESC
    ) AS keeper_rank
  FROM base
  WHERE has_valid_phone = true
)
SELECT
  b.*,
  CASE
    WHEN rc.keeper_rank IS NOT NULL AND rc.keeper_rank <= 60 THEN 'keep'
    ELSE 'cancel'
  END AS decision,
  rc.keeper_rank
FROM base b
LEFT JOIN ranked_callable rc ON rc.task_id = b.task_id;

WITH base AS (
  SELECT
    t.id                AS task_id,
    l.status            AS lead_status,
    l.created_at        AS lead_created_at,
    t.created_at        AS task_created_at,
    COALESCE(ct.phone_validated, false) AS has_valid_phone
  FROM crm.tasks t
  LEFT JOIN crm.leads    l  ON l.id  = t.lead_id
  LEFT JOIN crm.contacts ct ON ct.id = l.contact_id
  WHERE t.task_type             = 'call'
    AND t.status                = 'planned'
    AND t.is_auto_created       = true
    AND t.assigned_user_id      = '477b82e1-b09a-428d-9f65-32aa2ea5a551'
    AND t.metadata->>'source'   = 'daily_planned_task_generator'
),
keepers AS (
  SELECT task_id
  FROM (
    SELECT
      task_id,
      ROW_NUMBER() OVER (
        ORDER BY
          (lead_status = 'Jauns') DESC,
          lead_created_at         DESC NULLS LAST,
          task_created_at         DESC
      ) AS keeper_rank
    FROM base
    WHERE has_valid_phone = true
  ) r
  WHERE keeper_rank <= 60
)
UPDATE crm.tasks t
   SET status           = 'cancelled',
       cancelled_reason = 'phase2_mvp_cap_cleanup_20260520',
       updated_at       = now(),
       metadata         = COALESCE(t.metadata, '{}'::jsonb)
                          || jsonb_build_object(
                               'cleanup', jsonb_build_object(
                                 'batch',           'phase2_mvp_cap_cleanup_20260520',
                                 'reason',          'exceeded_daily_cap_60_or_non_callable',
                                 'previous_status', 'planned',
                                 'cancelled_at',    now()
                               )
                             )
 WHERE t.task_type             = 'call'
   AND t.status                = 'planned'
   AND t.is_auto_created       = true
   AND t.assigned_user_id      = '477b82e1-b09a-428d-9f65-32aa2ea5a551'
   AND t.metadata->>'source'   = 'daily_planned_task_generator'
   AND t.id NOT IN (SELECT task_id FROM keepers);