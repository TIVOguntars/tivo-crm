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

  v_offsets_cfg           jsonb;
  v_tag_offsets           jsonb;
  v_tag_precedence        jsonb;
  v_default_offset        numeric;

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
  SELECT value_json INTO v_offsets_cfg
    FROM crm.settings WHERE setting_key='task_selection.priority_offsets' AND is_active;

  v_tag_offsets    := COALESCE(v_offsets_cfg->'tag_offsets',             '{}'::jsonb);
  v_tag_precedence := COALESCE(v_offsets_cfg->'priority_tag_precedence', '[]'::jsonb);
  v_default_offset := COALESCE((v_offsets_cfg->>'default_offset')::numeric, 0);

  v_weekend_allowed    := COALESCE((v_weekend_policy->>'human_tasks_weekends_allowed')::boolean, false);
  v_business_days_only := COALESCE((v_ppv_auto_reschedule->>'business_days_only')::boolean, true);
  v_no_answer_days     := COALESCE(NULLIF(v_ppv_auto_reschedule->>'no_answer_days','')::int, 2);

  v_generated_date := (now() AT TIME ZONE 'Europe/Riga')::date;
  v_today_dow      := EXTRACT(ISODOW FROM v_generated_date)::int;

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
      WITH lead_tags AS (
        SELECT l.id AS lead_id,
               COALESCE(
                 ARRAY(
                   SELECT lower(btrim(t))
                     FROM regexp_split_to_table(COALESCE(s.tags,''), '[,\s]+') AS t
                    WHERE btrim(t) <> ''
                 ),
                 ARRAY[]::text[]
               ) AS tag_list
          FROM crm.leads l
          LEFT JOIN crm.lead_priority_scoring_v2 s ON s.lead_id = l.id
         WHERE l.status = v_status
      ),
      resolved AS (
        SELECT lt.lead_id,
               (
                 SELECT prec.tag
                   FROM jsonb_array_elements_text(v_tag_precedence) AS prec(tag)
                  WHERE prec.tag = ANY(lt.tag_list)
                    AND v_tag_offsets ? prec.tag
                  LIMIT 1
               ) AS resolved_tag
          FROM lead_tags lt
      )
      SELECT l.id,
             l.status,
             p.user_code AS ppv_code,
             l.ppv_user_id,
             c.full_name,
             c.phone_e164,
             COALESCE(c.phone_validated,false) AS phone_validated,
             s.priority_score                  AS lead_priority_score,
             s.tags                            AS lead_tags,
             r.resolved_tag                    AS resolved_offset_tag,
             COALESCE(
               (v_tag_offsets ->> r.resolved_tag)::numeric,
               v_default_offset
             ) AS tag_priority_offset,
             COALESCE(s.priority_score, 0) + COALESCE(
               (v_tag_offsets ->> r.resolved_tag)::numeric,
               v_default_offset
             ) AS task_selection_score,
             CASE WHEN r.resolved_tag IS NULL
                  THEN NULL
                  ELSE r.resolved_tag || '_offset'
             END AS task_priority_adjustment_reason
        FROM crm.leads l
        LEFT JOIN crm.contacts c ON c.id = l.contact_id
        LEFT JOIN crm.profiles p ON p.id = l.ppv_user_id
        LEFT JOIN crm.lead_priority_scoring_v2 s ON s.lead_id = l.id
        LEFT JOIN resolved r ON r.lead_id = l.id
       WHERE l.status = v_status
       ORDER BY
         (COALESCE(s.priority_score,0) + COALESCE(
            (v_tag_offsets ->> r.resolved_tag)::numeric,
            v_default_offset
          )) DESC,
         (l.status = 'Jauns') DESC,
         l.created_at DESC
    LOOP
      v_scanned := v_scanned + 1;

      IF v_lead.ppv_user_id IS NULL OR v_lead.ppv_code IS NULL THEN
        v_skipped_no_ppv := v_skipped_no_ppv + 1;
        CONTINUE;
      END IF;

      IF v_quota IS NULL OR NOT (v_quota->'per_ppv_user' ? v_lead.ppv_code) THEN
        v_skipped_ppv_not_in_quota := v_skipped_ppv_not_in_quota + 1;
        CONTINUE;
      END IF;

      v_stop_mode := v_stop_rules -> v_lead.status ->> 'mode';
      IF v_stop_mode IN ('pause','stop') THEN
        v_skipped_stop_rule := v_skipped_stop_rule + 1;
        CONTINUE;
      END IF;

      IF EXISTS (
        SELECT 1 FROM crm.tasks
         WHERE lead_id = v_lead.id
           AND metadata->'definition'->>'rule_key' = v_rule_key
           AND status IN ('planned','in_progress','overdue')
      ) THEN
        v_skipped_existing := v_skipped_existing + 1;
        CONTINUE;
      END IF;

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

      IF v_lead.status = 'Nesasniedzams' AND v_last_no_answer_at IS NULL THEN
        v_skipped_invalid_recovery_state := v_skipped_invalid_recovery_state + 1;
        CONTINUE;
      END IF;

      IF v_assignee IS NULL THEN
        v_skipped_no_assn := v_skipped_no_assn + 1;
        CONTINUE;
      END IF;

      IF v_task_type = 'call' AND (NOT v_lead.phone_validated OR v_lead.phone_e164 IS NULL) THEN
        v_skipped_no_valid_phone := v_skipped_no_valid_phone + 1;
        CONTINUE;
      END IF;

      IF v_lead.full_name IS NULL OR btrim(v_lead.full_name) = '' THEN
        v_skipped_blank_name := v_skipped_blank_name + 1;
        CONTINUE;
      END IF;

      v_ppv_cap := NULLIF((v_quota->'per_ppv_user'->>v_lead.ppv_code),'')::int;
      v_ppv_key := v_lead.ppv_code;
      v_ppv_count := COALESCE((v_cap_counts->>v_ppv_key)::int, 0);
      IF v_ppv_cap IS NULL OR v_ppv_count >= v_ppv_cap THEN
        v_skipped_daily_cap_ppv := v_skipped_daily_cap_ppv + 1;
        CONTINUE;
      END IF;

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
            'phone_gate_passed', (v_task_type = 'call'),
            'lead_priority_score',             v_lead.lead_priority_score,
            'task_selection_score',            v_lead.task_selection_score,
            'tag_priority_offset',             v_lead.tag_priority_offset,
            'task_priority_adjustment_reason', v_lead.task_priority_adjustment_reason,
            'offset_source_setting',           'task_selection.priority_offsets'
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

  INSERT INTO crm.audit_events (
    entity_type, entity_id, action_type, source_type,
    event_key, event_name, source_system, metadata, created_at
  ) VALUES (
    'task', NULL, 'automation', 'automation',
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
      'cap_counts_final', v_cap_counts,
      'offsets_source', 'task_selection.priority_offsets',
      'offsets_config', v_offsets_cfg
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
    'cap_counts_final',               v_cap_counts,
    'offsets_source',                 'task_selection.priority_offsets',
    'offsets_config',                 v_offsets_cfg
  );
END;
$function$;