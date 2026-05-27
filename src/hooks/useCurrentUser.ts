import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  getStoredOperator,
  listAssignableUsers,
  OPERATOR_STORAGE_KEY,
  type AssignableUser,
  type StoredOperator,
} from "@/lib/users";
import { getCurrentRoles } from "@/lib/roles.functions";

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

  const getRoles = useServerFn(getCurrentRoles);
  const rolesQ = useQuery({
    queryKey: ["crm", "current_roles", operatorId ?? "none"],
    queryFn: () => getRoles({ data: { operatorId } }),
    enabled: !!operatorId,
    staleTime: 5 * 60_000,
  });

  const profile =
    (usersQ.data ?? []).find((u) => u.id === operatorId) ?? null;

  // Role keys are ALWAYS resolved server-side; no localStorage fallback.
  // While the server fn is in-flight, roleKeys is [] → all gates fail closed.
  const roleKeys = rolesQ.data?.roleKeys ?? [];
  const permissionKeys = rolesQ.data?.permissionKeys ?? [];
  const isAdmin = !!rolesQ.data && roleKeys.includes("admin");

  const isReady =
    !operatorId ||
    ((!usersQ.isLoading || !!profile) && !rolesQ.isLoading && !rolesQ.isFetching);

  return {
    isReady,
    operatorId,
    profile,
    roleKeys,
    permissionKeys,
    isAdmin,
    stored,
  };
}