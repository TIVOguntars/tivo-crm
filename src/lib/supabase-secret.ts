import { createServerOnlyFn } from "@tanstack/react-start";

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

export interface SupabaseEnvDiagnostics {
  has_SUPABASE_URL: boolean;
  has_SUPABASE_SECRET_KEYS: boolean;
  type_SUPABASE_SECRET_KEYS: string;
  length_SUPABASE_SECRET_KEYS: number;
  has_SUPABASE_SERVICE_ROLE_KEY: boolean;
  selected_key_source: string | null;
  selected_key_length: number | null;
}

export function getRuntimeEnv(name: string): string | undefined {
  const value = getRuntimeEnvValue(name);
  return typeof value === "string" ? value : undefined;
}

function getRuntimeEnvValue(name: string): unknown {
  const fromProcess = typeof process !== "undefined" ? process.env?.[name] : undefined;
  if (fromProcess) return fromProcess;
  return (globalThis as RuntimeEnvGlobal).Deno?.env?.get?.(name);
}

function isJwtLike(value: string): boolean {
  return /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value);
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

function resolveSupabaseServiceKey(): {
  key: string | null;
  source: string | null;
  rawSecretKeys: unknown;
  fallbackServiceRoleKey: string | undefined;
  firstLevelKeys: string[];
} {
  const rawSecretKeys = getRuntimeEnvValue("SUPABASE_SECRET_KEYS");
  const fallbackServiceRoleKey = getRuntimeEnv("SUPABASE_SERVICE_ROLE_KEY");

  let selectedKey: string | null = null;
  let selectedSource: string | null = null;
  let firstLevelKeys: string[] = [];

  if (rawSecretKeys && typeof rawSecretKeys === "object") {
    firstLevelKeys = Object.keys(rawSecretKeys as Record<string, unknown>);
    const picked = pickKeyFromObject(rawSecretKeys as Record<string, unknown>);
    selectedKey = picked.key;
    selectedSource = picked.source;
  }

  const raw = typeof rawSecretKeys === "string" ? rawSecretKeys.trim() : "";
  if (!selectedKey && raw) {
    if (isJwtLike(raw)) {
      selectedKey = raw;
      selectedSource = "SUPABASE_SECRET_KEYS plain JWT string";
    } else {
      try {
        const parsed = JSON.parse(raw) as unknown;
        if (parsed && typeof parsed === "object") {
          firstLevelKeys = Object.keys(parsed as Record<string, unknown>);
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

  return {
    key: selectedKey,
    source: selectedSource,
    rawSecretKeys,
    fallbackServiceRoleKey,
    firstLevelKeys,
  };
}

export const getSupabaseEnvDiagnostics = createServerOnlyFn(
  (): SupabaseEnvDiagnostics => {
    const url = getRuntimeEnv("SUPABASE_URL") || getRuntimeEnv("ANALYTICS_SUPABASE_URL");
    const resolved = resolveSupabaseServiceKey();
    const raw = resolved.rawSecretKeys;

    return {
      has_SUPABASE_URL: !!url,
      has_SUPABASE_SECRET_KEYS: raw != null && String(raw).length > 0,
      type_SUPABASE_SECRET_KEYS: typeof raw,
      length_SUPABASE_SECRET_KEYS: raw == null ? 0 : String(raw).length,
      has_SUPABASE_SERVICE_ROLE_KEY: !!resolved.fallbackServiceRoleKey,
      selected_key_source: resolved.source,
      selected_key_length: resolved.key?.length ?? null,
    };
  },
);

export const getSupabaseServiceKey = createServerOnlyFn((): string | null => {
  const resolved = resolveSupabaseServiceKey();

  console.log("[auth-debug] typeof SUPABASE_SECRET_KEYS", typeof resolved.rawSecretKeys);
  console.log("[auth-debug] SUPABASE_SECRET_KEYS first-level keys", resolved.firstLevelKeys);
  console.log("[auth-debug] selected Supabase service key source", resolved.source ?? "not found");

  return resolved.key;
});

export function getSupabaseUrlFromEnv(): string {
  return (getRuntimeEnv("SUPABASE_URL") || getRuntimeEnv("ANALYTICS_SUPABASE_URL") || "").replace(
    /\/+$/,
    "",
  );
}
