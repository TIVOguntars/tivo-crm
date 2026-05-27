import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Row = Record<string, unknown>;

function msg(e: unknown, fallback: string): string {
  if (e && typeof e === "object" && "message" in e) {
    const m = (e as { message?: unknown }).message;
    if (typeof m === "string") return m;
  }
  return fallback;
}

// Loose typing for context.supabase.schema(...).from(...) chain
type SB = {
  schema: (s: string) => {
    from: (t: string) => {
      select: (cols: string) => {
        order?: (col: string, opts: { ascending: boolean }) => Promise<{ data: unknown; error: unknown }>;
        limit?: (n: number) => Promise<{ data: unknown; error: unknown }>;
      } & Promise<{ data: unknown; error: unknown }>;
    };
  };
};

async function selectAll(
  context: { supabase: unknown },
  schemaName: string,
  table: string,
  cols: string,
): Promise<Row[]> {
  const sb = context.supabase as unknown as SB;
  const res = await sb.schema(schemaName).from(table).select(cols);
  if (res.error) {
    throw new Error(msg(res.error, `Neizdevās nolasīt ${schemaName}.${table}`));
  }
  return ((res.data ?? []) as Row[]) ?? [];
}

export interface AdminUsersTabPayload {
  profiles: Row[];
  roles: Row[];
  userRoles: Row[];
  error: string | null;
}

export const loadAdminUsersTab = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminUsersTabPayload> => {
    try {
      const [profiles, roles, userRoles] = await Promise.all([
        selectAll(context, "crm", "profiles", "id,full_name,email,user_code,phone,is_active,status_key"),
        selectAll(context, "crm", "roles", "id,role_key,role_name"),
        selectAll(context, "crm", "user_roles", "user_id,role_id"),
      ]);
      return { profiles, roles, userRoles, error: null };
    } catch (err) {
      return {
        profiles: [],
        roles: [],
        userRoles: [],
        error: err instanceof Error ? err.message : "Nezināma kļūda",
      };
    }
  });

export interface AdminRolesTabPayload {
  roles: Row[];
  permissions: Row[];
  rolePermissions: Row[];
  error: string | null;
}

export const loadAdminRolesTab = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminRolesTabPayload> => {
    try {
      const [roles, permissions, rolePermissions] = await Promise.all([
        selectAll(context, "crm", "roles", "id,role_key,role_name"),
        selectAll(context, "crm", "permissions", "id,permission_key,description,resource,action"),
        selectAll(context, "crm", "role_permissions", "role_id,permission_id"),
      ]);
      return { roles, permissions, rolePermissions, error: null };
    } catch (err) {
      return {
        roles: [],
        permissions: [],
        rolePermissions: [],
        error: err instanceof Error ? err.message : "Nezināma kļūda",
      };
    }
  });