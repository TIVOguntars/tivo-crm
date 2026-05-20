CREATE OR REPLACE FUNCTION crm.rpc_generate_daily_planned_tasks()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'crm', 'public', 'extensions'
AS $function$
DECLARE
  c_call_cap_per_assignee_per_day CONSTANT int := 60;
  v_cap_counts                   jsonb := '{}'::jsonb;
  v_assignee_key                 text;
  v_assignee_count               int;
  v_skipped_no_valid_phone       integer := 0;
  v_skipped_daily_cap            integer := 0;
  v_priority_bucket              text;
  v_lead_has_valid_phone         boolean;

  v_defs                  jsonb;
  v_rule                  jsonb;
  v_lead                  record;
  v_assignee              uuid;
  v_due_at                timestamptz;
  v_generated_date        date;
  v_today_dow             int;
  v_scanned               integer := 0;
  v_created               integer := 0;
  v_skipped_existing      integer := 0;
  v_skipped_no_assn       integer := 0;
  v_skipped_stop_rule     integer := 0;
  v_skipped_weekend       integer := 0;
  v_skipped_contact_limit integer := 0;
  v_skipped_cooldown      integer := 0;
  v_skipped_disabled      integer := 0;
  v_stop_rules            jsonb;
  v_weekend_policy        jsonb;
  v_contact_limits        jsonb;
  v_ppv_auto_reschedule   jsonb;
  v_weekend_allowed       boolean;
  v_business_days_only    boolean;
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
BEGIN
  SELECT value_json INTO v_defs
    FROM crm.settings
   WHERE setting_key = 'human_task.definitions' AND is_active;

  IF v_defs IS NULL OR jsonb_typeof(v_defs->'rules') <> 'array' THEN
    RETURN jsonb_build_object(
      'scanned',0,'created',0,'skipped_existing',0,'skipped_no_assignee',0,
      'skipped_stop_rule',0,'skipped_weekend',0,'skipped_contact_limit',0,
      'skipped_cooldown',0,'skipped_disabled',0,
      'skipped_no_valid_phone',0,'skipped_daily_cap',0,
      'cap_per_assignee_per_day', c_call_cap_per_assignee_per_day,
      'note','human_task.definitions missing or invalid'
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

  v_weekend_allowed    := COALESCE((v_weekend_policy->>'human_tasks_weekends_allowed')::boolean, false);
  v_business_days_only := COALESCE((v_ppv_auto_reschedule->>'business_days_only')::boolean, true);

  v_generated_date := (now() AT TIME ZONE 'Europe/Riga')::date;
  v_today_dow      := EXTRACT(ISODOW FROM v_generated_date)::int;

  SELECT COALESCE(jsonb_object_agg(assigned_user_id::text, cnt), '{}'::jsonb)
    INTO v_cap_counts
    FROM (
      SELECT assigned_user_id, COUNT(*) AS cnt
        FROM crm.tasks
       WHERE task_type       = 'call'
         AND is_auto_created = true
         AND status          = 'planned'
         AND assigned_user_id IS NOT NULL
         AND (metadata->>'generated_for_date')::date = v_generated_date
       GROUP BY assigned_user_id
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
      SELECT v_skipped_weekend + COUNT(*) INTO v_skipped_weekend
        FROM crm.leads WHERE status = v_status;
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

    IF v_assignee IS NULL THEN
      RAISE WARNING 'No active assignee found for role %', v_role_key;
    END IF;

    FOR v_lead IN
      SELECT l.id,
             l.status,
             COALESCE(c.phone_e164 IS NOT NULL AND c.phone_validated = true, false) AS has_valid_phone
        FROM crm.leads l
        LEFT JOIN crm.contacts c ON c.id = l.contact_id
       WHERE l.status = v_status
       ORDER BY
         (COALESCE(c.phone_e164 IS NOT NULL AND c.phone_validated = true, false)) DESC,
         (l.status = 'Jauns') DESC,
         l.created_at DESC
    LOOP
      v_scanned := v_scanned + 1;
      v_lead_has_valid_phone := v_lead.has_valid_phone;

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

      IF v_assignee IS NULL THEN
        v_skipped_no_assn := v_skipped_no_assn + 1;
        CONTINUE;
      END IF;

      IF v_task_type = 'call' AND NOT v_lead_has_valid_phone THEN
        v_skipped_no_valid_phone := v_skipped_no_valid_phone + 1;
        CONTINUE;
      END IF;

      IF v_task_type = 'call' THEN
        v_assignee_key   := v_assignee::text;
        v_assignee_count := COALESCE((v_cap_counts->>v_assignee_key)::int, 0);
        IF v_assignee_count >= c_call_cap_per_assignee_per_day THEN
          v_skipped_daily_cap := v_skipped_daily_cap + 1;
          CONTINUE;
        END IF;
      END IF;

      IF v_task_type = 'call' THEN
        v_priority_bucket := CASE v_lead.status
                               WHEN 'Jauns'         THEN 'high'
                               WHEN 'Nesasniedzams' THEN 'medium'
                               ELSE 'low'
                             END;
        v_priority := v_priority_bucket;
      ELSE
        v_priority_bucket := NULL;
      END IF;

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
            'definition', v_rule,
            'generated_for_date', v_generated_date,
            'priority_bucket', v_priority_bucket,
            'phone_gate_passed', (v_task_type = 'call')
          ),
          p_is_auto_created      => true,
          p_priority             => v_priority
        );
        v_created := v_created + 1;

        IF v_task_type = 'call' THEN
          v_cap_counts := jsonb_set(
            v_cap_counts,
            ARRAY[v_assignee::text],
            to_jsonb(COALESCE((v_cap_counts->>v_assignee::text)::int, 0) + 1),
            true
          );
        END IF;
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'daily_planned_task_generator: rule=% lead=% failed: %',
          v_rule_key, v_lead.id, SQLERRM;
      END;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'scanned',                  v_scanned,
    'created',                  v_created,
    'skipped_existing',         v_skipped_existing,
    'skipped_no_assignee',      v_skipped_no_assn,
    'skipped_stop_rule',        v_skipped_stop_rule,
    'skipped_weekend',          v_skipped_weekend,
    'skipped_contact_limit',    v_skipped_contact_limit,
    'skipped_cooldown',         v_skipped_cooldown,
    'skipped_disabled',         v_skipped_disabled,
    'skipped_no_valid_phone',   v_skipped_no_valid_phone,
    'skipped_daily_cap',        v_skipped_daily_cap,
    'cap_per_assignee_per_day', c_call_cap_per_assignee_per_day,
    'cap_counts_final',         v_cap_counts
  );
END;
$function$;