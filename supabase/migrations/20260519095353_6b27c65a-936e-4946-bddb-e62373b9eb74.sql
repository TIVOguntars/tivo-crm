UPDATE crm.settings
SET value_json = jsonb_set(
  value_json,
  '{values}',
  (
    SELECT to_jsonb(array_agg(DISTINCT v))
    FROM (
      SELECT jsonb_array_elements_text(value_json->'values') AS v
      UNION ALL SELECT 'draw_sketches'
      UNION ALL SELECT 'estimate'
      UNION ALL SELECT 'prepare_offer'
    ) s
  )
),
updated_at = now()
WHERE setting_key = 'activity.types' AND is_active = true;