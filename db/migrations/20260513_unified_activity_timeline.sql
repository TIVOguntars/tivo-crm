-- =============================================================================
-- analytics.unified_activity_timeline
-- =============================================================================
-- Read-only VIEW combining all lead-centric activity into a single chronological
-- feed. Source priority and field mapping per spec dated 2026-05-13.
--
-- Sources (crm.* only; never public.*):
--   1. crm.communications
--   2. crm.communication_events  (subset of event_type)
--   3. crm.notes
--   4. crm.tasks
--   5. crm.activities
--   6. crm.action_history
--   7. crm.audit_events          (entity_type='lead', noisy fields suppressed)
--   8. crm.automation_runs       (entity_type='lead')
--   9. crm.import_changes JOIN crm.import_sessions  (one row per session+lead)
--
-- Frontend contract:
--   GET .../analytics/unified_activity_timeline
--       ?lead_id=eq.<uuid>&order=timeline_at.desc&limit=50
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS analytics;

DROP VIEW IF EXISTS analytics.unified_activity_timeline CASCADE;

CREATE VIEW analytics.unified_activity_timeline AS

-- 1) MESSAGES -----------------------------------------------------------------
SELECT
  ('comm:' || c.id::text)                                AS activity_id,
  c.lead_id                                              AS lead_id,
  c.contact_id                                           AS contact_id,
  c.object_id                                            AS object_id,
  NULL::uuid                                             AS task_id,
  c.id                                                   AS communication_id,
  'message'::text                                        AS activity_type,
  c.channel::text                                        AS activity_subtype,
  c.channel::text                                        AS channel,
  c.direction::text                                      AS direction,
  COALESCE(NULLIF(c.subject, ''), c.channel::text)       AS title,
  c.body                                                 AS preview,
  c.status::text                                         AS status,
  CASE WHEN c.direction = 'inbound' THEN 'contact' ELSE 'user' END AS actor_type,
  NULL::uuid                                             AS actor_id,
  NULL::text                                             AS actor_name,
  COALESCE(c.provider, 'crm')::text                      AS source_system,
  'crm.communications'::text                             AS source_table,
  c.id                                                   AS source_row_id,
  c.created_at                                           AS timeline_at,
  c.created_at                                           AS created_at,
  COALESCE(to_jsonb(c) - 'body' - 'subject', '{}'::jsonb) AS metadata
FROM crm.communications c
WHERE c.lead_id IS NOT NULL

UNION ALL

-- 2) MESSAGE EVENTS -----------------------------------------------------------
SELECT
  ('cevt:' || e.id::text)                                AS activity_id,
  e.lead_id                                              AS lead_id,
  NULL::uuid                                             AS contact_id,
  NULL::uuid                                             AS object_id,
  NULL::uuid                                             AS task_id,
  e.communication_id                                     AS communication_id,
  'message_event'::text                                  AS activity_type,
  e.event_type::text                                     AS activity_subtype,
  e.channel::text                                        AS channel,
  NULL::text                                             AS direction,
  e.event_type::text                                     AS title,
  e.link_url                                             AS preview,
  e.event_type::text                                     AS status,
  'system'::text                                         AS actor_type,
  NULL::uuid                                             AS actor_id,
  NULL::text                                             AS actor_name,
  COALESCE(e.provider, 'crm')::text                      AS source_system,
  'crm.communication_events'::text                       AS source_table,
  e.id                                                   AS source_row_id,
  COALESCE(e.event_at, e.event_timestamp, e.created_at)  AS timeline_at,
  e.created_at                                           AS created_at,
  COALESCE(to_jsonb(e), '{}'::jsonb)                     AS metadata
FROM crm.communication_events e
WHERE e.lead_id IS NOT NULL
  AND e.event_type IN ('reply','click','failed','bounced','unsubscribed')

UNION ALL

-- 3) NOTES --------------------------------------------------------------------
SELECT
  ('note:' || n.id::text)                                AS activity_id,
  n.lead_id                                              AS lead_id,
  NULL::uuid                                             AS contact_id,
  n.object_id                                            AS object_id,
  NULL::uuid                                             AS task_id,
  NULL::uuid                                             AS communication_id,
  'note'::text                                           AS activity_type,
  n.note_type::text                                      AS activity_subtype,
  NULL::text                                             AS channel,
  NULL::text                                             AS direction,
  COALESCE(n.note_type::text, 'note')                    AS title,
  n.content                                              AS preview,
  NULL::text                                             AS status,
  'user'::text                                           AS actor_type,
  n.created_by_user_id                                   AS actor_id,
  NULL::text                                             AS actor_name,
  'crm'::text                                            AS source_system,
  'crm.notes'::text                                      AS source_table,
  n.id                                                   AS source_row_id,
  n.created_at                                           AS timeline_at,
  n.created_at                                           AS created_at,
  COALESCE(to_jsonb(n) - 'content', '{}'::jsonb)         AS metadata
FROM crm.notes n
WHERE n.lead_id IS NOT NULL

UNION ALL

-- 4) TASKS --------------------------------------------------------------------
SELECT
  ('task:' || t.id::text)                                AS activity_id,
  t.lead_id                                              AS lead_id,
  NULL::uuid                                             AS contact_id,
  t.object_id                                            AS object_id,
  t.id                                                   AS task_id,
  NULL::uuid                                             AS communication_id,
  'task'::text                                           AS activity_type,
  t.task_type::text                                      AS activity_subtype,
  NULL::text                                             AS channel,
  NULL::text                                             AS direction,
  COALESCE(NULLIF(t.title, ''), t.task_type::text, 'task') AS title,
  t.description                                          AS preview,
  t.status::text                                         AS status,
  CASE WHEN COALESCE(t.is_auto_created, FALSE) THEN 'automation' ELSE 'user' END AS actor_type,
  t.created_by_user_id                                   AS actor_id,
  NULL::text                                             AS actor_name,
  'crm'::text                                            AS source_system,
  'crm.tasks'::text                                      AS source_table,
  t.id                                                   AS source_row_id,
  COALESCE(t.completed_at, t.due_at, t.created_at)       AS timeline_at,
  t.created_at                                           AS created_at,
  COALESCE(to_jsonb(t) - 'description', '{}'::jsonb)     AS metadata
FROM crm.tasks t
WHERE t.lead_id IS NOT NULL

UNION ALL

-- 5) ACTIVITIES ---------------------------------------------------------------
SELECT
  ('act:' || a.id::text)                                 AS activity_id,
  a.lead_id                                              AS lead_id,
  NULL::uuid                                             AS contact_id,
  a.object_id                                            AS object_id,
  a.task_id                                              AS task_id,
  a.communication_id                                     AS communication_id,
  COALESCE(a.activity_type::text, 'activity')            AS activity_type,
  NULL::text                                             AS activity_subtype,
  NULL::text                                             AS channel,
  NULL::text                                             AS direction,
  COALESCE(a.activity_type::text, 'activity')            AS title,
  a.summary                                              AS preview,
  NULL::text                                             AS status,
  'user'::text                                           AS actor_type,
  a.performed_by_user_id                                 AS actor_id,
  NULL::text                                             AS actor_name,
  'crm'::text                                            AS source_system,
  'crm.activities'::text                                 AS source_table,
  a.id                                                   AS source_row_id,
  COALESCE(a.activity_at, a.created_at)                  AS timeline_at,
  a.created_at                                           AS created_at,
  COALESCE(to_jsonb(a) - 'summary', '{}'::jsonb)         AS metadata
FROM crm.activities a
WHERE a.lead_id IS NOT NULL

UNION ALL

-- 6) ACTION HISTORY -----------------------------------------------------------
SELECT
  ('ah:' || ah.id::text)                                 AS activity_id,
  ah.lead_id                                             AS lead_id,
  NULL::uuid                                             AS contact_id,
  NULL::uuid                                             AS object_id,
  NULL::uuid                                             AS task_id,
  NULL::uuid                                             AS communication_id,
  'action'::text                                         AS activity_type,
  'completed_next_action'::text                          AS activity_subtype,
  NULL::text                                             AS channel,
  NULL::text                                             AS direction,
  COALESCE(NULLIF(ah.previous_action, ''), 'next_action') AS title,
  ah.completion_note                                     AS preview,
  'completed'::text                                      AS status,
  'user'::text                                           AS actor_type,
  NULL::uuid                                             AS actor_id,
  ah.completed_by                                        AS actor_name,
  COALESCE(ah.source, 'crm')::text                       AS source_system,
  'crm.action_history'::text                             AS source_table,
  ah.id                                                  AS source_row_id,
  ah.completed_at                                        AS timeline_at,
  COALESCE(ah.created_at, ah.completed_at)               AS created_at,
  COALESCE(to_jsonb(ah) - 'completion_note', '{}'::jsonb) AS metadata
FROM crm.action_history ah
WHERE ah.lead_id IS NOT NULL

UNION ALL

-- 7) AUDIT EVENTS (lead only, noisy fields suppressed) ------------------------
SELECT
  ('aud:' || ae.id::text)                                AS activity_id,
  ae.entity_id                                           AS lead_id,
  NULL::uuid                                             AS contact_id,
  NULL::uuid                                             AS object_id,
  NULL::uuid                                             AS task_id,
  NULL::uuid                                             AS communication_id,
  COALESCE(ae.action_type::text, 'audit')                AS activity_type,
  ae.event_key::text                                     AS activity_subtype,
  NULL::text                                             AS channel,
  NULL::text                                             AS direction,
  COALESCE(NULLIF(ae.event_name, ''), ae.action_type::text, 'audit') AS title,
  ae.event_description                                   AS preview,
  ae.approval_state::text                                AS status,
  COALESCE(ae.source_type, 'system')::text               AS actor_type,
  ae.actor_user_id                                       AS actor_id,
  NULL::text                                             AS actor_name,
  COALESCE(ae.source_system, 'crm')::text                AS source_system,
  'crm.audit_events'::text                               AS source_table,
  ae.id                                                  AS source_row_id,
  ae.created_at                                          AS timeline_at,
  ae.created_at                                          AS created_at,
  COALESCE(to_jsonb(ae), '{}'::jsonb)                    AS metadata
FROM crm.audit_events ae
WHERE ae.entity_type = 'lead'
  AND NOT (
    -- suppress rows whose only changed columns are noise
    ae.changed_fields IS NOT NULL
    AND (
      (jsonb_typeof(ae.changed_fields) = 'array'
         AND (ae.changed_fields <@ '["updated_at","raw_data"]'::jsonb))
      OR
      (jsonb_typeof(ae.changed_fields) = 'object'
         AND (ARRAY(SELECT jsonb_object_keys(ae.changed_fields))
              <@ ARRAY['updated_at','raw_data']))
    )
  )

UNION ALL

-- 8) AUTOMATION RUNS ----------------------------------------------------------
SELECT
  ('autorun:' || ar.id::text)                            AS activity_id,
  ar.entity_id                                           AS lead_id,
  NULL::uuid                                             AS contact_id,
  NULL::uuid                                             AS object_id,
  NULL::uuid                                             AS task_id,
  NULL::uuid                                             AS communication_id,
  'automation'::text                                     AS activity_type,
  ar.trigger_event::text                                 AS activity_subtype,
  NULL::text                                             AS channel,
  NULL::text                                             AS direction,
  COALESCE(NULLIF(ar.trigger_event, ''), 'automation')   AS title,
  ar.error_message                                       AS preview,
  ar.status::text                                        AS status,
  'automation'::text                                     AS actor_type,
  NULL::uuid                                             AS actor_id,
  NULL::text                                             AS actor_name,
  'crm'::text                                            AS source_system,
  'crm.automation_runs'::text                            AS source_table,
  ar.id                                                  AS source_row_id,
  COALESCE(ar.completed_at, ar.started_at, ar.scheduled_at, ar.created_at) AS timeline_at,
  ar.created_at                                          AS created_at,
  COALESCE(to_jsonb(ar) - 'error_message', '{}'::jsonb)  AS metadata
FROM crm.automation_runs ar
WHERE ar.entity_type = 'lead'
  AND ar.entity_id IS NOT NULL

UNION ALL

-- 9) IMPORT — one grouped row per (lead, import_session) ----------------------
SELECT
  ('imp:' || ic.import_session_id::text || ':' || ic.entity_id::text) AS activity_id,
  ic.entity_id                                           AS lead_id,
  NULL::uuid                                             AS contact_id,
  NULL::uuid                                             AS object_id,
  NULL::uuid                                             AS task_id,
  NULL::uuid                                             AS communication_id,
  'import'::text                                         AS activity_type,
  isess.import_type::text                                AS activity_subtype,
  NULL::text                                             AS channel,
  NULL::text                                             AS direction,
  'Import changes'::text                                 AS title,
  (ic.changed_count::text || ' field(s) changed')        AS preview,
  ic.aggregate_approval_status                           AS status,
  'import'::text                                         AS actor_type,
  NULL::uuid                                             AS actor_id,
  NULL::text                                             AS actor_name,
  COALESCE(isess.source_system, 'crm')::text             AS source_system,
  'crm.import_changes'::text                             AS source_table,
  -- synthetic stable row id derived from grouping key
  md5(ic.import_session_id::text || ':' || ic.entity_id::text)::uuid AS source_row_id,
  ic.first_changed_at                                    AS timeline_at,
  ic.first_changed_at                                    AS created_at,
  jsonb_build_object(
    'import_session_id', ic.import_session_id,
    'changed_count',     ic.changed_count,
    'fields',            ic.fields
  )                                                      AS metadata
FROM (
  SELECT
    c.entity_id,
    c.import_session_id,
    COUNT(*)            AS changed_count,
    MIN(c.created_at)   AS first_changed_at,
    -- aggregate worst-case approval status (pending > rejected > approved)
    CASE
      WHEN bool_or(c.approval_status = 'pending')  THEN 'pending'
      WHEN bool_or(c.approval_status = 'rejected') THEN 'rejected'
      WHEN bool_or(c.approval_status = 'approved') THEN 'approved'
      ELSE NULL
    END                 AS aggregate_approval_status,
    jsonb_agg(
      jsonb_build_object(
        'field_name',        c.field_name,
        'old_value',         c.old_value,
        'new_value',         c.new_value,
        'change_type',       c.change_type,
        'validation_status', c.validation_status,
        'approval_status',   c.approval_status,
        'has_conflict',      c.has_conflict,
        'conflict_type',     c.conflict_type
      )
      ORDER BY c.created_at
    )                   AS fields
  FROM crm.import_changes c
  WHERE c.entity_type = 'lead'
    AND c.entity_id IS NOT NULL
  GROUP BY c.entity_id, c.import_session_id
) ic
LEFT JOIN crm.import_sessions isess
  ON isess.id = ic.import_session_id
;

COMMENT ON VIEW analytics.unified_activity_timeline IS
  'MVP unified lead activity feed. Read-only. Source priority documented in '
  'db/migrations/20260513_unified_activity_timeline.sql. Frontend contract: '
  'lead_id=eq.<uuid>&order=timeline_at.desc&limit=50.';

-- Grants (PostgREST roles) ----------------------------------------------------
-- Adjust role names to match this project's PostgREST setup.
GRANT USAGE ON SCHEMA analytics TO authenticated, anon, service_role;
GRANT SELECT ON analytics.unified_activity_timeline
  TO authenticated, anon, service_role;

-- Recommended supporting indexes on source tables (idempotent) ----------------
CREATE INDEX IF NOT EXISTS idx_comm_lead_created
  ON crm.communications (lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_commevt_lead_eventat
  ON crm.communication_events (lead_id, COALESCE(event_at, event_timestamp, created_at) DESC)
  WHERE event_type IN ('reply','click','failed','bounced','unsubscribed');
CREATE INDEX IF NOT EXISTS idx_notes_lead_created
  ON crm.notes (lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_lead_timeline
  ON crm.tasks (lead_id, COALESCE(completed_at, due_at, created_at) DESC);
CREATE INDEX IF NOT EXISTS idx_activities_lead_at
  ON crm.activities (lead_id, COALESCE(activity_at, created_at) DESC);
CREATE INDEX IF NOT EXISTS idx_action_history_lead_completed
  ON crm.action_history (lead_id, completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_lead_created
  ON crm.audit_events (entity_id, created_at DESC)
  WHERE entity_type = 'lead';
CREATE INDEX IF NOT EXISTS idx_autorun_lead_timeline
  ON crm.automation_runs (entity_id, COALESCE(completed_at, started_at, scheduled_at, created_at) DESC)
  WHERE entity_type = 'lead';
CREATE INDEX IF NOT EXISTS idx_import_changes_lead_session
  ON crm.import_changes (entity_id, import_session_id, created_at)
  WHERE entity_type = 'lead';

-- =============================================================================
-- Verification query (matches the spec's expected output for Lars)
-- =============================================================================
-- SELECT activity_type, activity_subtype, channel, direction,
--        title, status, timeline_at, source_table
-- FROM   analytics.unified_activity_timeline
-- WHERE  lead_id = 'd91bfc66-b709-4906-9b76-21b8420d5e8c'
-- ORDER  BY timeline_at DESC
-- LIMIT  50;