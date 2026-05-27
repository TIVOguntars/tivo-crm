import { useEffect, useRef, type ReactNode } from "react";
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
  const { isReady, rolesLoading, roleKeys, currentAuthUserId, currentRoles, rolesError } =
    useCurrentUser();
  // Remember the first resolved decision so background refetches don't flash
  // the loading state back on.
  const decidedRef = useRef<boolean | null>(null);
  const hasResolved = isReady && !!currentRoles;
  const currentDecision = hasResolved ? roleKeys.includes(role) : null;
  useEffect(() => {
    if (hasResolved) decidedRef.current = currentDecision;
  }, [hasResolved, currentDecision]);
  const stillLoading = decidedRef.current === null && (!isReady || rolesLoading);
  const ok = decidedRef.current ?? currentDecision;

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

  return <>{ok === true ? children : fallback}</>;
}
