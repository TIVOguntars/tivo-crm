CREATE OR REPLACE FUNCTION crm.resolve_login_email(p_user_code text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = crm, public
AS $$
  SELECT email
  FROM crm.profiles
  WHERE upper(btrim(user_code)) = upper(btrim(p_user_code))
    AND is_active = true
    AND email IS NOT NULL
    AND btrim(email) <> ''
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION crm.resolve_login_email(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION crm.resolve_login_email(text) TO anon, authenticated;