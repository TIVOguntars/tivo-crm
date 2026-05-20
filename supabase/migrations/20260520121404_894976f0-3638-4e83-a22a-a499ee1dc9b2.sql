DROP VIEW IF EXISTS crm.v_tasks_queue_ui;

CREATE VIEW crm.v_tasks_queue_ui AS
WITH base AS (
  SELECT t.id,
    t.lead_id,
    t.task_type AS task_type,
    t.metadata->>'source' AS task_source,
    t.metadata->'definition'->>'rule_key' AS generator_rule_key,
    t.metadata->>'generated_for_date' AS generated_for_date,
    'task'::text AS action_source,
    COALESCE(NULLIF(btrim(t.title), ''), t.task_type) AS action_label,
    'human'::text AS action_owner_type,
    COALESCE(NULLIF(btrim(p.user_code), ''), NULLIF(btrim(pl.atbildigais), '')) AS action_owner_label,
    t.due_at,
    t.due_at AS effective_due_at,
    pl.full_name,
    pl.objekts AS object_name,
    pl.valsts AS country,
    pl.tags,
    pl.status AS legacy_lead_status,
    pl.ppv_vards AS ppv_name,
    pl.ppv_epasts AS ppv_email,
    pl.ppv_talrunis AS ppv_phone
  FROM crm.tasks t
  JOIN crm.leads cl ON cl.id = t.lead_id
  LEFT JOIN public.leads pl ON pl.id::text = cl.external_id
  LEFT JOIN crm.profiles p ON p.id = t.assigned_user_id
  WHERE t.status <> ALL (ARRAY['completed','cancelled','skipped','done'])
),
riga AS (
  SELECT b.*,
    (b.effective_due_at AT TIME ZONE 'Europe/Riga')::date AS due_date_riga,
    (now() AT TIME ZONE 'Europe/Riga')::date AS today_riga
  FROM base b
)
SELECT id, lead_id, action_source, action_label, action_owner_type, action_owner_label,
  due_at, effective_due_at, full_name, object_name, country, tags, legacy_lead_status,
  ppv_name, ppv_email, ppv_phone,
  task_type, task_source, generator_rule_key, generated_for_date,
  CASE WHEN effective_due_at IS NULL THEN 'planned'
    WHEN due_date_riga < today_riga THEN 'overdue'
    WHEN due_date_riga = today_riga THEN 'today'
    WHEN due_date_riga = today_riga + 1 THEN 'tomorrow'
    WHEN due_date_riga <= today_riga + 7 THEN 'this_week'
    ELSE 'upcoming' END AS queue_bucket,
  CASE WHEN effective_due_at IS NULL THEN 0
    WHEN due_date_riga < today_riga THEN 100
    WHEN due_date_riga = today_riga THEN 90
    WHEN due_date_riga <= today_riga + 7 THEN 60
    ELSE 30 END AS sort_priority,
  CASE WHEN effective_due_at IS NULL THEN 'planned'
    WHEN due_date_riga < today_riga - 7 THEN 'overdue_more_than_week'
    WHEN due_date_riga < today_riga THEN 'overdue_up_to_week'
    WHEN due_date_riga = today_riga THEN 'today'
    WHEN due_date_riga <= today_riga + 7 THEN 'this_week'
    ELSE 'planned' END AS due_filter_key,
  CASE WHEN effective_due_at IS NULL THEN 'Ieplānots'
    WHEN due_date_riga < today_riga - 7 THEN 'Kavēts vairāk par nedēļu'
    WHEN due_date_riga < today_riga THEN 'Kavēts līdz nedēļai'
    WHEN due_date_riga = today_riga THEN 'Šodien'
    WHEN due_date_riga <= today_riga + 7 THEN 'Šonedēļ'
    ELSE 'Ieplānots' END AS due_filter_label,
  CASE WHEN effective_due_at IS NULL THEN 5
    WHEN due_date_riga < today_riga - 7 THEN 1
    WHEN due_date_riga < today_riga THEN 2
    WHEN due_date_riga = today_riga THEN 3
    WHEN due_date_riga <= today_riga + 7 THEN 4
    ELSE 5 END AS due_filter_sort,
  0 AS priority_score,
  'Zema'::text AS priority_label,
  3 AS priority_filter_sort,
  (legacy_lead_status = ANY (ARRAY['Jauns','Nesasniedzams','Piesaistīšana','Kvalificēts'])) AS show_in_status_quick_filter
FROM riga r;

ALTER VIEW crm.v_tasks_queue_ui OWNER TO postgres;
GRANT ALL ON crm.v_tasks_queue_ui TO service_role;
GRANT SELECT ON crm.v_tasks_queue_ui TO anon, authenticated;