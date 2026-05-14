-- =====================================================================
-- M1: Junction backfill + Tags + Lead summary
-- Idempotents. Bez RLS policies. Bez CHECK constraints.
-- =====================================================================

-- ---------------------------------------------------------------------
-- M1.1  Backfill crm.lead_people no crm.leads.contact_id caur crm.people
-- FK: crm.lead_people.person_id -> crm.people(id).
-- Vispirms izveido trūkstošos crm.people no crm.contacts,
-- pēc tam lead_people.person_id aizpilda ar crm.people.id.
-- Match: email_normalized, phone_e164, metadata.source_contact_id.
-- ---------------------------------------------------------------------

-- M1.1.a  Izveido trūkstošos crm.people no crm.contacts.
INSERT INTO crm.people (
  full_name,
  email_normalized,
  phone_e164,
  metadata
)
SELECT
  c.full_name,
  c.email_normalized,
  c.phone_e164,
  jsonb_build_object(
    'backfilled_from',   'contacts',
    'source_contact_id', c.id
  )
FROM crm.contacts c
WHERE EXISTS (
        SELECT 1
        FROM crm.leads l
        WHERE l.contact_id = c.id
      )
  AND NOT EXISTS (
        SELECT 1
        FROM crm.people p
        WHERE
          (
            c.email_normalized IS NOT NULL
            AND p.email_normalized IS NOT NULL
            AND p.email_normalized = c.email_normalized
          )
          OR (
            c.phone_e164 IS NOT NULL
            AND p.phone_e164 IS NOT NULL
            AND p.phone_e164 = c.phone_e164
          )
          OR (p.metadata->>'source_contact_id') = c.id::text
      );

-- M1.1.b  Backfill crm.lead_people ar crm.people.id.
INSERT INTO crm.lead_people (
  lead_id,
  person_id,
  role,
  is_primary_contact,
  metadata
)
SELECT
  l.id AS lead_id,
  p.id AS person_id,
  'primary_contact',
  true,
  jsonb_build_object(
    'backfilled_from',   'leads.contact_id',
    'source_contact_id', c.id
  )
FROM crm.leads l
JOIN crm.contacts c ON c.id = l.contact_id
JOIN LATERAL (
  SELECT pp.id
  FROM crm.people pp
  WHERE
    (c.email_normalized IS NOT NULL AND pp.email_normalized = c.email_normalized)
    OR (c.phone_e164    IS NOT NULL AND pp.phone_e164      = c.phone_e164)
    OR (pp.metadata->>'source_contact_id') = c.id::text
  ORDER BY
    (c.email_normalized IS NOT NULL AND pp.email_normalized = c.email_normalized) DESC,
    (c.phone_e164       IS NOT NULL AND pp.phone_e164       = c.phone_e164)       DESC,
    ((pp.metadata->>'source_contact_id') = c.id::text)                            DESC,
    pp.id
  LIMIT 1
) p ON true
WHERE l.contact_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM crm.lead_people lp
    WHERE lp.lead_id   = l.id
      AND lp.person_id = p.id
  );

-- M1.1.c  Normalizācija: tikai viens is_primary_contact = true uz lead-u.
WITH ranked AS (
  SELECT
    id,
    lead_id,
    ROW_NUMBER() OVER (
      PARTITION BY lead_id
      ORDER BY
        (metadata->>'backfilled_from') NULLS LAST,
        id
    ) AS rn
  FROM crm.lead_people
  WHERE is_primary_contact = true
)
UPDATE crm.lead_people lp
SET is_primary_contact = false
FROM ranked r
WHERE lp.id = r.id
  AND r.rn > 1;

-- ---------------------------------------------------------------------
-- M1.2  Backfill crm.lead_objects no crm.lead_project_overview
-- Bez created_at, bez paļaušanās uz v.relationship_type
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'crm'
      AND table_name = 'lead_project_overview'
  ) THEN
    INSERT INTO crm.lead_objects (lead_id, object_id, relationship_type, metadata)
    SELECT DISTINCT
      v.lead_id,
      v.object_id,
      'primary',
      jsonb_build_object('backfilled_from', 'lead_project_overview')
    FROM crm.lead_project_overview v
    WHERE v.lead_id IS NOT NULL
      AND v.object_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM crm.lead_objects lo
        WHERE lo.lead_id = v.lead_id
          AND lo.object_id = v.object_id
      );

    -- Atzīmē primary objektu katram lead-am, ja vēl nav neviena.
    WITH first_links AS (
      SELECT DISTINCT ON (lead_id)
        id, lead_id
      FROM crm.lead_objects
      ORDER BY lead_id, id
    ),
    leads_without_primary AS (
      SELECT lead_id
      FROM crm.lead_objects
      GROUP BY lead_id
      HAVING bool_or(is_primary_object) = false
    )
    UPDATE crm.lead_objects lo
    SET is_primary_object = true
    FROM first_links f
    JOIN leads_without_primary lwp ON lwp.lead_id = f.lead_id
    WHERE lo.id = f.id;
  END IF;
END
$$;

-- ---------------------------------------------------------------------
-- M1.3  crm.tags + crm.lead_tags
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS crm.tags (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text NOT NULL UNIQUE,
  label       text NOT NULL,
  color       text,
  description text,
  created_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tags_label_idx ON crm.tags (label);

CREATE TABLE IF NOT EXISTS crm.lead_tags (
  lead_id     uuid NOT NULL REFERENCES crm.leads (id) ON DELETE CASCADE,
  tag_id      uuid NOT NULL REFERENCES crm.tags  (id) ON DELETE CASCADE,
  created_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (lead_id, tag_id)
);

CREATE INDEX IF NOT EXISTS lead_tags_tag_idx  ON crm.lead_tags (tag_id);
CREATE INDEX IF NOT EXISTS lead_tags_lead_idx ON crm.lead_tags (lead_id);

ALTER TABLE crm.tags      ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.lead_tags ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- M1.4  crm.leads.summary
-- ---------------------------------------------------------------------
ALTER TABLE crm.leads
  ADD COLUMN IF NOT EXISTS summary text;