import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getRequestHeader } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Input = z.object({
  operatorId: z.string().uuid().nullable(),
});

export interface RoleLookupResult {
  roleKeys: string[];
  permissionKeys: string[];
  lookupUserId?: string | null;
}

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

/**
 * Resolve role keys from `crm.user_roles` + `crm.roles` in the `crm` schema.
 *
 * Interim Bridge (B):
 *   - Uses the verified Supabase auth user id when real auth is present.
 *   - During the existing shared-password/anonymous bridge, uses the selected
 *     crm.profiles operator id, but still re-reads assignments server-side.
 *   - Requires a valid Supabase bearer token (`requireSupabaseAuth`).
 *   - Returns `{ roleKeys: [], permissionKeys: [] }` when no operator is
 *     selected so the UI fails closed.
 *
 * Permissions feed is reserved for the Real Auth follow-up and returns `[]`.
 */
export const getCurrentRoles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => Input.parse(d))
  .handler(async ({ data, context }): Promise<RoleLookupResult> => {
    const authUserId = context.userId;
    const claims = context.claims as { is_anonymous?: boolean } | undefined;
    const uid = claims?.is_anonymous ? data.operatorId : authUserId;
    if (!uid) return { roleKeys: [], permissionKeys: [], lookupUserId: null };

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
    const SUPABASE_SERVICE_ROLE_KEY = parseSecretKey(
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEYS,
    );
    if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error("[roles] Supabase server env missing");
      return { roleKeys: [], permissionKeys: [], lookupUserId: uid };
    }
    const authHeader = getRequestHeader("authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return { roleKeys: [], permissionKeys: [], lookupUserId: uid };
    }

    const baseHeaders: Record<string, string> = {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Accept-Profile": "crm",
      Accept: "application/json",
    };
    const root = SUPABASE_URL.replace(/\/+$/, "");

    const [urResp, rolesResp] = await Promise.all([
      fetch(
        `${root}/rest/v1/user_roles?select=role_id&user_id=eq.${encodeURIComponent(uid)}&limit=200`,
        { headers: baseHeaders },
      ),
      fetch(`${root}/rest/v1/roles?select=id,role_key&limit=200`, {
        headers: baseHeaders,
      }),
    ]);

    if (!urResp.ok || !rolesResp.ok) {
      console.error(
        "[roles] crm read failed",
        urResp.status,
        rolesResp.status,
      );
      return { roleKeys: [], permissionKeys: [], lookupUserId: uid };
    }

    const urRows = (await urResp.json()) as Array<{ role_id?: unknown }>;
    const rolesRows = (await rolesResp.json()) as Array<{
      id?: unknown;
      role_key?: unknown;
    }>;

    const keyById = new Map<string, string>();
    for (const r of rolesRows) {
      if (typeof r.id === "string" && typeof r.role_key === "string") {
        keyById.set(r.id, r.role_key);
      }
    }
    const out = new Set<string>();
    for (const r of urRows) {
      if (typeof r.role_id === "string" && keyById.has(r.role_id)) {
        out.add(keyById.get(r.role_id)!);
      }
    }
    return {
      roleKeys: Array.from(out).sort(),
      permissionKeys: [],
      lookupUserId: uid,
    };
  });