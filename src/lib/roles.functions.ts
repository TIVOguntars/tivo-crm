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
}

/**
 * Resolve role keys for the currently-selected operator from the `crm` schema.
 *
 * Interim Bridge (B):
 *   - Trusts the client-supplied `operatorId` (chosen via OperatorPicker) for
 *     the lookup, BUT always re-reads role assignments from
 *     `crm.user_roles` + `crm.roles` server-side. Role claims are never read
 *     from the client payload or localStorage.
 *   - Requires a valid Supabase bearer token (`requireSupabaseAuth`).
 *   - Returns `{ roleKeys: [], permissionKeys: [] }` when no operator is
 *     selected so the UI fails closed.
 *
 * Permissions feed is reserved for the Real Auth follow-up and returns `[]`.
 */
export const getCurrentRoles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => Input.parse(d))
  .handler(async ({ data }): Promise<RoleLookupResult> => {
    const uid = data.operatorId;
    if (!uid) return { roleKeys: [], permissionKeys: [] };

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
    if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
      return { roleKeys: [], permissionKeys: [] };
    }
    const authHeader = getRequestHeader("authorization") ?? "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : SUPABASE_PUBLISHABLE_KEY;

    const baseHeaders: Record<string, string> = {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${token}`,
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
      return { roleKeys: [], permissionKeys: [] };
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
    };
  });