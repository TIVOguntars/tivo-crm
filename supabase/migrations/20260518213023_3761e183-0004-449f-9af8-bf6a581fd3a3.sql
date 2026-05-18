-- Additive migration: create crm.v_tasks_queue_ui (read-only view)
-- Does NOT modify or drop crm.next_action_queue_filter_ui or any other object.
-- Frontend is not switched in this migration.

CREATE OR REPLACE VIEW crm.v_tasks_queue_ui AS
WITH base AS (
  SELECT
    t.id,
    t.lead_id,
    'task'::text                                 AS action_source,
    COALESCE(NULLIF(TRIM(t.title), ''), t.task_type)
                                                 AS action_label,
    'human'::text                                AS action_owner_type,
    COALESCE(
      u.raw_user_meta_data->>'initials',
      u.raw_user_meta_data->>'short_code',
      NULLIF(TRIM(pl.atbildigais), '')
    )                                            AS action_owner_label,
    t.due_at,
    t.due_at                                     AS effective_due_at,
    pl.full_name,
    pl.objekts                                   AS object_name,
    pl.valsts                                    AS country,
    pl.tags,
    pl.status                                    AS legacy_lead_status,
    pl.ppv_vards                                 AS ppv_name,
    pl.ppv_epasts                                AS ppv_email,
    pl.ppv_talrunis                              AS ppv_phone
  FROM crm.tasks t
  JOIN crm.leads cl ON cl.id = t.lead_id
  LEFT JOIN public.leads pl
         ON pl.id::text = cl.external_id
  LEFT JOIN auth.users u
         ON u.id = t.assigned_user_id
  WHERE t.status NOT IN ('completed','cancelled','skipped','done')
),
riga AS (
  SELECT
    b.*,
    (b.effective_due_at AT TIME ZONE 'Europe/Riga')::date AS due_date_riga,
    ((now() AT TIME ZONE 'Europe/Riga')::date)            AS today_riga
  FROM base b
)
SELECT
  r.id,
  r.lead_id,
  r.action_source,
  r.action_label,
  r.action_owner_type,
  r.action_owner_label,
  r.due_at,
  r.effective_due_at,
  r.full_name,
  r.object_name,
  r.country,
  r.tags,
  r.legacy_lead_status,
  r.ppv_name,
  r.ppv_email,
  r.ppv_phone,
  CASE
    WHEN r.effective_due_at IS NULL          THEN 'planned'
    WHEN r.due_date_riga <  r.today_riga     THEN 'overdue'
    WHEN r.due_date_riga =  r.today_riga     THEN 'today'
    WHEN r.due_date_riga =  r.today_riga + 1 THEN 'tomorrow'
    WHEN r.due_date_riga <= r.today_riga + 7 THEN 'this_week'
    ELSE 'upcoming'
  END                                              AS queue_bucket,
  CASE
    WHEN r.effective_due_at IS NULL              THEN 0
    WHEN r.due_date_riga <  r.today_riga         THEN 100
    WHEN r.due_date_riga =  r.today_riga         THEN 90
    WHEN r.due_date_riga <= r.today_riga + 7     THEN 60
    ELSE 30
  END                                              AS sort_priority,
  CASE
    WHEN r.effective_due_at IS NULL          THEN 'planned'
    WHEN r.due_date_riga <  r.today_riga - 7 THEN 'overdue_more_than_week'
    WHEN r.due_date_riga <  r.today_riga     THEN 'overdue_up_to_week'
    WHEN r.due_date_riga =  r.today_riga     THEN 'today'
    WHEN r.due_date_riga <= r.today_riga + 7 THEN 'this_week'
    ELSE 'planned'
  END                                              AS due_filter_key,
  CASE
    WHEN r.effective_due_at IS NULL          THEN 'Ieplānots'
    WHEN r.due_date_riga <  r.today_riga - 7 THEN 'Kavēts vairāk par nedēļu'
    WHEN r.due_date_riga <  r.today_riga     THEN 'Kavēts līdz nedēļai'
    WHEN r.due_date_riga =  r.today_riga     THEN 'Šodien'
    WHEN r.due_date_riga <= r.today_riga + 7 THEN 'Šonedēļ'
    ELSE 'Ieplānots'
  END                                              AS due_filter_label,
  CASE
    WHEN r.effective_due_at IS NULL          THEN 5
    WHEN r.due_date_riga <  r.today_riga - 7 THEN 1
    WHEN r.due_date_riga <  r.today_riga     THEN 2
    WHEN r.due_date_riga =  r.today_riga     THEN 3
    WHEN r.due_date_riga <= r.today_riga + 7 THEN 4
    ELSE 5
  END                                              AS due_filter_sort,
  0::int                                           AS priority_score,
  'Zema'::text                                     AS priority_label,
  3                                                AS priority_filter_sort,
  (r.legacy_lead_status IN ('Jauns','Nesasniedzams','Piesaistīšana','Kvalificēts'))
                                                   AS show_in_status_quick_filter
FROM riga r;

-- Grants: mirror access of existing queue views
GRANT USAGE  ON SCHEMA crm           TO anon, authenticated, service_role;
GRANT SELECT ON crm.v_tasks_queue_ui TO anon, authenticated, service_role;