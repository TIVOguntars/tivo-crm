ALTER TABLE crm.contacts DROP CONSTRAINT IF EXISTS contacts_phone_e164_unique;

CREATE INDEX IF NOT EXISTS contacts_phone_e164_idx
  ON crm.contacts (phone_e164)
  WHERE phone_e164 IS NOT NULL;

CREATE TABLE IF NOT EXISTS crm._backup_contacts_phone_20260520 AS
SELECT id, phone_e164, phone_validated, phone_line_type
FROM crm.contacts;
