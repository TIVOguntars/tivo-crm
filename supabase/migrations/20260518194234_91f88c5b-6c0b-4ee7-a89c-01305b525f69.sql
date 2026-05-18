ALTER TABLE crm.activities
DROP CONSTRAINT IF EXISTS activities_lead_id_fkey;

ALTER TABLE crm.activities
ADD CONSTRAINT activities_lead_id_fkey
  FOREIGN KEY (lead_id)
  REFERENCES crm.leads(id)
  ON DELETE CASCADE;