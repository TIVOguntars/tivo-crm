-- (1) Definitions
INSERT INTO crm.workflow_definitions (workflow_key, workflow_name, description, is_active, metadata) VALUES
  ('marketing_outreach',   'Mārketinga izsaukšana',      'Planned human outreach tasks for new leads.', true,
   '{"category":"outreach","actor":"human","required_role":"Mārketings","weekend_policy":"skip","gated_by":["outreach.eligible_statuses","outreach.daily_quota"]}'::jsonb),
  ('ppv_followup',         'PPV sekošana',               'PPV call task on status=Piesaistīšana.', true,
   '{"category":"ppv","actor":"human","required_role":"PPV","weekend_policy":"skip","trigger":{"type":"status_changed","to":"Piesaistīšana"}}'::jsonb),
  ('inbound_reply_review', 'Ienākošās atbildes pārskats','Notify PPV + Mārketings on inbound reply.', true,
   '{"category":"inbound","actor":"human","required_roles":["PPV","Mārketings"],"trigger":{"type":"inbound_reply","channels":["email","sms","whatsapp"]},"auto_strategy":false}'::jsonb)
ON CONFLICT (workflow_key) DO NOTHING;

-- (2) Steps
DO $$
DECLARE
  v_mo  uuid; v_ppv uuid; v_inb uuid;
BEGIN
  SELECT id INTO v_mo  FROM crm.workflow_definitions WHERE workflow_key='marketing_outreach';
  SELECT id INTO v_ppv FROM crm.workflow_definitions WHERE workflow_key='ppv_followup';
  SELECT id INTO v_inb FROM crm.workflow_definitions WHERE workflow_key='inbound_reply_review';

  -- marketing_outreach
  INSERT INTO crm.workflow_steps (workflow_id, step_key, step_name, step_order, step_type, responsible_type, delay_minutes, conditions, actions, metadata)
  SELECT v_mo, x.step_key, x.step_name, x.step_order, 'human_task', 'role', x.delay_minutes, '{}'::jsonb, '{"create_task":true}'::jsonb, x.metadata
  FROM (VALUES
    ('call_1',            'Zvans #1',              1, 0,
      '{"required_role":"Mārketings","weekend_policy":"skip","channels":["call"],"gated_by":["outreach.eligible_statuses","outreach.daily_quota"],"schedule":{"anchor":"lead_registered","offset":{"business_days":1}}}'::jsonb),
    ('sms_or_whatsapp_1', 'SMS/WhatsApp #1',       2, 0,
      '{"required_role":"Mārketings","weekend_policy":"skip","channels":["sms","whatsapp"],"schedule":{"anchor":"previous_step_failed","previous_step_key":"call_1","offset":{"minutes":0}}}'::jsonb),
    ('call_2',            'Zvans #2',              3, 0,
      '{"required_role":"Mārketings","weekend_policy":"skip","channels":["call"],"gated_by":["outreach.eligible_statuses","outreach.daily_quota"],"schedule":{"anchor":"lead_registered","offset":{"business_days":3}}}'::jsonb),
    ('call_3',            'Zvans #3',              4, 0,
      '{"required_role":"Mārketings","weekend_policy":"skip","channels":["call"],"schedule":{"anchor":"previous_step_failed","previous_step_key":"call_2","offset":{"minutes":0}}}'::jsonb),
    ('sms_or_whatsapp_2', 'SMS/WhatsApp #2',       5, 0,
      '{"required_role":"Mārketings","weekend_policy":"skip","channels":["sms","whatsapp"],"schedule":{"anchor":"previous_step_failed","previous_step_key":"call_3","offset":{"minutes":0}}}'::jsonb),
    ('call_4',            'Zvans #4',              6, 5,
      '{"required_role":"Mārketings","weekend_policy":"skip","channels":["call"],"schedule":{"anchor":"previous_step_triggered","previous_step_key":"sms_or_whatsapp_2","offset":{"minutes":5}}}'::jsonb),
    ('sms_or_whatsapp_3', 'SMS/WhatsApp #3',       7, 0,
      '{"required_role":"Mārketings","weekend_policy":"skip","channels":["sms","whatsapp"],"schedule":{"anchor":"previous_step_failed","previous_step_key":"call_4","offset":{"days":2}}}'::jsonb),
    ('sms_or_whatsapp_4', 'SMS/WhatsApp #4',       8, 0,
      '{"required_role":"Mārketings","weekend_policy":"skip","channels":["sms","whatsapp"],"schedule":{"anchor":"previous_step_triggered","previous_step_key":"sms_or_whatsapp_3","offset":{"days":5}}}'::jsonb)
  ) AS x(step_key, step_name, step_order, delay_minutes, metadata)
  WHERE NOT EXISTS (
    SELECT 1 FROM crm.workflow_steps s
    WHERE s.workflow_id = v_mo AND s.step_key = x.step_key AND s.workflow_instance_id IS NULL
  );

  -- ppv_followup
  INSERT INTO crm.workflow_steps (workflow_id, step_key, step_name, step_order, step_type, responsible_type, delay_minutes, conditions, actions, metadata)
  SELECT v_ppv, 'ppv_call_1', 'PPV zvans #1', 1, 'human_task', 'role', 0, '{}'::jsonb,
         '{"create_task":true}'::jsonb,
         '{"required_role":"PPV","weekend_policy":"skip","channels":["call"],"assignee_resolver":"lead.ppv_user_id","schedule":{"anchor":"status_changed","anchor_status":"Piesaistīšana","offset":{"business_days":1}}}'::jsonb
  WHERE NOT EXISTS (
    SELECT 1 FROM crm.workflow_steps s
    WHERE s.workflow_id = v_ppv AND s.step_key = 'ppv_call_1' AND s.workflow_instance_id IS NULL
  );

  -- inbound_reply_review
  INSERT INTO crm.workflow_steps (workflow_id, step_key, step_name, step_order, step_type, responsible_type, delay_minutes, conditions, actions, metadata)
  SELECT v_inb, x.step_key, x.step_name, x.step_order, 'notify', 'role', 0, '{}'::jsonb,
         '{"create_notification":true,"decision":"manual"}'::jsonb, x.metadata
  FROM (VALUES
    ('notify_ppv',        'Paziņot PPV',        1,
      '{"required_role":"PPV","assignee_resolver":"lead.ppv_user_id","schedule":{"anchor":"trigger","offset":{"minutes":0}}}'::jsonb),
    ('notify_marketings', 'Paziņot Mārketings', 2,
      '{"required_role":"Mārketings","schedule":{"anchor":"trigger","offset":{"minutes":0}}}'::jsonb)
  ) AS x(step_key, step_name, step_order, metadata)
  WHERE NOT EXISTS (
    SELECT 1 FROM crm.workflow_steps s
    WHERE s.workflow_id = v_inb AND s.step_key = x.step_key AND s.workflow_instance_id IS NULL
  );
END $$;