import type { ReactNode } from "react";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { LoadingState } from "@/components/DataState";

export function RequireRole({
  role,
  children,
  fallback = null,
  loadingFallback,
}: {
  role: string;
  children: ReactNode;
  fallback?: ReactNode;
  loadingFallback?: ReactNode;
}) {
  const { isReady, rolesLoading, roleKeys, currentAuthUserId, currentRoles, rolesError } = useCurrentUser();
  const stillLoading = !isReady || rolesLoading;
  const ok = !role || roleKeys.includes(role);

  if (typeof window !== "undefined" && import.meta.env.DEV) {
    console.log("[auth-debug] RequireRole", {
      authUser: currentAuthUserId,
      currentUserId: currentAuthUserId,
      roleKeys,
      getCurrentRolesResponse: currentRoles,
      requiredRole: role,
      evaluatedResult: ok,
      isReady,
      rolesLoading,
      stillLoading,
      rolesError,
    });
  }

  if (stillLoading) {
    return <>{loadingFallback ?? <LoadingState label="Pārbauda piekļuves tiesības..." />}</>;
  }

  return <>{ok ? children : fallback}</>;
}