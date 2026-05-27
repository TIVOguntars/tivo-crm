import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { fetchCrmView } from "@/server/analytics";

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

    const [urRes, rolesRes] = await Promise.all([
      fetchCrmView({
        data: {
          view: "user_roles",
          query: `select=role_id&user_id=eq.${encodeURIComponent(uid)}&limit=200`,
        },
      }),
      fetchCrmView({
        data: { view: "roles", query: "select=id,role_key&limit=200" },
      }),
    ]);

    const urRows = (urRes?.rows ?? []) as Array<{ role_id?: unknown }>;
    const rolesRows = (rolesRes?.rows ?? []) as Array<{
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