
-- Phase 1: crm.task_types lookup (advisory only; no FK on crm.tasks)
CREATE TABLE IF NOT EXISTS crm.task_types (
  type_key text PRIMARY KEY,
  label_lv text NOT NULL,
  label_en text,
  channel text NOT NULL,
  mode text NOT NULL,
  completion_rule text NOT NULL,
  requires_communication_proof boolean NOT NULL DEFAULT false,
  requires_body boolean NOT NULL DEFAULT false,
  requires_subject boolean NOT NULL DEFAULT false,
  requires_meeting_url boolean NOT NULL DEFAULT false,
  default_priority text NOT NULL DEFAULT 'normal',
  metadata_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
  icon_key text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE crm.task_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS task_types_read_anon ON crm.task_types;
CREATE POLICY task_types_read_anon ON crm.task_types
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS task_types_service_all ON crm.task_types;
CREATE POLICY task_types_service_all ON crm.task_types
  FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT SELECT ON crm.task_types TO anon, authenticated;
GRANT ALL ON crm.task_types TO service_role;

-- Seed the 9 canonical task types (idempotent)
INSERT INTO crm.task_types
  (type_key, label_lv, label_en, channel, mode, completion_rule,
   requires_communication_proof, requires_body, requires_subject, requires_meeting_url,
   icon_key, sort_order, metadata_schema)
VALUES
  ('automatic_email', 'Automātisks e-pasts', 'Automatic email',
   'email', 'automatic', 'send_success',
   true, true, true, false, 'mail', 10,
   '{"fields":["recipient","subject","body","template_key","signature_key","from_address","reply_to","cc","bcc"]}'::jsonb),

  ('automatic_reply_email', 'Automātiska atbilde uz e-pastu', 'Automatic reply email',
   'email', 'automatic', 'inbound_reply',
   true, true, true, false, 'reply', 20,
   '{"fields":["in_reply_to_communication_id","subject","body","template_key","signature_key"],"reply_match":{"primary":"original_recipient_email","fallback":"lead_contact_emails"}}'::jsonb),

  ('manual_email', 'Manuāls e-pasts', 'Manual email',
   'email', 'manual', 'manual_with_proof',
   true, true, true, false, 'mail', 30,
   '{"fields":["recipient","subject","body"],"proof":{"required":true,"accept":["crm_send","imap_reconcile","manual_link"]}}'::jsonb),

  ('call', 'Zvans', 'Call',
   'call', 'human', 'human_complete',
   false, false, false, false, 'phone', 40,
   '{"fields":["phone_e164","agenda","notes_prompt","expected_outcome_codes"]}'::jsonb),

  ('zoom', 'Zoom saruna', 'Zoom meeting',
   'zoom', 'human', 'human_complete',
   false, false, false, true, 'video', 50,
   '{"fields":["meeting_url","meeting_id","dial_in","duration_minutes","agenda","notes_prompt"]}'::jsonb),

  ('automatic_sms', 'Automātisks SMS', 'Automatic SMS',
   'sms', 'automatic', 'delivered',
   true, true, false, false, 'message-square', 60,
   '{"fields":["recipient","body","template_key"]}'::jsonb),

  ('automatic_whatsapp', 'Automātisks WhatsApp', 'Automatic WhatsApp',
   'whatsapp', 'automatic', 'read',
   true, true, false, false, 'message-circle', 70,
   '{"fields":["recipient","body","template_key"]}'::jsonb),

  ('manual_sms', 'Manuāls SMS', 'Manual SMS',
   'sms', 'manual', 'manual_with_proof',
   true, true, false, false, 'message-square', 80,
   '{"fields":["recipient","body"],"proof":{"required":true,"accept":["crm_send","manual_link","manual_marked"]}}'::jsonb),

  ('manual_whatsapp', 'Manuāls WhatsApp', 'Manual WhatsApp',
   'whatsapp', 'manual', 'manual_with_proof',
   true, true, false, false, 'message-circle', 90,
   '{"fields":["recipient","body"],"proof":{"required":true,"accept":["crm_send","manual_link","manual_marked"]}}'::jsonb)
ON CONFLICT (type_key) DO UPDATE SET
  label_lv = EXCLUDED.label_lv,
  label_en = EXCLUDED.label_en,
  channel = EXCLUDED.channel,
  mode = EXCLUDED.mode,
  completion_rule = EXCLUDED.completion_rule,
  requires_communication_proof = EXCLUDED.requires_communication_proof,
  requires_body = EXCLUDED.requires_body,
  requires_subject = EXCLUDED.requires_subject,
  requires_meeting_url = EXCLUDED.requires_meeting_url,
  icon_key = EXCLUDED.icon_key,
  sort_order = EXCLUDED.sort_order,
  metadata_schema = EXCLUDED.metadata_schema,
  updated_at = now();
