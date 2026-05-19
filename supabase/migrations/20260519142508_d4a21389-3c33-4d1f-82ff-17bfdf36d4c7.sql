
-- TEMPORARY Track A bridge. Replace with auth.uid() after Real Auth migration.
CREATE OR REPLACE FUNCTION crm.admin_create_profile_mvp(
  p_actor_user_id uuid,
  p_full_name     text,
  p_email         text,
  p_user_code     text
)
RETURNS crm.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = crm, public
AS $$
DECLARE
  v_full_name text;
  v_email     text;
  v_user_code text;
  v_user_id   uuid;
  v_row       crm.profiles;
BEGIN
  -- TEMPORARY Track A bridge. Replace with auth.uid() after Real Auth migration.
  IF p_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'Nepieciešama autentifikācija' USING ERRCODE = '42501';
  END IF;
  IF NOT crm.has_role(p_actor_user_id, 'admin') THEN
    RAISE EXCEPTION 'Nav tiesību pārvaldīt lietotājus' USING ERRCODE = '42501';
  END IF;

  v_full_name := btrim(coalesce(p_full_name, ''));
  v_email     := lower(btrim(coalesce(p_email, '')));
  v_user_code := upper(btrim(coalesce(p_user_code, '')));

  IF v_full_name = '' THEN
    RAISE EXCEPTION 'Vārds ir obligāts' USING ERRCODE = '22023';
  END IF;
  IF v_email = '' THEN
    RAISE EXCEPTION 'E-pasts ir obligāts' USING ERRCODE = '22023';
  END IF;
  IF v_user_code = '' THEN
    RAISE EXCEPTION 'ID ir obligāts' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_user_code) > 5 THEN
    RAISE EXCEPTION 'ID maksimums 5 simboli' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (SELECT 1 FROM crm.profiles WHERE lower(email) = v_email) THEN
    RAISE EXCEPTION 'Šāds e-pasts jau eksistē' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM crm.profiles WHERE upper(user_code) = v_user_code) THEN
    RAISE EXCEPTION 'Šāds ID jau eksistē' USING ERRCODE = '22023';
  END IF;

  v_user_id := gen_random_uuid();

  -- TEMPORARY Track A bridge: create minimal auth.users row to satisfy profiles_id_fkey.
  -- Replace with real Supabase Auth signup after Real Auth migration.
  INSERT INTO auth.users (
    id,
    instance_id,
    aud,
    role,
    email,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at
  )
  VALUES (
    v_user_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    v_email,
    now(),
    jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
    jsonb_build_object('full_name', v_full_name, 'user_code', v_user_code),
    now(),
    now()
  );

  INSERT INTO crm.profiles (
    id, full_name, email, user_code,
    is_active, language, timezone, status_key,
    created_at, updated_at
  )
  VALUES (
    v_user_id, v_full_name, v_email, v_user_code,
    true, 'lv', 'Europe/Riga', 'active',
    now(), now()
  )
  RETURNING * INTO v_row;

  RETURN v_row;

EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Šāds ID vai e-pasts jau eksistē' USING ERRCODE = '22023';
END;
$$;

REVOKE ALL ON FUNCTION crm.admin_create_profile_mvp(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION crm.admin_create_profile_mvp(uuid, text, text, text) TO authenticated;
