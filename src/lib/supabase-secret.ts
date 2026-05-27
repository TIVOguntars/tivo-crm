type RuntimeEnvGlobal = typeof globalThis & {
  Deno?: { env?: { get?: (name: string) => string | undefined } };
};

export function getRuntimeEnv(name: string): string | undefined {
  const fromProcess =
    typeof process !== "undefined" ? process.env?.[name] : undefined;
  if (fromProcess) return fromProcess;
  return (globalThis as RuntimeEnvGlobal).Deno?.env?.get?.(name);
}

function decodeJwtRole(value: string): string | null {
  const payload = value.split(".")[1];
  if (!payload) return null;
  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const json = JSON.parse(atob(padded)) as { role?: unknown };
    return typeof json.role === "string" ? json.role : null;
  } catch {
    return null;
  }
}

function collectSecretCandidates(
  value: unknown,
  hint = "",
): Array<{ key: string; score: number }> {
  if (typeof value === "string") {
    const key = value.trim();
    if (!key) return [];
    const lowerHint = hint.toLowerCase();
    const role = decodeJwtRole(key);
    if (role === "anon") return [{ key, score: -100 }];
    let score = role === "service_role" ? 100 : 0;
    if (lowerHint.includes("active") || lowerHint.includes("current")) score += 30;
    if (lowerHint.includes("primary") || lowerHint.includes("service")) score += 20;
    if (lowerHint.includes("secret")) score += 10;
    return [{ key, score }];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      collectSecretCandidates(item, `${hint}.${index}`),
    );
  }
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([k, v]) =>
      collectSecretCandidates(v, `${hint}.${k}`),
    );
  }
  return [];
}

export function parseSupabaseSecretKey(
  rawSecretKeys: string | undefined,
  fallbackServiceRoleKey?: string,
): string | null {
  const candidates: Array<{ key: string; score: number }> = [];
  const raw = rawSecretKeys?.trim();
  if (raw) {
    try {
      candidates.push(...collectSecretCandidates(JSON.parse(raw), "SUPABASE_SECRET_KEYS"));
    } catch {
      candidates.push(...collectSecretCandidates(raw, "SUPABASE_SECRET_KEYS"));
    }
  }
  if (fallbackServiceRoleKey?.trim()) {
    candidates.push(
      ...collectSecretCandidates(
        fallbackServiceRoleKey,
        "SUPABASE_SERVICE_ROLE_KEY",
      ),
    );
  }
  return candidates
    .filter((c) => c.score >= 0)
    .sort((a, b) => b.score - a.score)[0]?.key ?? null;
}

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
