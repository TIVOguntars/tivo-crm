import type { ReactNode } from "react";
import { useHasPermission } from "@/hooks/usePermission";

export function RequirePermission({
  perm,
  children,
  fallback = null,
}: {
  perm: string;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const ok = useHasPermission(perm);
  return <>{ok ? children : fallback}</>;
}