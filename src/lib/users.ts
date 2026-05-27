import { createServerFn } from "@tanstack/react-start";

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
  selected_at: string;
}

const STORAGE_KEY = "tivo.operator";

function parseSecretKey(raw: string | undefined): string {
  const value = (raw ?? "").trim();
  if (!value) return "";
  if (!value.startsWith("[")) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) && typeof parsed[0] === "string"
      ? parsed[0]
      : "";
  } catch {
    return value;
  }
}

const fetchAssignableUsers = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ rows: AssignableUser[]; error: string | null }> => {
    const url = (
      process.env.SUPABASE_URL || process.env.ANALYTICS_SUPABASE_URL || ""
    ).replace(/\/+$/, "");
    const key = parseSecretKey(
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEYS,
    );
    if (!url || !key) {
      return { rows: [], error: "Supabase servera konfigurācija nav pieejama." };
    }

    const query =
      "select=id,user_code,full_name,email,status_key,is_active&is_active=eq.true&order=full_name.asc&limit=500";
    const res = await fetch(`${url}/rest/v1/profiles?${query}`, {
      method: "GET",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Accept-Profile": "crm",
        Accept: "application/json",
      },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return {
        rows: [],
        error: `Neizdevās nolasīt crm.profiles (${res.status}): ${text.slice(0, 300)}`,
      };
    }
    const rows = (await res.json()) as Record<string, unknown>[];
    return {
      rows: rows
        .filter((r) => r && typeof r.id === "string")
        .map((r) => ({
          id: String(r.id),
          user_code: r.user_code == null ? null : String(r.user_code),
          full_name: r.full_name == null ? null : String(r.full_name),
          email: r.email == null ? null : String(r.email),
          status_key: r.status_key == null ? null : String(r.status_key),
          is_active: r.is_active !== false,
        })),
      error: null,
    };
  },
);

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
  const res = await fetchAssignableUsers();
  if (res.error) throw new Error(res.error);
  return res.rows.filter(
    (u) => u.status_key == null || u.status_key === "active",
  );
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
): void {
  if (!isBrowser() || !profile.id) return;
  const payload: StoredOperator = {
    operator_id: profile.id,
    full_name: displayName(profile),
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