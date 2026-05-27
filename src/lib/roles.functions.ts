import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
 * Resolve role keys from `crm.user_roles` + `crm.roles` using the
 * authenticated Supabase context (no service role secret).
 *
 * - Uses the verified Supabase auth user id when real auth is present.
 * - During the existing shared-password/anonymous bridge, uses the selected
 *   crm.profiles operator id, but still re-reads assignments server-side
 *   via the authenticated client (RLS allows SELECT to `authenticated`).
 * - Requires a valid Supabase bearer token (`requireSupabaseAuth`).
 * - Returns `{ roleKeys: [], permissionKeys: [] }` when no operator is
 *   selected so the UI fails closed.
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

    // Use the request-bound authenticated Supabase client. The middleware
    // already attached the user's bearer token; `.schema('crm')` switches
    // PostgREST to the crm schema (Accept-Profile/Content-Profile).
    const sb = context.supabase as unknown as {
      schema: (name: string) => {
        from: (table: string) => {
          select: (cols: string) => {
            eq: (col: string, val: string) => {
              limit: (n: number) => Promise<{ data: unknown; error: unknown }>;
            };
            limit: (n: number) => Promise<{ data: unknown; error: unknown }>;
          };
        };
      };
    };

    const [urRes, rolesRes] = await Promise.all([
      sb.schema("crm").from("user_roles").select("role_id").eq("user_id", uid).limit(200),
      sb.schema("crm").from("roles").select("id,role_key").limit(500),
    ]);

    if (urRes.error || rolesRes.error) {
      const errMsg = (e: unknown): string | null => {
        if (!e) return null;
        if (typeof e === "object" && e && "message" in e) {
          const m = (e as { message?: unknown }).message;
          return typeof m === "string" ? m : null;
        }
        return null;
      };
      const message =
        errMsg(urRes.error) ??
        errMsg(rolesRes.error) ??
        "Neizdevās nolasīt crm.user_roles / crm.roles";
      console.error("[roles] crm read failed", message);
      return { roleKeys: [], permissionKeys: [], lookupUserId: uid, error: message };
    }

    const urRows = (urRes.data ?? []) as Array<{ role_id?: unknown }>;
    const rolesRows = (rolesRes.data ?? []) as Array<{
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
