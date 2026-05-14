-- =====================================================================
-- M3: RBAC helper funkcijas + trūkstošās permissions
-- Reālie kolonnu nosaukumi:
--   crm.roles(role_key, role_name)
--   crm.permissions(permission_key, description)
--   crm.role_permissions(role_id, permission_id)
--   crm.user_roles(user_id, role_id)
-- =====================================================================

-- ---------------------------------------------------------------------
-- M3.0  Drošas UNIQUE constraint pārbaudes
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'crm'
      AND t.relname = 'permissions'
      AND c.contype IN ('u', 'p')
      AND (
        SELECT array_agg(a.attname ORDER BY a.attname)
        FROM unnest(c.conkey) k
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k
      ) = ARRAY['permission_key']
  ) THEN
    ALTER TABLE crm.permissions
      ADD CONSTRAINT permissions_permission_key_key UNIQUE (permission_key);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'crm'
      AND t.relname = 'roles'
      AND c.contype IN ('u', 'p')
      AND (
        SELECT array_agg(a.attname ORDER BY a.attname)
        FROM unnest(c.conkey) k
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k
      ) = ARRAY['role_key']
  ) THEN
    ALTER TABLE crm.roles
      ADD CONSTRAINT roles_role_key_key UNIQUE (role_key);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'crm'
      AND t.relname = 'role_permissions'
      AND c.contype IN ('u', 'p')
      AND (
        SELECT array_agg(a.attname ORDER BY a.attname)
        FROM unnest(c.conkey) k
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k
      ) = ARRAY['permission_id', 'role_id']
  ) THEN
    ALTER TABLE crm.role_permissions
      ADD CONSTRAINT role_permissions_role_perm_key UNIQUE (role_id, permission_id);
  END IF;
END
$$;

-- ---------------------------------------------------------------------
-- M3.1  has_role()
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION crm.has_role(_user_id uuid, _role_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = crm, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM crm.user_roles ur
    JOIN crm.roles r ON r.id = ur.role_id
    WHERE ur.user_id = _user_id
      AND r.role_key = _role_key
  );
$$;

-- ---------------------------------------------------------------------
-- M3.2  has_permission()
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION crm.has_permission(_user_id uuid, _permission_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = crm, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM crm.user_roles ur
    JOIN crm.role_permissions rp ON rp.role_id = ur.role_id
    JOIN crm.permissions p       ON p.id       = rp.permission_id
    WHERE ur.user_id = _user_id
      AND p.permission_key = _permission_key
  );
$$;

-- ---------------------------------------------------------------------
-- M3.3  current_user_permissions()
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION crm.current_user_permissions()
RETURNS TABLE (permission_key text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = crm, public
AS $$
  SELECT DISTINCT p.permission_key
  FROM crm.user_roles ur
  JOIN crm.role_permissions rp ON rp.role_id = ur.role_id
  JOIN crm.permissions p       ON p.id       = rp.permission_id
  WHERE ur.user_id = auth.uid();
$$;

-- ---------------------------------------------------------------------
-- M3.4  current_user_roles()
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION crm.current_user_roles()
RETURNS TABLE (role_key text, role_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = crm, public
AS $$
  SELECT r.role_key, r.role_name
  FROM crm.user_roles ur
  JOIN crm.roles r ON r.id = ur.role_id
  WHERE ur.user_id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION crm.has_role(uuid, text)              TO authenticated;
GRANT EXECUTE ON FUNCTION crm.has_permission(uuid, text)        TO authenticated;
GRANT EXECUTE ON FUNCTION crm.current_user_permissions()        TO authenticated;
GRANT EXECUTE ON FUNCTION crm.current_user_roles()              TO authenticated;

-- ---------------------------------------------------------------------
-- M3.5  Trūkstošās permissions
-- ---------------------------------------------------------------------
INSERT INTO crm.permissions (permission_key, description)
VALUES
  ('view_audit',        'Skatīt audit notikumu žurnālu'),
  ('view_import_review','Skatīt import review skatu'),
  ('view_validation',   'Skatīt validation skatu'),
  ('add_note',          'Pievienot piezīmi lead-am'),
  ('create_task',       'Izveidot uzdevumu'),
  ('edit_contact',      'Rediģēt kontaktpersonu'),
  ('add_contact',       'Pievienot kontaktpersonu lead-am'),
  ('manage_object',     'Pārvaldīt lead-object saites'),
  ('manage_followup',   'Pārvaldīt follow-up uzdevumus')
ON CONFLICT (permission_key) DO NOTHING;

-- ---------------------------------------------------------------------
-- M3.6  Admin role permission backfill
-- ---------------------------------------------------------------------
INSERT INTO crm.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM crm.roles r
CROSS JOIN crm.permissions p
WHERE r.role_key = 'admin'
ON CONFLICT (role_id, permission_id) DO NOTHING;
