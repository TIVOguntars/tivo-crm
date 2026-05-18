
-- Data correction (idempotent)
DO $$
DECLARE
  v_lead uuid;
  v_inst uuid;
  v_total_cancelled int := 0;
  v_total_recalced int := 0;
  v_n int;
BEGIN
  FOR v_lead IN
    SELECT DISTINCT lead_id FROM crm.communication_queue WHERE status IN ('queued','blocked')
  LOOP
    v_n := crm.cleanup_already_sent_queue(v_lead);
    v_total_cancelled := v_total_cancelled + COALESCE(v_n,0);
  END LOOP;

  FOR v_inst IN
    SELECT id FROM crm.workflow_instances WHERE status = 'running'
  LOOP
    v_n := crm.recalculate_queue_for_instance(v_inst);
    v_total_recalced := v_total_recalced + COALESCE(v_n,0);
  END LOOP;

  RAISE NOTICE 'data_correction cancelled=% recalced=%', v_total_cancelled, v_total_recalced;
END$$;
