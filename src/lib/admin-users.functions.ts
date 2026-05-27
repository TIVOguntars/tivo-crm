import { createServerFn } from "@tanstack/react-start";
import { getSupabaseSecretKeyFromEnv, getSupabaseUrlFromEnv } from "@/lib/supabase-secret";

/**
 * Admin write helpers for the `crm` schema.
 * Service role key stays server-side. All PostgREST calls use
 * `Accept-Profile: crm` and `Content-Profile: crm`.
 */

function getServiceEnv() {
  const url = getSupabaseUrlFromEnv();
  const key = getSupabaseSecretKeyFromEnv();
  if (!url || !key) {
    throw new Error(
      "Supabase servera slepenā atslēga nav pieejama vai nav derīga.",
    );
  }
  return { url, key };
}

type CrmMethod = "GET" | "POST" | "PATCH" | "DELETE";

async function crmRequest(
  path: string,
  init: {
    method: CrmMethod;
    body?: unknown;
    prefer?: string;
    query?: string;
  },
): Promise<unknown> {
  const { url, key } = getServiceEnv();
  const endpoint = `${url}/rest/v1/${path}${init.query ? `?${init.query}` : ""}`;
  const headers: Record<string, string> = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Accept-Profile": "crm",
    "Content-Profile": "crm",
    Accept: "application/json",
  };
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  if (init.prefer) headers.Prefer = init.prefer;

  const res = await fetch(endpoint, {
    method: init.method,
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `crm.${path} ${init.method} (${res.status}): ${text.slice(0, 400)}`,
    );
  }
  if (res.status === 204) return null;
  const ct = res.headers.get("content-type") || "";
  return ct.includes("application/json") ? res.json() : res.text();
}

function requireText(v: unknown, label: string): string {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) throw new Error(`${label} ir obligāts`);
  return s;
}

async function callCrmRpc(
  fn: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  return crmRequest(`rpc/${fn}`, {
    method: "POST",
    body,
    prefer: "return=representation",
  });
}

// ---------- Profile create / update ----------

export interface AdminProfileInput {
  actorUserId: string;
  id?: string | null;
  full_name: string;
  email: string;
  user_code: string;
  phone?: string | null;
  is_active?: boolean;
}

export const adminUpsertProfile = createServerFn({ method: "POST" })
  .inputValidator((input: AdminProfileInput) => {
    return {
      actorUserId: requireText(input.actorUserId, "Operators"),
      id: input.id ? String(input.id) : null,
      full_name: requireText(input.full_name, "Vārds"),
      email: requireText(input.email, "E-pasts").toLowerCase(),
      user_code: requireText(input.user_code, "ID").toUpperCase(),
      phone: input.phone ? String(input.phone).trim() : null,
      is_active: input.is_active !== false,
    };
  })
  .handler(async ({ data }) => {
    try {
      let profileId = data.id;
      if (profileId) {
        // Update via existing audited RPC
        await callCrmRpc("admin_update_profile_mvp", {
          p_actor_user_id: data.actorUserId,
          p_id: profileId,
          p_full_name: data.full_name,
          p_email: data.email,
          p_user_code: data.user_code,
          p_is_active: data.is_active,
        });
      } else {
        const created = (await callCrmRpc("admin_create_profile_mvp", {
          p_actor_user_id: data.actorUserId,
          p_full_name: data.full_name,
          p_email: data.email,
          p_user_code: data.user_code,
        })) as Array<{ id: string }> | { id: string } | null;
        if (Array.isArray(created)) profileId = created[0]?.id ?? null;
        else if (created && typeof created === "object") profileId = created.id ?? null;
        if (!profileId) throw new Error("Neizdevās izveidot lietotāju");
      }
      // Phone is not part of MVP RPC — PATCH directly.
      await crmRequest("profiles", {
        method: "PATCH",
        query: `id=eq.${profileId}`,
        body: { phone: data.phone },
        prefer: "return=minimal",
      });
      return { id: profileId, error: null as string | null };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Nezināma kļūda";
      console.error("[admin-users upsert]", message);
      return { id: null as string | null, error: message };
    }
  });

// ---------- User ↔ roles ----------

export const adminSetUserRoles = createServerFn({ method: "POST" })
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
  .handler(async ({ data }) => {
    try {
      // Resolve role_key -> role_id
      let roleIds: string[] = [];
      if (data.roleKeys.length > 0) {
        const inList = data.roleKeys.map((k) => `"${k}"`).join(",");
        const rows = (await crmRequest("roles", {
          method: "GET",
          query: `select=id,role_key&role_key=in.(${inList})`,
        })) as Array<{ id: string; role_key: string }>;
        const missing = data.roleKeys.filter(
          (k) => !rows.some((r) => r.role_key === k),
        );
        if (missing.length > 0) {
          throw new Error(`Nezināmas lomas: ${missing.join(", ")}`);
        }
        roleIds = rows.map((r) => r.id);
      }
      // Replace assignments transactionally-ish: delete then insert.
      await crmRequest("user_roles", {
        method: "DELETE",
        query: `user_id=eq.${data.userId}`,
        prefer: "return=minimal",
      });
      if (roleIds.length > 0) {
        await crmRequest("user_roles", {
          method: "POST",
          body: roleIds.map((rid) => ({
            user_id: data.userId,
            role_id: rid,
          })),
          prefer: "return=minimal",
        });
      }
      return { error: null as string | null };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Nezināma kļūda";
      console.error("[admin-users setUserRoles]", message);
      return { error: message };
    }
  });

// ---------- Role ↔ permissions ----------

export const adminSetRolePermissions = createServerFn({ method: "POST" })
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
  .handler(async ({ data }) => {
    try {
      const roleRows = (await crmRequest("roles", {
        method: "GET",
        query: `select=id&role_key=eq.${data.roleKey}&limit=1`,
      })) as Array<{ id: string }>;
      const roleId = roleRows[0]?.id;
      if (!roleId) throw new Error(`Nezināma loma: ${data.roleKey}`);

      let permissionIds: string[] = [];
      if (data.permissionKeys.length > 0) {
        const inList = data.permissionKeys.map((k) => `"${k}"`).join(",");
        const rows = (await crmRequest("permissions", {
          method: "GET",
          query: `select=id,permission_key&permission_key=in.(${inList})`,
        })) as Array<{ id: string; permission_key: string }>;
        const missing = data.permissionKeys.filter(
          (k) => !rows.some((r) => r.permission_key === k),
        );
        if (missing.length > 0) {
          throw new Error(`Nezināmas tiesības: ${missing.join(", ")}`);
        }
        permissionIds = rows.map((r) => r.id);
      }
      await crmRequest("role_permissions", {
        method: "DELETE",
        query: `role_id=eq.${roleId}`,
        prefer: "return=minimal",
      });
      if (permissionIds.length > 0) {
        await crmRequest("role_permissions", {
          method: "POST",
          body: permissionIds.map((pid) => ({
            role_id: roleId,
            permission_id: pid,
          })),
          prefer: "return=minimal",
        });
      }
      return { error: null as string | null };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Nezināma kļūda";
      console.error("[admin-users setRolePermissions]", message);
      return { error: message };
    }
  });