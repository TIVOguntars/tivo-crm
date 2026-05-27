import type { ReactNode } from "react";
import { useCurrentUser } from "@/hooks/useCurrentUser";

export function RequireRole({
  role,
  children,
  fallback = null,
}: {
  role: string;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { roleKeys } = useCurrentUser();
  const ok = !role || roleKeys.includes(role);
  return <>{ok ? children : fallback}</>;
}