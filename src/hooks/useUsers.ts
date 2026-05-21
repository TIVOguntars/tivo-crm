import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import {
  buildUserMap,
  displayName,
  listAssignableUsers,
  type AssignableUser,
} from "@/lib/users";

export function useAssignableUsers() {
  return useQuery({
    queryKey: ["crm", "assignable_users"],
    queryFn: listAssignableUsers,
    staleTime: 5 * 60_000,
  });
}

/** Map of UUID (and user_code fallback) → display name. */
export function useUserMap(): {
  map: Map<string, string>;
  resolve: (id: string | null | undefined) => string;
  resolveCode: (id: string | null | undefined) => string;
  isLoading: boolean;
} {
  const q = useAssignableUsers();
  const users: AssignableUser[] = q.data ?? [];
  const map = useMemo(() => buildUserMap(users), [users]);
  const codeMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const u of users) {
      const code = (u.user_code ?? "").trim();
      if (!code) continue;
      if (u.id) m.set(u.id, code);
      m.set(code, code);
      const name = displayName(u);
      if (name) m.set(name, code);
    }
    return m;
  }, [users]);
  const resolve = (id: string | null | undefined): string => {
    if (!id) return "";
    const trimmed = String(id).trim();
    if (!trimmed) return "";
    return map.get(trimmed) ?? "";
  };
  const resolveCode = (id: string | null | undefined): string => {
    if (!id) return "";
    const trimmed = String(id).trim();
    if (!trimmed) return "";
    return codeMap.get(trimmed) ?? "";
  };
  return { map, resolve, resolveCode, isLoading: q.isLoading };
}

export { displayName };