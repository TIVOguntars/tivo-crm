INSERT INTO crm.user_roles (user_id, role_id)
SELECT p.id, r.id
FROM crm.profiles p, crm.roles r
WHERE p.user_code = 'BJ'
  AND r.role_key = 'marketing'
  AND NOT EXISTS (
    SELECT 1 FROM crm.user_roles ur
    WHERE ur.user_id = p.id AND ur.role_id = r.id
  );