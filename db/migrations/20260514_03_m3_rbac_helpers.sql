-- =====================================================================
-- M3: RBAC helper funkcijas + trūkstošās permissions
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
      ) = ARRAY['slug']
  ) THEN
    ALTER TABLE crm.permissions
      ADD CONSTRAINT permissions_slug_key UNIQUE (slug);
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
CREATE OR REPLACE FUNCTION crm.has_role(_user_id uuid, _role_slug text)
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
      AND r.slug = _role_slug
  );
$$;

-- ---------------------------------------------------------------------
-- M3.2  has_permission()
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION crm.has_permission(_user_id uuid, _permission_slug text)
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
      AND p.slug = _permission_slug
  );
$$;

-- ---------------------------------------------------------------------
-- M3.3  current_user_permissions()
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION crm.current_user_permissions()
RETURNS TABLE (permission_slug text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = crm, public
AS $$
  SELECT DISTINCT p.slug
  FROM crm.user_roles ur
  JOIN crm.role_permissions rp ON rp.role_id = ur.role_id
  JOIN crm.permissions p       ON p.id       = rp.permission_id
  WHERE ur.user_id = auth.uid();
$$;

-- ---------------------------------------------------------------------
-- M3.4  current_user_roles()
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION crm.current_user_roles()
RETURNS TABLE (role_slug text, role_label text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = crm, public
AS $$
  SELECT r.slug, r.label
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
INSERT INTO crm.permissions (slug, label, description)
VALUES
  ('view_audit',        'View audit log',        'Skatīt audit notikumu žurnālu'),
  ('view_import_review','View import review',    'Skatīt import review skatu'),
  ('view_validation',   'View validation',       'Skatīt validation skatu'),
  ('add_note',          'Add note',              'Pievienot piezīmi lead-am'),
  ('create_task',       'Create task',           'Izveidot uzdevumu'),
  ('edit_contact',      'Edit contact',          'Rediģēt kontaktpersonu'),
  ('add_contact',       'Add contact',           'Pievienot kontaktpersonu lead-am'),
  ('manage_object',     'Manage object link',    'Pārvaldīt lead-object saites'),
  ('manage_followup',   'Manage follow-up',      'Pārvaldīt follow-up uzdevumus')
ON CONFLICT (slug) DO NOTHING;

-- ---------------------------------------------------------------------
-- M3.6  Admin role permission backfill
-- ---------------------------------------------------------------------
INSERT INTO crm.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM crm.roles r
CROSS JOIN crm.permissions p
WHERE r.slug = 'admin'
ON CONFLICT (role_id, permission_id) DO NOTHING;