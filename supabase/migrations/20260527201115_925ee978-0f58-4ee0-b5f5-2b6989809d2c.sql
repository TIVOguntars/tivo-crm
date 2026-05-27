CREATE OR REPLACE FUNCTION crm.admin_set_user_roles(
  p_user_id uuid,
  p_role_keys text[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = crm, public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_keys text[];
  v_role_ids uuid[];
  v_missing text[];
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Nepieciešama autentifikācija' USING ERRCODE = '42501';
  END IF;
  IF NOT crm.has_role(v_actor, 'admin') THEN
    RAISE EXCEPTION 'Nav tiesību pārvaldīt lomas' USING ERRCODE = '42501';
  END IF;
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Trūkst lietotāja ID' USING ERRCODE = '22023';
  END IF;

  v_keys := COALESCE(
    (SELECT array_agg(DISTINCT btrim(k))
     FROM unnest(coalesce(p_role_keys, ARRAY[]::text[])) k
     WHERE btrim(k) <> ''),
    ARRAY[]::text[]
  );

  IF array_length(v_keys, 1) IS NOT NULL THEN
    SELECT array_agg(k) INTO v_missing
    FROM unnest(v_keys) AS k
    WHERE NOT EXISTS (SELECT 1 FROM crm.roles r WHERE r.role_key = k)
    HAVING count(*) > 0;
    IF v_missing IS NOT NULL THEN
      RAISE EXCEPTION 'Nezināmas lomas: %', array_to_string(v_missing, ', ') USING ERRCODE = '22023';
    END IF;
    SELECT array_agg(id) INTO v_role_ids FROM crm.roles WHERE role_key = ANY(v_keys);
  END IF;

  DELETE FROM crm.user_roles WHERE user_id = p_user_id;
  IF v_role_ids IS NOT NULL THEN
    INSERT INTO crm.user_roles (user_id, role_id)
    SELECT p_user_id, rid FROM unnest(v_role_ids) AS rid;
  END IF;
END;
$$;