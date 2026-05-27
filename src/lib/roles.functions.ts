import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getRequestHeader } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getSupabaseServiceKey, getSupabaseUrlFromEnv } from "@/lib/supabase-secret";

const Input = z.object({
  operatorId: z.string().uuid().nullable(),
});

export interface RoleLookupResult {
  roleKeys: string[];
  permissionKeys: string[];
  lookupUserId?: string | null;
  error?: string | null;
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
    console.log("[auth-debug] getCurrentRoles server start", {
      authUserId,
      operatorId: data.operatorId,
      isAnonymous: claims?.is_anonymous ?? null,
      lookupUserId: uid,
    });
    if (!uid) return { roleKeys: [], permissionKeys: [], lookupUserId: null };

    const SUPABASE_URL = getSupabaseUrlFromEnv();
    const SUPABASE_SECRET_KEY = getSupabaseServiceKey();
    console.log("[auth-debug] getCurrentRoles server env", {
      hasSupabaseUrl: !!SUPABASE_URL,
      hasSupabaseSecretKey: !!SUPABASE_SECRET_KEY,
    });
    if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
      const error = "Supabase servera slepenā atslēga nav pieejama vai nav derīga.";
      console.error("[roles]", error);
      return { roleKeys: [], permissionKeys: [], lookupUserId: uid, error };
    }
    const authHeader = getRequestHeader("authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return { roleKeys: [], permissionKeys: [], lookupUserId: uid };
    }

    const baseHeaders: Record<string, string> = {
      apikey: SUPABASE_SECRET_KEY,
      Authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
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
      console.error("[roles] crm read failed", urResp.status, rolesResp.status);
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
    console.log("[auth-debug] getCurrentRoles server result", {
      lookupUserId: uid,
      userRolesRows: urRows.length,
      rolesRows: rolesRows.length,
      roleKeys: Array.from(out).sort(),
    });
    return {
      roleKeys: Array.from(out).sort(),
      permissionKeys: [],
      lookupUserId: uid,
    };
  });
