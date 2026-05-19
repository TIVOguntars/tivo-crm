import type { ReactNode } from "react";
import { useHasRole } from "@/hooks/usePermission";

export function RequireRole({
  role,
  children,
  fallback = null,
}: {
  role: string;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const ok = useHasRole(role);
  return <>{ok ? children : fallback}</>;
}