
CREATE OR REPLACE FUNCTION crm.rpc_generate_daily_planned_tasks()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'crm', 'public', 'extensions'
AS $function$
DECLARE
  v_lead              record;
  v_type              text;
  v_title             text;
  v_assignee          uuid;
  v_due_at            timestamptz;
  v_generated_date    date;
  v_scanned           integer := 0;
  v_created           integer := 0;
  v_skipped_existing  integer := 0;
  v_skipped_no_assn   integer := 0;
  v_active_statuses   text[] := ARRAY[
    'Jauns','Piesaistīšana','Piedāvājums','Atlikts','Atkārtojas'
  ];
  v_types             text[] := ARRAY['call','manual_sms','manual_email'];
BEGIN
  -- Next day 09:00 Europe/Riga, as UTC timestamptz
  v_generated_date := (now() AT TIME ZONE 'Europe/Riga')::date;
  v_due_at := ((v_generated_date + 1) + time '09:00')
              AT TIME ZONE 'Europe/Riga';

  FOR v_lead IN
    SELECT id, owner_user_id, ppv_user_id
    FROM crm.leads
    WHERE status = ANY(v_active_statuses)
  LOOP
    v_scanned := v_scanned + 1;

    v_assignee := COALESCE(v_lead.owner_user_id, v_lead.ppv_user_id);

    FOREACH v_type IN ARRAY v_types LOOP
      -- Dedupe: skip if an open task of the same type already exists
      IF EXISTS (
        SELECT 1 FROM crm.tasks
        WHERE lead_id   = v_lead.id
          AND task_type = v_type
          AND status IN ('planned','in_progress','overdue')
      ) THEN
        v_skipped_existing := v_skipped_existing + 1;
        CONTINUE;
      END IF;

      IF v_assignee IS NULL THEN
        v_skipped_no_assn := v_skipped_no_assn + 1;
        CONTINUE;
      END IF;

      v_title := CASE v_type
        WHEN 'call'         THEN 'Zvanīt'
        WHEN 'manual_sms'   THEN 'Nosūtīt SMS'
        WHEN 'manual_email' THEN 'Nosūtīt e-pastu'
      END;

      BEGIN
        PERFORM crm.rpc_create_task(
          p_lead_id          => v_lead.id,
          p_task_type        => v_type,
          p_due_at           => v_due_at,
          p_title            => v_title,
          p_description      => NULL,
          p_assigned_user_id => v_assignee,
          p_required_role    => NULL,
          p_workflow_instance_id => NULL,
          p_parent_task_id   => NULL,
          p_metadata         => jsonb_build_object(
            'source', 'daily_planned_task_generator',
            'generated_for_date', v_generated_date
          ),
          p_is_auto_created  => true,
          p_priority         => 'normal'
        );
        v_created := v_created + 1;
      EXCEPTION WHEN OTHERS THEN
        -- Do not abort the whole batch on a single failure.
        RAISE WARNING 'daily_planned_task_generator: lead=% type=% failed: %',
          v_lead.id, v_type, SQLERRM;
      END;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'scanned',              v_scanned,
    'created',              v_created,
    'skipped_existing',     v_skipped_existing,
    'skipped_no_assignee',  v_skipped_no_assn
  );
END;
$function$;

REVOKE ALL ON FUNCTION crm.rpc_generate_daily_planned_tasks() FROM PUBLIC;
REVOKE ALL ON FUNCTION crm.rpc_generate_daily_planned_tasks() FROM authenticated;
GRANT EXECUTE ON FUNCTION crm.rpc_generate_daily_planned_tasks() TO service_role;

-- Schedule daily run at 22:00 UTC (~00:00 Europe/Riga, ±1h around DST).
-- Idempotent: unschedule any prior job with the same name first.
DO $$
BEGIN
  PERFORM cron.unschedule('generate-daily-planned-tasks')
  WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'generate-daily-planned-tasks'
  );
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'generate-daily-planned-tasks',
  '0 22 * * *',
  $cmd$ SELECT crm.rpc_generate_daily_planned_tasks(); $cmd$
);
