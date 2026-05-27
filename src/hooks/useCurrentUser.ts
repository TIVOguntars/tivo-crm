import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
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
  authReady: boolean;
  rolesLoading: boolean;
  rolesError: string | null;
  operatorId: string | null;
  currentAuthUserId: string | null;
  profile: AssignableUser | null;
  roleKeys: string[];
  permissionKeys: string[];
  isAdmin: boolean;
  stored: StoredOperator | null;
  currentRoles: { roleKeys: string[]; permissionKeys: string[] } | null;
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

function useAuthIdentity(): { userId: string | null; version: number; ready: boolean } {
  const [state, setState] = useState({ userId: null as string | null, version: 0, ready: false });

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data: sessionData, error: sessionError }) => {
      if (typeof window !== "undefined" && import.meta.env.DEV) {
        console.log("[auth-debug] auth provider session", {
          hasSession: !!sessionData.session,
          sessionUserId: sessionData.session?.user?.id ?? null,
          sessionUserEmail: sessionData.session?.user?.email ?? null,
          expiresAt: sessionData.session?.expires_at ?? null,
          accessTokenPresent: !!sessionData.session?.access_token,
          refreshTokenPresent: !!sessionData.session?.refresh_token,
          error: sessionError?.message ?? null,
        });
      }
    });
    supabase.auth.getUser().then(({ data, error }) => {
      if (typeof window !== "undefined" && import.meta.env.DEV) {
        console.log("[auth-debug] auth provider user", {
          authUser: data.user
            ? { id: data.user.id, email: data.user.email ?? null, isAnonymous: data.user.is_anonymous ?? null }
            : null,
          currentUserId: data.user?.id ?? null,
          error: error?.message ?? null,
        });
      }
      if (!cancelled) {
        setState((prev) => ({
          userId: data.user?.id ?? null,
          version: prev.version + 1,
          ready: true,
        }));
      }
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (typeof window !== "undefined" && import.meta.env.DEV) {
        console.log("[auth-debug] auth provider state change", {
          event,
          authSession: {
            hasSession: !!session,
            userId: session?.user?.id ?? null,
            email: session?.user?.email ?? null,
            expiresAt: session?.expires_at ?? null,
            accessTokenPresent: !!session?.access_token,
            refreshTokenPresent: !!session?.refresh_token,
          },
          currentUserId: session?.user?.id ?? null,
        });
      }
      setState((prev) => ({
        userId: session?.user?.id ?? null,
        version: prev.version + 1,
        ready: true,
      }));
    });
    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  return state;
}

export function useCurrentUser(): CurrentUserCtx {
  const stored = useStoredOperator();
  const operatorId = stored?.operator_id ?? null;
  const auth = useAuthIdentity();

  const usersQ = useQuery({
    queryKey: ["crm", "assignable_users"],
    queryFn: listAssignableUsers,
    staleTime: 5 * 60_000,
    enabled: !!operatorId,
  });

  const getRoles = useServerFn(getCurrentRoles);
  const rolesQ = useQuery({
    queryKey: ["crm", "current_roles", auth.userId ?? "no-auth", operatorId ?? "none", auth.version],
    queryFn: async () => {
      if (typeof window !== "undefined" && import.meta.env.DEV) {
        console.log("[auth-debug] getCurrentRoles browser call", {
          authUserId: auth.userId,
          operatorId,
          authReady: auth.ready,
          authVersion: auth.version,
        });
      }
      const response = await getRoles({ data: { operatorId } });
      if (typeof window !== "undefined" && import.meta.env.DEV) {
        console.log("[auth-debug] getCurrentRoles raw response", response);
      }
      return response;
    },
    enabled: auth.ready && !!operatorId,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  const profile =
    (usersQ.data ?? []).find((u) => u.id === operatorId) ?? null;

  // Role keys are ALWAYS resolved server-side; no localStorage fallback.
  // While the server fn is in-flight, roleKeys is [] → all gates fail closed.
  const currentRoles = rolesQ.data ?? null;
  const roleKeys = currentRoles?.roleKeys ?? [];
  const permissionKeys = currentRoles?.permissionKeys ?? [];
  const isAdmin = !!rolesQ.data && roleKeys.includes("admin");
  const rolesError = rolesQ.error instanceof Error ? rolesQ.error.message : rolesQ.error ? String(rolesQ.error) : null;

  const rolesLoading = auth.ready && !!operatorId && (rolesQ.isLoading || rolesQ.isFetching);
  const isReady = !operatorId || (auth.ready && !rolesQ.isLoading && !rolesQ.isFetching);

  if (typeof window !== "undefined" && import.meta.env.DEV) {
    console.log("[auth-debug] useCurrentUser", {
      currentUserId: auth.userId,
      authReady: auth.ready,
      authVersion: auth.version,
      operatorId,
      roleKeys,
      permissionKeys,
      getCurrentRolesResponse: rolesQ.data,
      queryStatus: rolesQ.status,
      fetchStatus: rolesQ.fetchStatus,
      isReady,
      rolesLoading,
      rolesError,
      isRoleKeysMissingBeforeLoadComplete: !isReady && (!Array.isArray(roleKeys) || roleKeys.length === 0),
    });
  }

  return {
    isReady,
    authReady: auth.ready,
    rolesLoading,
    rolesError,
    operatorId,
    currentAuthUserId: auth.userId,
    profile,
    roleKeys,
    permissionKeys,
    isAdmin,
    stored,
    currentRoles,
  };
}