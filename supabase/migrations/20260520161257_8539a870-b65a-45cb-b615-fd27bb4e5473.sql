WITH src AS (
  SELECT id, regexp_replace(coalesce(phone_raw,''), '[\s().\-]', '', 'g') AS stripped
  FROM crm.contacts
),
norm AS (
  SELECT id,
    CASE
      WHEN stripped = '' THEN NULL
      WHEN stripped LIKE '+%'  THEN '+' || regexp_replace(substring(stripped FROM 2), '[^0-9]', '', 'g')
      WHEN stripped LIKE '00%' THEN '+' || regexp_replace(substring(stripped FROM 3), '[^0-9]', '', 'g')
      WHEN stripped ~ '^[0-9]{8}$' THEN '+371' || stripped
      ELSE regexp_replace(stripped, '[^0-9+]', '', 'g')
    END AS e164
  FROM src
),
validated AS (
  SELECT id, e164,
    (e164 IS NOT NULL
     AND e164 ~ '^\+[0-9]+$'
     AND length(regexp_replace(e164, '\D', '', 'g')) BETWEEN 8 AND 15) AS is_valid
  FROM norm
)
UPDATE crm.contacts c
   SET phone_e164      = v.e164,
       phone_validated = v.is_valid,
       phone_line_type = NULL
  FROM validated v
 WHERE v.id = c.id
   AND (c.phone_e164 IS DISTINCT FROM v.e164
        OR c.phone_validated IS DISTINCT FROM v.is_valid);