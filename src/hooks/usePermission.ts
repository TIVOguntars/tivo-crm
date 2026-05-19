import { useCurrentUser } from "@/hooks/useCurrentUser";

/** True if current operator has the given role_key (admin always). */
export function useHasRole(roleKey: string): boolean {
  const { roleKeys, isAdmin } = useCurrentUser();
  if (!roleKey) return true;
  if (isAdmin) return true;
  return roleKeys.includes(roleKey);
}

/**
 * True if current operator has the given permission_key.
 *
 * MVP: per-user permission feed is not yet wired, so the gate falls open
 * for admin and closed for everyone else.
 */
export function useHasPermission(permissionKey: string): boolean {
  const { permissionKeys, isAdmin } = useCurrentUser();
  if (!permissionKey) return true;
  if (isAdmin) return true;
  return permissionKeys.includes(permissionKey);
}