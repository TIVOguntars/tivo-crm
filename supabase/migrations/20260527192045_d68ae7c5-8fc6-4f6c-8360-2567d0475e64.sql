
-- ============ admin_upsert_profile ============
CREATE OR REPLACE FUNCTION crm.admin_upsert_profile(
  p_id uuid,
  p_full_name text,
  p_email text,
  p_user_code text,
  p_phone text,
  p_is_active boolean
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = crm, public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_full_name text;
  v_email text;
  v_user_code text;
  v_phone text;
  v_user_id uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Nepieciešama autentifikācija' USING ERRCODE = '42501';
  END IF;
  IF NOT crm.has_role(v_actor, 'admin') THEN
    RAISE EXCEPTION 'Nav tiesību pārvaldīt lietotājus' USING ERRCODE = '42501';
  END IF;

  v_full_name := btrim(coalesce(p_full_name, ''));
  v_email     := lower(btrim(coalesce(p_email, '')));
  v_user_code := upper(btrim(coalesce(p_user_code, '')));
  v_phone     := nullif(btrim(coalesce(p_phone, '')), '');

  IF v_full_name = '' THEN RAISE EXCEPTION 'Vārds ir obligāts' USING ERRCODE = '22023'; END IF;
  IF v_email = '' THEN RAISE EXCEPTION 'E-pasts ir obligāts' USING ERRCODE = '22023'; END IF;
  IF v_user_code = '' THEN RAISE EXCEPTION 'ID ir obligāts' USING ERRCODE = '22023'; END IF;
  IF char_length(v_user_code) > 5 THEN RAISE EXCEPTION 'ID maksimums 5 simboli' USING ERRCODE = '22023'; END IF;

  IF p_id IS NULL THEN
    -- create branch: delegate to existing MVP create which also seeds auth.users
    IF EXISTS (SELECT 1 FROM crm.profiles WHERE lower(email) = v_email) THEN
      RAISE EXCEPTION 'Šāds e-pasts jau eksistē' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM crm.profiles WHERE upper(user_code) = v_user_code) THEN
      RAISE EXCEPTION 'Šāds ID jau eksistē' USING ERRCODE = '22023';
    END IF;

    v_user_id := gen_random_uuid();

    INSERT INTO auth.users (
      id, instance_id, aud, role, email, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) VALUES (
      v_user_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated', 'authenticated', v_email, now(),
      jsonb_build_object('provider','email','providers', jsonb_build_array('email')),
      jsonb_build_object('full_name', v_full_name, 'user_code', v_user_code),
      now(), now()
    );

    INSERT INTO crm.profiles (
      id, full_name, email, user_code, phone,
      is_active, language, timezone, status_key, created_at, updated_at
    ) VALUES (
      v_user_id, v_full_name, v_email, v_user_code, v_phone,
      coalesce(p_is_active, true), 'lv', 'Europe/Riga', 'active', now(), now()
    )
    ON CONFLICT (id) DO UPDATE SET
      full_name = EXCLUDED.full_name,
      email     = EXCLUDED.email,
      user_code = EXCLUDED.user_code,
      phone     = EXCLUDED.phone,
      is_active = EXCLUDED.is_active,
      updated_at = now();

    RETURN v_user_id;
  ELSE
    -- update branch
    IF NOT EXISTS (SELECT 1 FROM crm.profiles WHERE id = p_id) THEN
      RAISE EXCEPTION 'Lietotājs nav atrasts' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM crm.profiles WHERE lower(email) = v_email AND id <> p_id) THEN
      RAISE EXCEPTION 'Šāds e-pasts jau eksistē' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM crm.profiles WHERE upper(user_code) = v_user_code AND id <> p_id) THEN
      RAISE EXCEPTION 'Šāds ID jau eksistē' USING ERRCODE = '22023';
    END IF;

    UPDATE crm.profiles SET
      full_name = v_full_name,
      email     = v_email,
      user_code = v_user_code,
      phone     = v_phone,
      is_active = coalesce(p_is_active, is_active),
      updated_at = now()
    WHERE id = p_id;

    RETURN p_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION crm.admin_upsert_profile(uuid, text, text, text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION crm.admin_upsert_profile(uuid, text, text, text, text, boolean) TO authenticated;

-- ============ admin_set_user_roles ============
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
    SELECT array_agg(role_key) INTO v_missing
    FROM unnest(v_keys) AS k
    WHERE NOT EXISTS (SELECT 1 FROM crm.roles r WHERE r.role_key = k)
    HAVING count(*) > 0;
    SELECT array_agg(id) INTO v_role_ids FROM crm.roles WHERE role_key = ANY(v_keys);
    IF v_missing IS NOT NULL THEN
      RAISE EXCEPTION 'Nezināmas lomas: %', array_to_string(v_missing, ', ') USING ERRCODE = '22023';
    END IF;
  END IF;

  DELETE FROM crm.user_roles WHERE user_id = p_user_id;
  IF v_role_ids IS NOT NULL THEN
    INSERT INTO crm.user_roles (user_id, role_id)
    SELECT p_user_id, rid FROM unnest(v_role_ids) AS rid;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION crm.admin_set_user_roles(uuid, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION crm.admin_set_user_roles(uuid, text[]) TO authenticated;

-- ============ admin_set_role_permissions ============
CREATE OR REPLACE FUNCTION crm.admin_set_role_permissions(
  p_role_key text,
  p_permission_keys text[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = crm, public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_role_id uuid;
  v_keys text[];
  v_perm_ids uuid[];
  v_missing text[];
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Nepieciešama autentifikācija' USING ERRCODE = '42501';
  END IF;
  IF NOT crm.has_role(v_actor, 'admin') THEN
    RAISE EXCEPTION 'Nav tiesību pārvaldīt tiesības' USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_role_id FROM crm.roles WHERE role_key = btrim(coalesce(p_role_key, ''));
  IF v_role_id IS NULL THEN
    RAISE EXCEPTION 'Nezināma loma: %', p_role_key USING ERRCODE = '22023';
  END IF;

  v_keys := COALESCE(
    (SELECT array_agg(DISTINCT btrim(k))
     FROM unnest(coalesce(p_permission_keys, ARRAY[]::text[])) k
     WHERE btrim(k) <> ''),
    ARRAY[]::text[]
  );

  IF array_length(v_keys, 1) IS NOT NULL THEN
    SELECT array_agg(k) INTO v_missing
    FROM unnest(v_keys) AS k
    WHERE NOT EXISTS (SELECT 1 FROM crm.permissions p WHERE p.permission_key = k)
    HAVING count(*) > 0;
    SELECT array_agg(id) INTO v_perm_ids FROM crm.permissions WHERE permission_key = ANY(v_keys);
    IF v_missing IS NOT NULL THEN
      RAISE EXCEPTION 'Nezināmas tiesības: %', array_to_string(v_missing, ', ') USING ERRCODE = '22023';
    END IF;
  END IF;

  DELETE FROM crm.role_permissions WHERE role_id = v_role_id;
  IF v_perm_ids IS NOT NULL THEN
    INSERT INTO crm.role_permissions (role_id, permission_id)
    SELECT v_role_id, pid FROM unnest(v_perm_ids) AS pid;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION crm.admin_set_role_permissions(text, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION crm.admin_set_role_permissions(text, text[]) TO authenticated;
