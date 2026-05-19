import { fetchCrmView } from "@/server/analytics";

export interface AssignableUser {
  id: string;
  user_code: string | null;
  full_name: string | null;
  email: string | null;
  status_key: string | null;
  is_active: boolean;
}

export interface StoredOperator {
  operator_id: string;
  full_name: string;
  role_keys: string[];
  selected_at: string;
}

const STORAGE_KEY = "tivo.operator";

/** Display priority: full_name → email → user_code → id. */
export function displayName(
  u:
    | Pick<AssignableUser, "id" | "full_name" | "email" | "user_code">
    | null
    | undefined,
): string {
  if (!u) return "";
  return (
    (u.full_name && u.full_name.trim()) ||
    (u.email && u.email.trim()) ||
    (u.user_code && u.user_code.trim()) ||
    u.id ||
    ""
  );
}

/** Build a fast id → display-name map (also keys by user_code for fallback). */
export function buildUserMap(users: AssignableUser[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const u of users) {
    const name = displayName(u);
    if (u.id) m.set(u.id, name);
    if (u.user_code && !m.has(u.user_code)) m.set(u.user_code, name);
  }
  return m;
}

/** Fetch only currently assignable (active) operators. */
export async function listAssignableUsers(): Promise<AssignableUser[]> {
  const res = await fetchCrmView({
    data: {
      view: "profiles",
      query:
        "select=id,user_code,full_name,email,status_key,is_active&is_active=eq.true&order=full_name.asc&limit=500",
    },
  });
  const rows = (res?.rows ?? []) as Record<string, unknown>[];
  return rows
    .filter((r) => r && typeof r.id === "string")
    .map((r) => ({
      id: String(r.id),
      user_code: r.user_code == null ? null : String(r.user_code),
      full_name: r.full_name == null ? null : String(r.full_name),
      email: r.email == null ? null : String(r.email),
      status_key: r.status_key == null ? null : String(r.status_key),
      is_active: r.is_active !== false,
    }))
    .filter(
      (u) => u.status_key == null || u.status_key === "active",
    );
}

/** Fetch role_keys assigned to a single user via crm.user_roles + crm.roles. */
export async function listRoleKeysForUser(userId: string): Promise<string[]> {
  if (!userId) return [];
  const [urRes, rolesRes] = await Promise.all([
    fetchCrmView({
      data: {
        view: "user_roles",
        query: `select=role_id&user_id=eq.${userId}&limit=100`,
      },
    }),
    fetchCrmView({
      data: { view: "roles", query: "select=id,role_key&limit=200" },
    }),
  ]);
  const urRows = (urRes?.rows ?? []) as Record<string, unknown>[];
  const rolesRows = (rolesRes?.rows ?? []) as Record<string, unknown>[];
  const keyById = new Map<string, string>();
  for (const r of rolesRows) {
    if (typeof r.id === "string" && typeof r.role_key === "string") {
      keyById.set(r.id, r.role_key);
    }
  }
  const out = new Set<string>();
  for (const r of urRows) {
    const rid = typeof r.role_id === "string" ? r.role_id : null;
    if (rid && keyById.has(rid)) out.add(keyById.get(rid)!);
  }
  return Array.from(out).sort();
}

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

export function getStoredOperator(): StoredOperator | null {
  if (!isBrowser()) return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredOperator> | null;
    if (
      !parsed ||
      typeof parsed.operator_id !== "string" ||
      !parsed.operator_id
    ) {
      return null;
    }
    return {
      operator_id: parsed.operator_id,
      full_name:
        typeof parsed.full_name === "string" ? parsed.full_name : "",
      role_keys: Array.isArray(parsed.role_keys)
        ? parsed.role_keys.filter((k): k is string => typeof k === "string")
        : [],
      selected_at:
        typeof parsed.selected_at === "string"
          ? parsed.selected_at
          : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export function setStoredOperator(
  profile: Pick<AssignableUser, "id" | "full_name" | "email" | "user_code">,
  roleKeys: string[],
): void {
  if (!isBrowser() || !profile.id) return;
  const payload: StoredOperator = {
    operator_id: profile.id,
    full_name: displayName(profile),
    role_keys: Array.from(new Set(roleKeys.filter(Boolean))),
    selected_at: new Date().toISOString(),
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

export function clearStoredOperator(): void {
  if (!isBrowser()) return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export const OPERATOR_STORAGE_KEY = STORAGE_KEY;