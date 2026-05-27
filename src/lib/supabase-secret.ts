type RuntimeEnvGlobal = typeof globalThis & {
  Deno?: { env?: { get?: (name: string) => string | undefined } };
};

const PREFERRED_SECRET_KEYS = [
  "service_role",
  "serviceRole",
  "service-role",
  "current",
  "primary",
  "default",
];

export function getRuntimeEnv(name: string): string | undefined {
  const fromProcess =
    typeof process !== "undefined" ? process.env?.[name] : undefined;
  if (fromProcess) return fromProcess;
  return (globalThis as RuntimeEnvGlobal).Deno?.env?.get?.(name);
}

function isJwtLike(value: string): boolean {
  return value.split(".").length === 3;
}

function firstStringValue(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = firstStringValue(item);
      if (found) return found;
    }
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) {
      const found = firstStringValue(item);
      if (found) return found;
    }
  }
  return null;
}

function pickKeyFromObject(value: Record<string, unknown>): {
  key: string | null;
  source: string;
} {
  const firstLevelKeys = Object.keys(value);
  console.log("[auth-debug] SUPABASE_SECRET_KEYS first-level keys", firstLevelKeys);

  for (const keyName of PREFERRED_SECRET_KEYS) {
    const selected = firstStringValue(value[keyName]);
    if (selected) {
      return {
        key: selected,
        source: `SUPABASE_SECRET_KEYS.${keyName}`,
      };
    }
  }

  const fallback = firstStringValue(value);
  return {
    key: fallback,
    source: fallback ? "SUPABASE_SECRET_KEYS first string value" : "not found",
  };
}

export function getSupabaseServiceKey(): string | null {
  const rawSecretKeys = getRuntimeEnv("SUPABASE_SECRET_KEYS");
  const fallbackServiceRoleKey = getRuntimeEnv("SUPABASE_SERVICE_ROLE_KEY");

  console.log("[auth-debug] typeof SUPABASE_SECRET_KEYS", typeof rawSecretKeys);

  let selectedKey: string | null = null;
  let selectedSource = "not found";

  const raw = rawSecretKeys?.trim();
  if (raw) {
    if (isJwtLike(raw)) {
      selectedKey = raw;
      selectedSource = "SUPABASE_SECRET_KEYS plain JWT string";
    } else {
      try {
        const parsed = JSON.parse(raw) as unknown;
        if (parsed && typeof parsed === "object") {
          const picked = pickKeyFromObject(parsed as Record<string, unknown>);
          selectedKey = picked.key;
          selectedSource = picked.source;
        } else if (typeof parsed === "string" && parsed.trim()) {
          selectedKey = parsed.trim();
          selectedSource = "SUPABASE_SECRET_KEYS JSON string";
        }
      } catch {
        selectedKey = raw;
        selectedSource = "SUPABASE_SECRET_KEYS plain string";
      }
    }
  }

  if (!selectedKey && fallbackServiceRoleKey?.trim()) {
    selectedKey = fallbackServiceRoleKey.trim();
    selectedSource = "SUPABASE_SERVICE_ROLE_KEY fallback";
  }

  console.log("[auth-debug] selected Supabase service key source", selectedSource);
  return selectedKey;
}

export const getSupabaseSecretKeyFromEnv = getSupabaseServiceKey;

export function getSupabaseUrlFromEnv(): string {
  return (getRuntimeEnv("SUPABASE_URL") || getRuntimeEnv("ANALYTICS_SUPABASE_URL") || "").replace(
    /\/+$/,
    "",
  );
}

export function getSupabaseSecretKeyFromEnv(): string | null {
  return parseSupabaseSecretKey(
    getRuntimeEnv("SUPABASE_SECRET_KEYS"),
    getRuntimeEnv("SUPABASE_SERVICE_ROLE_KEY"),
  );
}
