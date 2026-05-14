-- =====================================================================
-- M1: Junctions backfill + tags + leads.summary
-- FK:
--   crm.lead_people.lead_id   -> crm.leads(id)
--   crm.lead_people.person_id -> crm.people(id)
-- Match crm.people from crm.contacts:
--   priority: email_normalized -> phone_e164 -> metadata.source_contact_id
-- =====================================================================

-- ---------------------------------------------------------------------
-- M1.1  Backfill crm.lead_people no crm.leads.contact_id
-- ---------------------------------------------------------------------

-- 1) Vispirms izveido trūkstošos crm.people no crm.contacts,
--    lai katram lead.contact_id būtu atbilstošs person ieraksts.
INSERT INTO crm.people (
  email_normalized,
  phone_e164,
  full_name,
  first_name,
  last_name,
  metadata,
  created_at,
  updated_at
)
SELECT DISTINCT ON (c.id)
  c.email_normalized,
  c.phone_e164,
  c.full_name,
  c.first_name,
  c.last_name,
  jsonb_build_object('source_contact_id', c.id::text)
    || COALESCE(c.metadata, '{}'::jsonb),
  now(),
  now()
FROM crm.contacts c
JOIN crm.leads l ON l.contact_id = c.id
WHERE NOT EXISTS (
  SELECT 1
  FROM crm.people p
  WHERE
    (c.email_normalized IS NOT NULL AND p.email_normalized = c.email_normalized)
    OR (c.phone_e164 IS NOT NULL AND p.phone_e164 = c.phone_e164)
    OR (p.metadata ->> 'source_contact_id') = c.id::text
);

-- 2) Backfill lead_people: lead_id no crm.leads, person_id no crm.people.
INSERT INTO crm.lead_people (lead_id, person_id, relationship_type, created_at, updated_at)
SELECT
  l.id  AS lead_id,
  p.id  AS person_id,
  'primary' AS relationship_type,
  now(),
  now()
FROM crm.leads l
JOIN crm.contacts c ON c.id = l.contact_id
CROSS JOIN LATERAL (
  SELECT pp.id
  FROM crm.people pp
  WHERE
    (c.email_normalized IS NOT NULL AND pp.email_normalized = c.email_normalized)
    OR (c.phone_e164 IS NOT NULL AND pp.phone_e164 = c.phone_e164)
    OR (pp.metadata ->> 'source_contact_id') = c.id::text
  ORDER BY
    (c.email_normalized IS NOT NULL AND pp.email_normalized = c.email_normalized) DESC,
    (c.phone_e164 IS NOT NULL AND pp.phone_e164 = c.phone_e164) DESC,
    ((pp.metadata ->> 'source_contact_id') = c.id::text) DESC,
    pp.created_at ASC
  LIMIT 1
) p
WHERE l.contact_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM crm.lead_people lp
    WHERE lp.lead_id = l.id AND lp.person_id = p.id
  );

-- ---------------------------------------------------------------------
-- M1.2  Backfill crm.lead_objects no crm.leads.object_id
-- ---------------------------------------------------------------------
INSERT INTO crm.lead_objects (lead_id, object_id, relationship_type, created_at, updated_at)
SELECT
  l.id        AS lead_id,
  l.object_id AS object_id,
  'primary'   AS relationship_type,
  now(),
  now()
FROM crm.leads l
WHERE l.object_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM crm.lead_objects lo
    WHERE lo.lead_id = l.id AND lo.object_id = l.object_id
  );

-- ---------------------------------------------------------------------
-- M1.3  Tags + lead_tags
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS crm.tags (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tag_key     text NOT NULL UNIQUE,
  tag_name    text NOT NULL,
  color       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS crm.lead_tags (
  lead_id     uuid NOT NULL REFERENCES crm.leads(id) ON DELETE CASCADE,
  tag_id      uuid NOT NULL REFERENCES crm.tags(id)  ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (lead_id, tag_id)
);

CREATE INDEX IF NOT EXISTS lead_tags_tag_id_idx  ON crm.lead_tags (tag_id);
CREATE INDEX IF NOT EXISTS lead_tags_lead_id_idx ON crm.lead_tags (lead_id);

-- ---------------------------------------------------------------------
-- M1.4  leads.summary
-- ---------------------------------------------------------------------
ALTER TABLE crm.leads
  ADD COLUMN IF NOT EXISTS summary text;
