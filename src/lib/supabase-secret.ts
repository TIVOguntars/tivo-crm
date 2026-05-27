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
    const score =
      role === "service_role"
        ? 100
        : role === "anon"
          ? -100
        : lowerHint.includes("active") ||
            lowerHint.includes("service") ||
            lowerHint.includes("secret")
          ? 50
          : 0;
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
