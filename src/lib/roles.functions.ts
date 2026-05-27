import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
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
  .handler(async ({ data, context }): Promise<RoleLookupResult> => {
    const { supabase } = context;
    const uid = data.operatorId;
    if (!uid) return { roleKeys: [], permissionKeys: [] };

    const crm = supabase.schema("crm" as never) as unknown as {
      from: (t: string) => {
        select: (cols: string) => {
          eq: (col: string, val: string) => Promise<{ data: unknown }>;
        } & Promise<{ data: unknown }>;
      };
    };

    const [urRes, rolesRes] = await Promise.all([
      crm.from("user_roles").select("role_id").eq("user_id", uid),
      crm.from("roles").select("id,role_key"),
    ]);

    const urRows = (((urRes as { data: unknown }).data ?? []) as Array<{
      role_id?: string;
    }>);
    const rolesRows = (((rolesRes as { data: unknown }).data ?? []) as Array<{
      id?: string;
      role_key?: string;
    }>);

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