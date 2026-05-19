
CREATE OR REPLACE FUNCTION crm.admin_create_profile(
  p_full_name text,
  p_email     text,
  p_user_code text
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
  v_row       crm.profiles;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Nepieciešama autentifikācija' USING ERRCODE = '42501';
  END IF;
  IF NOT crm.has_role(auth.uid(), 'admin') THEN
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

  INSERT INTO crm.profiles (
    id, full_name, email, user_code,
    is_active, language, timezone, status_key,
    created_at, updated_at
  )
  VALUES (
    gen_random_uuid(), v_full_name, v_email, v_user_code,
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

REVOKE ALL ON FUNCTION crm.admin_create_profile(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION crm.admin_create_profile(text, text, text) TO authenticated;


CREATE OR REPLACE FUNCTION crm.admin_update_profile(
  p_id         uuid,
  p_full_name  text,
  p_email      text,
  p_user_code  text,
  p_is_active  boolean
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
  v_active    boolean;
  v_row       crm.profiles;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Nepieciešama autentifikācija' USING ERRCODE = '42501';
  END IF;
  IF NOT crm.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Nav tiesību pārvaldīt lietotājus' USING ERRCODE = '42501';
  END IF;

  IF p_id IS NULL THEN
    RAISE EXCEPTION 'Trūkst lietotāja ID' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM crm.profiles WHERE id = p_id) THEN
    RAISE EXCEPTION 'Lietotājs nav atrasts' USING ERRCODE = '22023';
  END IF;

  v_full_name := btrim(coalesce(p_full_name, ''));
  v_email     := lower(btrim(coalesce(p_email, '')));
  v_user_code := upper(btrim(coalesce(p_user_code, '')));
  v_active    := coalesce(p_is_active, true);

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

  IF EXISTS (
    SELECT 1 FROM crm.profiles WHERE lower(email) = v_email AND id <> p_id
  ) THEN
    RAISE EXCEPTION 'Šāds e-pasts jau eksistē' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM crm.profiles WHERE upper(user_code) = v_user_code AND id <> p_id
  ) THEN
    RAISE EXCEPTION 'Šāds ID jau eksistē' USING ERRCODE = '22023';
  END IF;

  UPDATE crm.profiles
     SET full_name  = v_full_name,
         email      = v_email,
         user_code  = v_user_code,
         is_active  = v_active,
         status_key = CASE WHEN v_active THEN 'active' ELSE 'inactive' END,
         updated_at = now()
   WHERE id = p_id
   RETURNING * INTO v_row;

  RETURN v_row;

EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Šāds ID vai e-pasts jau eksistē' USING ERRCODE = '22023';
END;
$$;

REVOKE ALL ON FUNCTION crm.admin_update_profile(uuid, text, text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION crm.admin_update_profile(uuid, text, text, text, boolean) TO authenticated;
