import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  getStoredOperator,
  listAssignableUsers,
  listRoleKeysForUser,
  OPERATOR_STORAGE_KEY,
  type AssignableUser,
  type StoredOperator,
} from "@/lib/users";

export interface CurrentUserCtx {
  isReady: boolean;
  operatorId: string | null;
  profile: AssignableUser | null;
  roleKeys: string[];
  permissionKeys: string[];
  isAdmin: boolean;
  stored: StoredOperator | null;
}

/** Track localStorage operator selection across components/tabs. */
function useStoredOperator(): StoredOperator | null {
  const [op, setOp] = useState<StoredOperator | null>(() => getStoredOperator());
  useEffect(() => {
    const sync = () => setOp(getStoredOperator());
    sync();
    if (typeof window === "undefined") return;
    const onStorage = (e: StorageEvent) => {
      if (e.key === OPERATOR_STORAGE_KEY) sync();
    };
    const onCustom = () => sync();
    window.addEventListener("storage", onStorage);
    window.addEventListener("tivo:operator-changed", onCustom);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("tivo:operator-changed", onCustom);
    };
  }, []);
  return op;
}

export function notifyOperatorChanged(): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new Event("tivo:operator-changed"));
  } catch {
    /* ignore */
  }
}

export function useCurrentUser(): CurrentUserCtx {
  const stored = useStoredOperator();
  const operatorId = stored?.operator_id ?? null;

  const usersQ = useQuery({
    queryKey: ["crm", "assignable_users"],
    queryFn: listAssignableUsers,
    staleTime: 5 * 60_000,
    enabled: !!operatorId,
  });

  const rolesQ = useQuery({
    queryKey: ["crm", "user_role_keys", operatorId ?? "none"],
    queryFn: () => listRoleKeysForUser(operatorId!),
    enabled: !!operatorId,
    staleTime: 5 * 60_000,
  });

  const profile =
    (usersQ.data ?? []).find((u) => u.id === operatorId) ?? null;

  // Prefer freshly-fetched role keys; fall back to the snapshot we stored at
  // selection time so role checks still work before the role query resolves.
  const roleKeys =
    rolesQ.data ??
    (stored?.role_keys && stored.role_keys.length > 0
      ? stored.role_keys
      : []);

  const isAdmin = roleKeys.includes("admin");

  const isReady =
    !operatorId ||
    ((!usersQ.isLoading || !!profile) && !rolesQ.isLoading);

  return {
    isReady,
    operatorId,
    profile,
    roleKeys,
    // No frontend permission feed today — gates fall back to role checks
    // (admin = pass) until a server fn surfaces effective permissions.
    permissionKeys: [],
    isAdmin,
    stored,
  };
}