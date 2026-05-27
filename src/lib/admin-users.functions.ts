import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Admin write helpers for the `crm` schema.
 * Uses the authenticated Supabase context and security-definer RPCs
 * that check `crm.has_role(auth.uid(), 'admin')` server-side.
 */

function requireText(v: unknown, label: string): string {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) throw new Error(`${label} ir obligāts`);
  return s;
}

// ---------- Profile create / update ----------

export interface AdminProfileInput {
  actorUserId?: string | null;
  id?: string | null;
  full_name: string;
  email: string;
  user_code: string;
  phone?: string | null;
  is_active?: boolean;
}

export const adminUpsertProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: AdminProfileInput) => {
    return {
      id: input.id ? String(input.id) : null,
      full_name: requireText(input.full_name, "Vārds"),
      email: requireText(input.email, "E-pasts").toLowerCase(),
      user_code: requireText(input.user_code, "ID").toUpperCase(),
      phone: input.phone ? String(input.phone).trim() : null,
      is_active: input.is_active !== false,
    };
  })
  .handler(async ({ data, context }) => {
    try {
      const sb = context.supabase as unknown as {
        schema: (s: string) => { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> };
      };
      const { data: rpcData, error } = await sb
        .schema("crm")
        .rpc("admin_upsert_profile", {
          p_id: data.id,
          p_full_name: data.full_name,
          p_email: data.email,
          p_user_code: data.user_code,
          p_phone: data.phone,
          p_is_active: data.is_active,
        });
      if (error) throw new Error(error.message);
      const profileId = typeof rpcData === "string" ? rpcData : (rpcData as { id?: string } | null)?.id ?? null;
      if (!profileId) throw new Error("Neizdevās saglabāt lietotāju");
      return { id: profileId, error: null as string | null };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Nezināma kļūda";
      console.error("[admin-users upsert]", message);
      return { id: null as string | null, error: message };
    }
  });

// ---------- User ↔ roles ----------

export const adminSetUserRoles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string; roleKeys: string[] }) => ({
    userId: requireText(input.userId, "Lietotājs"),
    roleKeys: Array.isArray(input.roleKeys)
      ? Array.from(
          new Set(
            input.roleKeys
              .filter((k): k is string => typeof k === "string" && !!k.trim())
              .map((k) => k.trim()),
          ),
        )
      : [],
  }))
  .handler(async ({ data, context }) => {
    try {
      const sb = context.supabase as unknown as {
        schema: (s: string) => { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> };
      };
      const { error } = await sb
        .schema("crm")
        .rpc("admin_set_user_roles", {
          p_user_id: data.userId,
          p_role_keys: data.roleKeys,
        });
      if (error) throw new Error(error.message);
      return { error: null as string | null };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Nezināma kļūda";
      console.error("[admin-users setUserRoles]", message);
      return { error: message };
    }
  });

// ---------- Role ↔ permissions ----------

export const adminSetRolePermissions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { roleKey: string; permissionKeys: string[] }) => ({
    roleKey: requireText(input.roleKey, "Loma"),
    permissionKeys: Array.isArray(input.permissionKeys)
      ? Array.from(
          new Set(
            input.permissionKeys
              .filter((k): k is string => typeof k === "string" && !!k.trim())
              .map((k) => k.trim()),
          ),
        )
      : [],
  }))
  .handler(async ({ data, context }) => {
    try {
      const sb = context.supabase as unknown as {
        schema: (s: string) => { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> };
      };
      const { error } = await sb
        .schema("crm")
        .rpc("admin_set_role_permissions", {
          p_role_key: data.roleKey,
          p_permission_keys: data.permissionKeys,
        });
      if (error) throw new Error(error.message);
      return { error: null as string | null };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Nezināma kļūda";
      console.error("[admin-users setRolePermissions]", message);
      return { error: message };
    }
  });
