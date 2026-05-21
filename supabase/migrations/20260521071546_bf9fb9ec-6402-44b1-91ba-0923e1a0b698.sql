-- =============================================================
-- PART A — Cleanup of current planned Auto-call tasks for BJ
-- =============================================================

CREATE TABLE IF NOT EXISTS crm._backup_tasks_phase2_1_ppv_cleanup_20260521 AS
WITH cfg AS (
  SELECT
    (SELECT value_json FROM crm.settings WHERE setting_key='outreach.daily_quota'      AND is_active) AS quota,
    (SELECT value_json FROM crm.settings WHERE setting_key='outreach.eligible_statuses' AND is_active) AS elig,
    (SELECT value_json FROM crm.settings WHERE setting_key='ppv.auto_reschedule'        AND is_active) AS resch
),
base AS (
  SELECT
    t.id                                       AS task_id,
    t.lead_id,
    t.assigned_user_id,
    t.status                                   AS status_before,
    t.created_at                               AS task_created_at,
    (t.metadata->>'generated_for_date')::date  AS generated_for_date,
    l.status                                   AS lead_status,
    l.created_at                               AS lead_created_at,
    l.ppv_user_id,
    p.user_code                                AS ppv_code,
    c.full_name,
    COALESCE(c.phone_validated, false)         AS phone_validated,
    c.phone_e164
  FROM crm.tasks t
  LEFT JOIN crm.leads    l ON l.id = t.lead_id
  LEFT JOIN crm.contacts c ON c.id = l.contact_id
  LEFT JOIN crm.profiles p ON p.id = l.ppv_user_id
  WHERE t.task_type        = 'call'
    AND t.status           = 'planned'
    AND t.is_auto_created  = true
    AND t.assigned_user_id = '477b82e1-b09a-428d-9f65-32aa2ea5a551'
    AND t.metadata->>'source' = 'daily_planned_task_generator'
),
enriched AS (
  SELECT b.*, cfg.quota, cfg.elig, cfg.resch,
    (SELECT MAX(t2.completed_at)
       FROM crm.tasks t2
      WHERE t2.lead_id=b.lead_id AND t2.task_type='call'
        AND t2.status='completed' AND t2.outcome_code='no_answer') AS last_no_answer_at
  FROM base b CROSS JOIN cfg
),
classified AS (
  SELECT e.*,
    CASE
      WHEN e.ppv_user_id IS NULL                                              THEN 'no_ppv'
      WHEN NOT (e.quota->'per_ppv_user' ? e.ppv_code)                         THEN 'ppv_not_in_quota'
      WHEN NOT e.phone_validated OR e.phone_e164 IS NULL                      THEN 'invalid_phone'
      WHEN e.full_name IS NULL OR btrim(e.full_name) = ''                     THEN 'blank_name'
      WHEN NOT (e.elig->'values' ? e.lead_status)                             THEN 'ineligible_status'
      WHEN e.lead_status = 'Nesasniedzams'
           AND (
             e.last_no_answer_at IS NULL
             OR e.last_no_answer_at
                > ((now() AT TIME ZONE 'Europe/Riga')::date
                   - ((e.resch->>'no_answer_days')::int) * interval '1 day')
                  AT TIME ZONE 'Europe/Riga'
           )                                                                  THEN 'invalid_recovery_state'
      ELSE NULL
    END AS disqualifier
  FROM enriched e
),
ranked AS (
  SELECT c.*,
    CASE WHEN c.disqualifier IS NULL THEN
      ROW_NUMBER() OVER (
        PARTITION BY c.ppv_code, c.generated_for_date
        ORDER BY (c.lead_status='Jauns') DESC,
                 c.lead_created_at DESC NULLS LAST,
                 c.task_created_at DESC)
    END AS keeper_rank,
    CASE WHEN c.disqualifier IS NULL
         THEN NULLIF((c.quota->'per_ppv_user'->>c.ppv_code),'')::int
    END AS ppv_cap
  FROM classified c
)
SELECT r.*,
  CASE
    WHEN r.disqualifier IS NOT NULL THEN 'cancel'
    WHEN r.keeper_rank <= r.ppv_cap THEN 'keep'
    ELSE 'cancel'
  END AS decision,
  CASE
    WHEN r.disqualifier IS NOT NULL THEN r.disqualifier
    WHEN r.keeper_rank <= r.ppv_cap THEN NULL
    ELSE 'exceeded_ppv_daily_cap'
  END AS cancel_reason
FROM ranked r;

WITH cfg AS (
  SELECT
    (SELECT value_json FROM crm.settings WHERE setting_key='outreach.daily_quota'      AND is_active) AS quota,
    (SELECT value_json FROM crm.settings WHERE setting_key='outreach.eligible_statuses' AND is_active) AS elig,
    (SELECT value_json FROM crm.settings WHERE setting_key='ppv.auto_reschedule'        AND is_active) AS resch
),
base AS (
  SELECT t.id AS task_id, t.lead_id, t.created_at AS task_created_at,
         (t.metadata->>'generated_for_date')::date AS generated_for_date,
         l.status AS lead_status, l.created_at AS lead_created_at,
         l.ppv_user_id, p.user_code AS ppv_code,
         c.full_name, COALESCE(c.phone_validated,false) AS phone_validated, c.phone_e164
  FROM crm.tasks t
  LEFT JOIN crm.leads    l ON l.id=t.lead_id
  LEFT JOIN crm.contacts c ON c.id=l.contact_id
  LEFT JOIN crm.profiles p ON p.id=l.ppv_user_id
  WHERE t.task_type='call' AND t.status='planned' AND t.is_auto_created=true
    AND t.assigned_user_id='477b82e1-b09a-428d-9f65-32aa2ea5a551'
    AND t.metadata->>'source'='daily_planned_task_generator'
),
classified AS (
  SELECT b.*,
    (SELECT MAX(t2.completed_at) FROM crm.tasks t2
      WHERE t2.lead_id=b.lead_id AND t2.task_type='call'
        AND t2.status='completed' AND t2.outcome_code='no_answer') AS last_no_answer_at,
    cfg.quota, cfg.elig, cfg.resch
  FROM base b CROSS JOIN cfg
),
with_reason AS (
  SELECT c.*,
    CASE
      WHEN c.ppv_user_id IS NULL                                THEN 'no_ppv'
      WHEN NOT (c.quota->'per_ppv_user' ? c.ppv_code)           THEN 'ppv_not_in_quota'
      WHEN NOT c.phone_validated OR c.phone_e164 IS NULL        THEN 'invalid_phone'
      WHEN c.full_name IS NULL OR btrim(c.full_name)=''         THEN 'blank_name'
      WHEN NOT (c.elig->'values' ? c.lead_status)               THEN 'ineligible_status'
      WHEN c.lead_status='Nesasniedzams'
           AND (c.last_no_answer_at IS NULL
                OR c.last_no_answer_at >
                   ((now() AT TIME ZONE 'Europe/Riga')::date
                    - ((c.resch->>'no_answer_days')::int) * interval '1 day')
                   AT TIME ZONE 'Europe/Riga')                  THEN 'invalid_recovery_state'
      ELSE NULL
    END AS disqualifier
  FROM classified c
),
ranked AS (
  SELECT w.*,
    CASE WHEN w.disqualifier IS NULL THEN
      ROW_NUMBER() OVER (
        PARTITION BY w.ppv_code, w.generated_for_date
        ORDER BY (w.lead_status='Jauns') DESC,
                 w.lead_created_at DESC NULLS LAST,
                 w.task_created_at DESC)
    END AS keeper_rank,
    CASE WHEN w.disqualifier IS NULL
         THEN NULLIF((w.quota->'per_ppv_user'->>w.ppv_code),'')::int
    END AS ppv_cap
  FROM with_reason w
),
cancel_set AS (
  SELECT task_id,
         COALESCE(disqualifier,
                  CASE WHEN keeper_rank <= ppv_cap THEN NULL ELSE 'exceeded_ppv_daily_cap' END
         ) AS reason
  FROM ranked
  WHERE COALESCE(disqualifier,
                 CASE WHEN keeper_rank <= ppv_cap THEN 'keep' ELSE 'cancel' END
        ) <> 'keep'
)
UPDATE crm.tasks t
   SET status           = 'cancelled',
       cancelled_reason = 'phase2_1_ppv_quota_cleanup',
       updated_at       = now(),
       metadata         = COALESCE(t.metadata,'{}'::jsonb)
                          || jsonb_build_object(
                               'cleanup', jsonb_build_object(
                                 'batch',           'phase2_1_ppv_quota_cleanup',
                                 'reason',          cs.reason,
                                 'previous_status', 'planned',
                                 'cancelled_at',    now()
                               ))
  FROM cancel_set cs
 WHERE t.id = cs.task_id
   AND t.task_type='call' AND t.status='planned' AND t.is_auto_created=true
   AND t.assigned_user_id='477b82e1-b09a-428d-9f65-32aa2ea5a551'
   AND t.metadata->>'source'='daily_planned_task_generator';

-- =============================================================
-- PART B — Replace crm.rpc_generate_daily_planned_tasks
-- =============================================================

CREATE OR REPLACE FUNCTION crm.rpc_generate_daily_planned_tasks()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'crm', 'public', 'extensions'
AS $function$
DECLARE
  v_defs                  jsonb;
  v_rule                  jsonb;
  v_lead                  record;
  v_assignee              uuid;
  v_due_at                timestamptz;
  v_generated_date        date;
  v_today_dow             int;
  v_started_at            timestamptz := clock_timestamp();

  v_stop_rules            jsonb;
  v_weekend_policy        jsonb;
  v_contact_limits        jsonb;
  v_ppv_auto_reschedule   jsonb;
  v_quota                 jsonb;
  v_eligible              jsonb;

  v_weekend_allowed       boolean;
  v_business_days_only    boolean;
  v_no_answer_days        int;

  v_rule_key              text;
  v_status                text;
  v_task_type             text;
  v_title                 text;
  v_role_key              text;
  v_priority              text;
  v_due_time              time;
  v_due_tz                text;
  v_due_type              text;
  v_contact_limit_key     text;
  v_cooldown_key          text;
  v_limit_value           int;
  v_cooldown_days         int;
  v_stop_mode             text;
  v_done_count            int;
  v_last_no_answer_at     timestamptz;
  v_cooldown_business_days int;
  v_d                     date;

  v_priority_bucket       text;
  v_ppv_cap               int;
  v_ppv_key               text;
  v_ppv_count             int;
  v_cap_counts            jsonb := '{}'::jsonb;

  v_scanned               integer := 0;
  v_created               integer := 0;
  v_skipped_existing      integer := 0;
  v_skipped_no_assn       integer := 0;
  v_skipped_stop_rule     integer := 0;
  v_skipped_weekend       integer := 0;
  v_skipped_contact_limit integer := 0;
  v_skipped_cooldown      integer := 0;
  v_skipped_disabled      integer := 0;
  v_skipped_no_valid_phone        integer := 0;
  v_skipped_blank_name            integer := 0;
  v_skipped_no_ppv                integer := 0;
  v_skipped_ppv_not_in_quota      integer := 0;
  v_skipped_daily_cap_ppv         integer := 0;
  v_skipped_invalid_recovery_state integer := 0;
  v_skipped_ineligible_status     integer := 0;
BEGIN
  SELECT value_json INTO v_defs
    FROM crm.settings WHERE setting_key='human_task.definitions' AND is_active;

  IF v_defs IS NULL OR jsonb_typeof(v_defs->'rules') <> 'array' THEN
    RETURN jsonb_build_object(
      'scanned',0,'created',0,'note','human_task.definitions missing or invalid'
    );
  END IF;

  SELECT value_json INTO v_stop_rules
    FROM crm.settings WHERE setting_key='workflow.stop_rules'       AND is_active;
  SELECT value_json INTO v_weekend_policy
    FROM crm.settings WHERE setting_key='automation.weekend_policy' AND is_active;
  SELECT value_json INTO v_contact_limits
    FROM crm.settings WHERE setting_key='contact.limits'            AND is_active;
  SELECT value_json INTO v_ppv_auto_reschedule
    FROM crm.settings WHERE setting_key='ppv.auto_reschedule'       AND is_active;
  SELECT value_json INTO v_quota
    FROM crm.settings WHERE setting_key='outreach.daily_quota'      AND is_active;
  SELECT value_json INTO v_eligible
    FROM crm.settings WHERE setting_key='outreach.eligible_statuses' AND is_active;

  v_weekend_allowed    := COALESCE((v_weekend_policy->>'human_tasks_weekends_allowed')::boolean, false);
  v_business_days_only := COALESCE((v_ppv_auto_reschedule->>'business_days_only')::boolean, true);
  v_no_answer_days     := COALESCE(NULLIF(v_ppv_auto_reschedule->>'no_answer_days','')::int, 2);

  v_generated_date := (now() AT TIME ZONE 'Europe/Riga')::date;
  v_today_dow      := EXTRACT(ISODOW FROM v_generated_date)::int;

  -- Seed per-PPV counters from today's already-planned auto-generated call tasks.
  SELECT COALESCE(jsonb_object_agg(ppv_code, cnt), '{}'::jsonb)
    INTO v_cap_counts
    FROM (
      SELECT p.user_code AS ppv_code, COUNT(*) AS cnt
        FROM crm.tasks t
        JOIN crm.leads l    ON l.id = t.lead_id
        JOIN crm.profiles p ON p.id = l.ppv_user_id
       WHERE t.task_type='call'
         AND t.is_auto_created=true
         AND t.status='planned'
         AND t.metadata->>'source'='daily_planned_task_generator'
         AND (t.metadata->>'generated_for_date')::date = v_generated_date
         AND p.user_code IS NOT NULL
       GROUP BY p.user_code
    ) s;

  FOR v_rule IN
    SELECT r
    FROM jsonb_array_elements(v_defs->'rules') AS r
    ORDER BY COALESCE(NULLIF(r->>'priority_order','')::int, 999999) ASC
  LOOP
    IF COALESCE((v_rule->>'enabled')::boolean, false) = false THEN
      v_skipped_disabled := v_skipped_disabled + 1;
      CONTINUE;
    END IF;

    v_rule_key          := v_rule->>'rule_key';
    v_status            := v_rule->>'status';
    v_task_type         := v_rule->>'task_type';
    v_title             := v_rule->>'title';
    v_role_key          := v_rule->>'role_key';
    v_priority          := COALESCE(v_rule->>'priority','normal');
    v_due_type          := COALESCE(v_rule->'due'->>'type','next_business_day');
    v_due_time          := COALESCE((v_rule->'due'->>'time')::time, time '09:00');
    v_due_tz            := COALESCE(v_rule->'due'->>'timezone','Europe/Riga');
    v_contact_limit_key := v_rule->'limits'->>'contact_limit_key';
    v_cooldown_key      := v_rule->'limits'->>'cooldown_key';

    v_due_at := ((v_generated_date + 1) + v_due_time) AT TIME ZONE v_due_tz;
    IF v_due_type = 'next_business_day' THEN
      WHILE EXTRACT(ISODOW FROM (v_due_at AT TIME ZONE v_due_tz)::date) IN (6,7) LOOP
        v_due_at := v_due_at + interval '1 day';
      END LOOP;
    END IF;

    IF v_today_dow IN (6,7) AND NOT v_weekend_allowed THEN
      v_skipped_weekend := v_skipped_weekend + 1;
      CONTINUE;
    END IF;

    -- Eligible status gate (defence in depth — rule.status must also be in outreach.eligible_statuses)
    IF v_eligible IS NOT NULL AND NOT (v_eligible->'values' ? v_status) THEN
      v_skipped_ineligible_status := v_skipped_ineligible_status + 1;
      CONTINUE;
    END IF;

    v_limit_value   := NULLIF(v_contact_limits->>v_contact_limit_key,'')::int;
    v_cooldown_days := NULLIF(v_ppv_auto_reschedule->>v_cooldown_key,'')::int;

    v_assignee := NULL;
    SELECT p.id INTO v_assignee
      FROM crm.user_roles ur
      JOIN crm.roles r    ON r.id = ur.role_id AND r.role_key = v_role_key
      JOIN crm.profiles p ON p.id = ur.user_id AND p.is_active = true
     ORDER BY p.user_code
     LIMIT 1;

    FOR v_lead IN
      SELECT l.id,
             l.status,
             p.user_code AS ppv_code,
             l.ppv_user_id,
             c.full_name,
             c.phone_e164,
             COALESCE(c.phone_validated,false) AS phone_validated
        FROM crm.leads l
        LEFT JOIN crm.contacts c ON c.id = l.contact_id
        LEFT JOIN crm.profiles p ON p.id = l.ppv_user_id
       WHERE l.status = v_status
       ORDER BY
         (l.status = 'Jauns') DESC,
         l.created_at DESC
    LOOP
      v_scanned := v_scanned + 1;

      -- 1. PPV must exist
      IF v_lead.ppv_user_id IS NULL OR v_lead.ppv_code IS NULL THEN
        v_skipped_no_ppv := v_skipped_no_ppv + 1;
        CONTINUE;
      END IF;

      -- 2. PPV must be in quota settings
      IF v_quota IS NULL OR NOT (v_quota->'per_ppv_user' ? v_lead.ppv_code) THEN
        v_skipped_ppv_not_in_quota := v_skipped_ppv_not_in_quota + 1;
        CONTINUE;
      END IF;

      -- 3. Stop rules
      v_stop_mode := v_stop_rules -> v_lead.status ->> 'mode';
      IF v_stop_mode IN ('pause','stop') THEN
        v_skipped_stop_rule := v_skipped_stop_rule + 1;
        CONTINUE;
      END IF;

      -- 4. Existing open task for same lead+rule
      IF EXISTS (
        SELECT 1 FROM crm.tasks
         WHERE lead_id = v_lead.id
           AND metadata->'definition'->>'rule_key' = v_rule_key
           AND status IN ('planned','in_progress','overdue')
      ) THEN
        v_skipped_existing := v_skipped_existing + 1;
        CONTINUE;
      END IF;

      -- 5. Contact lifetime call limit
      IF v_limit_value IS NOT NULL THEN
        SELECT COUNT(*) INTO v_done_count
          FROM crm.tasks
         WHERE lead_id = v_lead.id
           AND task_type = v_task_type
           AND status = 'completed';
        IF v_done_count >= v_limit_value THEN
          v_skipped_contact_limit := v_skipped_contact_limit + 1;
          CONTINUE;
        END IF;
      END IF;

      -- 6. No-answer cooldown (only meaningful when a prior no-answer exists)
      v_last_no_answer_at := NULL;
      IF v_cooldown_days IS NOT NULL THEN
        SELECT MAX(completed_at) INTO v_last_no_answer_at
          FROM crm.tasks
         WHERE lead_id = v_lead.id
           AND task_type = v_task_type
           AND status = 'completed'
           AND outcome_code = 'no_answer';
        IF v_last_no_answer_at IS NOT NULL THEN
          IF v_business_days_only THEN
            v_cooldown_business_days := 0;
            FOR v_d IN
              SELECT generate_series(
                ((v_last_no_answer_at AT TIME ZONE v_due_tz)::date + 1),
                v_generated_date,
                interval '1 day'
              )::date
            LOOP
              IF EXTRACT(ISODOW FROM v_d) NOT IN (6,7) THEN
                v_cooldown_business_days := v_cooldown_business_days + 1;
              END IF;
            END LOOP;
            IF v_cooldown_business_days < v_cooldown_days THEN
              v_skipped_cooldown := v_skipped_cooldown + 1;
              CONTINUE;
            END IF;
          ELSE
            IF v_last_no_answer_at > now() - (v_cooldown_days || ' days')::interval THEN
              v_skipped_cooldown := v_skipped_cooldown + 1;
              CONTINUE;
            END IF;
          END IF;
        END IF;
      END IF;

      -- 7. Nesasniedzams recovery validity: require prior completed no_answer
      IF v_lead.status = 'Nesasniedzams' AND v_last_no_answer_at IS NULL THEN
        v_skipped_invalid_recovery_state := v_skipped_invalid_recovery_state + 1;
        CONTINUE;
      END IF;

      -- 8. Assignee must exist
      IF v_assignee IS NULL THEN
        v_skipped_no_assn := v_skipped_no_assn + 1;
        CONTINUE;
      END IF;

      -- 9. Valid phone (call only)
      IF v_task_type = 'call' AND (NOT v_lead.phone_validated OR v_lead.phone_e164 IS NULL) THEN
        v_skipped_no_valid_phone := v_skipped_no_valid_phone + 1;
        CONTINUE;
      END IF;

      -- 10. Non-blank contact name
      IF v_lead.full_name IS NULL OR btrim(v_lead.full_name) = '' THEN
        v_skipped_blank_name := v_skipped_blank_name + 1;
        CONTINUE;
      END IF;

      -- 11. Per-PPV daily quota
      v_ppv_cap := NULLIF((v_quota->'per_ppv_user'->>v_lead.ppv_code),'')::int;
      v_ppv_key := v_lead.ppv_code;
      v_ppv_count := COALESCE((v_cap_counts->>v_ppv_key)::int, 0);
      IF v_ppv_cap IS NULL OR v_ppv_count >= v_ppv_cap THEN
        v_skipped_daily_cap_ppv := v_skipped_daily_cap_ppv + 1;
        CONTINUE;
      END IF;

      -- 12. Priority bucket
      v_priority_bucket := CASE v_lead.status
                             WHEN 'Jauns'         THEN 'high'
                             WHEN 'Nesasniedzams' THEN 'medium'
                             ELSE 'low'
                           END;
      v_priority := v_priority_bucket;

      BEGIN
        PERFORM crm.rpc_create_task(
          p_lead_id              => v_lead.id,
          p_task_type            => v_task_type,
          p_due_at               => v_due_at,
          p_title                => v_title,
          p_description          => NULL,
          p_assigned_user_id     => v_assignee,
          p_required_role        => v_role_key,
          p_workflow_instance_id => NULL,
          p_parent_task_id       => NULL,
          p_metadata             => jsonb_build_object(
            'source','daily_planned_task_generator',
            'rule_key', v_rule_key,
            'definition', v_rule,
            'generated_for_date', v_generated_date,
            'ppv_code', v_lead.ppv_code,
            'priority_bucket', v_priority_bucket,
            'daily_quota_source', 'outreach.daily_quota',
            'quota_limit', v_ppv_cap,
            'quota_dimension', 'ppv_user',
            'phone_gate_passed', (v_task_type = 'call')
          ),
          p_is_auto_created      => true,
          p_priority             => v_priority
        );
        v_created := v_created + 1;
        v_cap_counts := jsonb_set(
          v_cap_counts,
          ARRAY[v_ppv_key],
          to_jsonb(v_ppv_count + 1),
          true
        );
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'daily_planned_task_generator: rule=% lead=% failed: %',
          v_rule_key, v_lead.id, SQLERRM;
      END;
    END LOOP;
  END LOOP;

  -- Per-run audit row
  INSERT INTO crm.audit_events (
    entity_type, entity_id, action_type, source_type,
    event_key, event_name, source_system, metadata, created_at
  ) VALUES (
    'system', NULL, 'run', 'automation',
    'daily_planned_task_generator_run',
    'Daily planned task generator run',
    'rpc_generate_daily_planned_tasks',
    jsonb_build_object(
      'generated_for_date', v_generated_date,
      'started_at', v_started_at,
      'finished_at', clock_timestamp(),
      'scanned', v_scanned,
      'created', v_created,
      'skipped_no_ppv', v_skipped_no_ppv,
      'skipped_ppv_not_in_quota', v_skipped_ppv_not_in_quota,
      'skipped_no_valid_phone', v_skipped_no_valid_phone,
      'skipped_blank_name', v_skipped_blank_name,
      'skipped_daily_cap_ppv', v_skipped_daily_cap_ppv,
      'skipped_existing', v_skipped_existing,
      'skipped_invalid_recovery_state', v_skipped_invalid_recovery_state,
      'skipped_cooldown', v_skipped_cooldown,
      'skipped_contact_limit', v_skipped_contact_limit,
      'skipped_stop_rule', v_skipped_stop_rule,
      'skipped_weekend', v_skipped_weekend,
      'skipped_disabled', v_skipped_disabled,
      'skipped_no_assignee', v_skipped_no_assn,
      'skipped_ineligible_status', v_skipped_ineligible_status,
      'cap_per_ppv', v_quota->'per_ppv_user',
      'cap_counts_final', v_cap_counts
    ),
    now()
  );

  RETURN jsonb_build_object(
    'generated_for_date',             v_generated_date,
    'scanned',                        v_scanned,
    'created',                        v_created,
    'skipped_no_ppv',                 v_skipped_no_ppv,
    'skipped_ppv_not_in_quota',       v_skipped_ppv_not_in_quota,
    'skipped_no_valid_phone',         v_skipped_no_valid_phone,
    'skipped_blank_name',             v_skipped_blank_name,
    'skipped_daily_cap_ppv',          v_skipped_daily_cap_ppv,
    'skipped_existing',               v_skipped_existing,
    'skipped_invalid_recovery_state', v_skipped_invalid_recovery_state,
    'skipped_cooldown',               v_skipped_cooldown,
    'skipped_contact_limit',          v_skipped_contact_limit,
    'skipped_stop_rule',              v_skipped_stop_rule,
    'skipped_weekend',                v_skipped_weekend,
    'skipped_disabled',               v_skipped_disabled,
    'skipped_no_assignee',            v_skipped_no_assn,
    'skipped_ineligible_status',      v_skipped_ineligible_status,
    'cap_source',                     'outreach.daily_quota',
    'cap_dimension',                  'ppv_user',
    'cap_per_ppv',                    v_quota->'per_ppv_user',
    'cap_counts_final',               v_cap_counts
  );
END;
$function$;