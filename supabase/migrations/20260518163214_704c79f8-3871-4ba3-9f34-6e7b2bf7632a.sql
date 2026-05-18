-- ============================================================
-- (1) Settings: workflow.stop_rules → mode-based; lead.status_transition_rules
-- ============================================================
UPDATE crm.settings
   SET value_json = '{
         "Nekvalificējas": {"mode":"stop","manual_resume":true},
         "Atlikts":        {"mode":"pause","manual_resume":true},
         "Nesasniedzams":  {"mode":"none","manual_resume":true}
       }'::jsonb,
       updated_at = now()
 WHERE setting_key = 'workflow.stop_rules';

INSERT INTO crm.settings (setting_key, setting_group, value_json, description, is_active)
VALUES (
  'lead.status_transition_rules',
  'status',
  '{
     "require_override_for": [
       {"from":"Uzvarēts","to_any_except":["Līgums"]},
       {"from":"Līgums","to_any_except":["Uzvarēts"]},
       {"from":"Atcelts","to_any_except":["Atlikts"]}
     ]
   }'::jsonb,
  'Lead status transitions that require explicit override.',
  true
)
ON CONFLICT (setting_key) DO NOTHING;

-- ============================================================
-- (2) RPC: rpc_change_lead_status
-- ============================================================
CREATE OR REPLACE FUNCTION crm.rpc_change_lead_status(
  p_lead_id                       uuid,
  p_new_status                    text,
  p_reason                        text    DEFAULT NULL,
  p_changed_by_user_id            uuid    DEFAULT NULL,
  p_create_activity               boolean DEFAULT true,
  p_metadata                      jsonb   DEFAULT '{}'::jsonb,
  p_allow_restricted_transition   boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = crm, public, extensions
AS $$
DECLARE
  v_actor          uuid := COALESCE(p_changed_by_user_id, auth.uid());
  v_old_status     text;
  v_stop_rule      jsonb;
  v_mode           text;
  v_target_wf_stat text;
  v_affected_wf    integer := 0;
  v_rules          jsonb;
  v_rule           jsonb;
  v_restricted     boolean := false;
  v_meta           jsonb := COALESCE(p_metadata,'{}'::jsonb);
BEGIN
  IF p_lead_id IS NULL THEN
    RAISE EXCEPTION 'p_lead_id is required' USING ERRCODE = '22023';
  END IF;
  IF p_new_status IS NULL OR length(trim(p_new_status)) = 0 THEN
    RAISE EXCEPTION 'p_new_status is required' USING ERRCODE = '22023';
  END IF;

  SELECT status INTO v_old_status FROM crm.leads WHERE id = p_lead_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'lead % not found', p_lead_id USING ERRCODE = 'P0002';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM crm.lead_statuses
    WHERE status_key = p_new_status AND COALESCE(is_active, true) = true
  ) THEN
    RAISE EXCEPTION 'invalid lead status: %', p_new_status USING ERRCODE = '22023';
  END IF;

  -- No-op
  IF v_old_status IS NOT DISTINCT FROM p_new_status THEN
    RETURN jsonb_build_object(
      'lead_id', p_lead_id, 'old_status', v_old_status, 'new_status', p_new_status,
      'changed', false, 'workflow_mode_applied', 'none', 'workflow_instances_affected', 0
    );
  END IF;

  -- Restricted transition validation
  SELECT value_json INTO v_rules
  FROM crm.settings
  WHERE setting_key = 'lead.status_transition_rules' AND is_active = true;

  IF v_rules IS NOT NULL THEN
    FOR v_rule IN SELECT jsonb_array_elements(COALESCE(v_rules->'require_override_for','[]'::jsonb))
    LOOP
      IF (v_rule->>'from') = v_old_status THEN
        IF NOT ( (v_rule->'to_any_except') @> to_jsonb(p_new_status) ) THEN
          v_restricted := true;
          EXIT;
        END IF;
      END IF;
    END LOOP;
  END IF;

  IF v_restricted AND NOT p_allow_restricted_transition THEN
    RAISE EXCEPTION 'Restricted status transition requires explicit override' USING ERRCODE = 'P0001';
  END IF;

  IF v_restricted AND p_allow_restricted_transition THEN
    v_meta := v_meta || jsonb_build_object('restricted_transition_override', true);
  END IF;

  -- Apply
  UPDATE crm.leads
     SET status = p_new_status,
         updated_at = now()
   WHERE id = p_lead_id;

  INSERT INTO crm.lead_status_history (lead_id, old_status, new_status, change_source, changed_by, reason)
  VALUES (p_lead_id, v_old_status, p_new_status, 'rpc', v_actor, p_reason);

  PERFORM crm.create_audit_event(
    'lead', p_lead_id, 'status_change', 'rpc',
    'lead.status_changed',
    'Lead status changed',
    format('%s -> %s', COALESCE(v_old_status,'(null)'), p_new_status),
    jsonb_build_object('status', v_old_status),
    jsonb_build_object('status', p_new_status),
    jsonb_build_array('status'),
    v_actor, NULL, NULL, p_reason, 'rpc_change_lead_status',
    NULL, NULL, NULL, NULL, v_meta
  );

  IF p_create_activity THEN
    PERFORM crm.rpc_log_activity(
      p_lead_id, 'status_change', now(),
      format('Status changed: %s -> %s', COALESCE(v_old_status,'(null)'), p_new_status),
      NULL, NULL, v_actor, NULL, 'system',
      jsonb_build_object('old_status', v_old_status, 'new_status', p_new_status, 'reason', p_reason)
    );
  END IF;

  -- Workflow stop/pause rules
  SELECT value_json->p_new_status INTO v_stop_rule
  FROM crm.settings WHERE setting_key = 'workflow.stop_rules' AND is_active = true;

  v_mode := COALESCE(v_stop_rule->>'mode','none');
  v_target_wf_stat := CASE v_mode
    WHEN 'stop'  THEN 'stopped'
    WHEN 'pause' THEN 'paused'
    ELSE NULL
  END;

  IF v_target_wf_stat IS NOT NULL THEN
    UPDATE crm.workflow_instances
       SET status = v_target_wf_stat,
           updated_at = now(),
           metadata = COALESCE(metadata,'{}'::jsonb) || jsonb_build_object(
             'changed_by_rpc', 'rpc_change_lead_status',
             'changed_at',     now(),
             'trigger_status', p_new_status,
             'mode',           v_mode,
             'manual_resume',  COALESCE((v_stop_rule->>'manual_resume')::boolean, true),
             'reason',         p_reason
           )
     WHERE entity_type = 'lead'
       AND entity_id   = p_lead_id
       AND status NOT IN ('completed','failed','stopped','cancelled');
    GET DIAGNOSTICS v_affected_wf = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'lead_id', p_lead_id,
    'old_status', v_old_status,
    'new_status', p_new_status,
    'changed', true,
    'restricted_override_used', v_restricted AND p_allow_restricted_transition,
    'workflow_mode_applied', v_mode,
    'workflow_instances_affected', v_affected_wf
  );
END;
$$;

REVOKE ALL ON FUNCTION crm.rpc_change_lead_status(uuid, text, text, uuid, boolean, jsonb, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION crm.rpc_change_lead_status(uuid, text, text, uuid, boolean, jsonb, boolean) TO authenticated, service_role;


-- ============================================================
-- (3) RPC: rpc_change_lead_ppv
-- ============================================================
CREATE OR REPLACE FUNCTION crm.rpc_change_lead_ppv(
  p_lead_id               uuid,
  p_new_ppv_user_id       uuid,
  p_reason                text    DEFAULT NULL,
  p_changed_by_user_id    uuid    DEFAULT NULL,
  p_reassign_open_tasks   boolean DEFAULT true,
  p_metadata              jsonb   DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = crm, public, extensions
AS $$
DECLARE
  v_actor         uuid := COALESCE(p_changed_by_user_id, auth.uid());
  v_old_ppv       uuid;
  v_tasks_updated integer := 0;
BEGIN
  IF p_lead_id IS NULL THEN
    RAISE EXCEPTION 'p_lead_id is required' USING ERRCODE = '22023';
  END IF;
  IF p_new_ppv_user_id IS NULL THEN
    RAISE EXCEPTION 'p_new_ppv_user_id is required' USING ERRCODE = '22023';
  END IF;

  SELECT ppv_user_id INTO v_old_ppv FROM crm.leads WHERE id = p_lead_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'lead % not found', p_lead_id USING ERRCODE = 'P0002';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM crm.profiles WHERE id = p_new_ppv_user_id AND COALESCE(is_active, true) = true) THEN
    RAISE EXCEPTION 'user % not found or inactive', p_new_ppv_user_id USING ERRCODE = 'P0002';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM crm.user_roles ur
    JOIN crm.roles r ON r.id = ur.role_id
    WHERE ur.user_id = p_new_ppv_user_id AND r.role_key = 'ppv'
  ) THEN
    RAISE EXCEPTION 'user % does not have PPV role', p_new_ppv_user_id USING ERRCODE = '22023';
  END IF;

  IF v_old_ppv IS NOT DISTINCT FROM p_new_ppv_user_id THEN
    RETURN jsonb_build_object(
      'lead_id', p_lead_id, 'old_ppv_user_id', v_old_ppv, 'new_ppv_user_id', p_new_ppv_user_id,
      'changed', false, 'tasks_reassigned', 0
    );
  END IF;

  UPDATE crm.leads
     SET ppv_user_id = p_new_ppv_user_id,
         updated_at  = now()
   WHERE id = p_lead_id;

  PERFORM crm.create_audit_event(
    'lead', p_lead_id, 'ppv_change', 'rpc',
    'lead.ppv_changed', 'Lead PPV changed', NULL,
    jsonb_build_object('ppv_user_id', v_old_ppv),
    jsonb_build_object('ppv_user_id', p_new_ppv_user_id),
    jsonb_build_array('ppv_user_id'),
    v_actor, NULL, NULL, p_reason, 'rpc_change_lead_ppv',
    NULL, NULL, NULL, NULL, COALESCE(p_metadata,'{}'::jsonb)
  );

  -- Activity: type='other', basis='system'
  PERFORM crm.rpc_log_activity(
    p_lead_id, 'other', now(),
    'PPV changed',
    NULL, NULL, v_actor, NULL, 'system',
    jsonb_build_object('old_ppv_user_id', v_old_ppv, 'new_ppv_user_id', p_new_ppv_user_id, 'reason', p_reason)
  );

  IF p_reassign_open_tasks THEN
    WITH upd AS (
      UPDATE crm.tasks
         SET previous_assigned_user_id = assigned_user_id,
             assigned_user_id          = p_new_ppv_user_id,
             updated_at                = now(),
             metadata                  = COALESCE(metadata,'{}'::jsonb) || jsonb_build_object(
               'last_reassignment', jsonb_build_object(
                 'source', 'rpc_change_lead_ppv',
                 'at',     now(),
                 'from',   assigned_user_id,
                 'to',     p_new_ppv_user_id,
                 'reason', p_reason
               )
             )
       WHERE lead_id       = p_lead_id
         AND required_role = 'PPV'
         AND status IN ('planned','overdue','in_progress')
      RETURNING id
    )
    SELECT COUNT(*) INTO v_tasks_updated FROM upd;
  END IF;

  RETURN jsonb_build_object(
    'lead_id', p_lead_id,
    'old_ppv_user_id', v_old_ppv,
    'new_ppv_user_id', p_new_ppv_user_id,
    'changed', true,
    'tasks_reassigned', v_tasks_updated
  );
END;
$$;

REVOKE ALL ON FUNCTION crm.rpc_change_lead_ppv(uuid, uuid, text, uuid, boolean, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION crm.rpc_change_lead_ppv(uuid, uuid, text, uuid, boolean, jsonb) TO authenticated, service_role;