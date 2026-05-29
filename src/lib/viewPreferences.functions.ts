import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Per-operator view preferences (filters / sorting / grouping) persisted in
 * `crm.user_view_preferences`. Replaces localStorage-based persistence on the
 * Leads screen.
 *
 * Scoping mirrors the project's shared-password/operator bridge: the row is
 * keyed by the selected operator id (crm.profiles.id), passed from the client.
 * RLS allows `authenticated` access; per-operator scoping is enforced here.
 */

const filterRuleSchema = z.object({
  f: z.string().min(1).max(64),
  op: z.string().min(1).max(32),
  v: z.unknown().optional(),
});
const sortRuleSchema = z.object({
  f: z.string().min(1).max(64),
  d: z.enum(["asc", "desc"]),
});

const GetInput = z.object({
  viewKey: z.string().min(1).max(64),
  operatorId: z.string().uuid().nullable(),
});

const SaveInput = z.object({
  viewKey: z.string().min(1).max(64),
  operatorId: z.string().uuid().nullable(),
  filters: z.array(filterRuleSchema).max(50),
  sorting: z.array(sortRuleSchema).max(10),
  grouping: z.array(z.string().min(1).max(64)).max(3),
});

export interface ViewPreference {
  filters: Record<string, unknown>[];
  sorting: Record<string, unknown>[];
  grouping: string[];
}

/** Minimal loose client shape — crm schema tables aren't in generated types. */
type CrmQuery = {
  select: (cols: string) => {
    eq: (col: string, val: string) => {
      eq: (col: string, val: string) => {
        maybeSingle: () => Promise<{ data: unknown; error: { message?: string } | null }>;
      };
    };
  };
  upsert: (
    row: Record<string, unknown>,
    opts: { onConflict: string },
  ) => Promise<{ error: { message?: string } | null }>;
};
type LooseClient = {
  schema: (name: string) => { from: (table: string) => CrmQuery };
};

export const getViewPreference = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => GetInput.parse(d))
  .handler(async ({ data, context }): Promise<ViewPreference | null> => {
    if (!data.operatorId) return null;
    const sb = context.supabase as unknown as LooseClient;
    const { data: row, error } = await sb
      .schema("crm")
      .from("user_view_preferences")
      .select("filters,sorting,grouping")
      .eq("user_id", data.operatorId)
      .eq("view_key", data.viewKey)
      .maybeSingle();
    if (error) {
      console.error("[viewPreferences] read failed", error.message);
      return null;
    }
    if (!row || typeof row !== "object") return null;
    const r = row as { filters?: unknown; sorting?: unknown; grouping?: unknown };
    return {
      filters: (Array.isArray(r.filters) ? r.filters : []) as Record<string, unknown>[],
      sorting: (Array.isArray(r.sorting) ? r.sorting : []) as Record<string, unknown>[],
      grouping: Array.isArray(r.grouping) ? (r.grouping as string[]) : [],
    };
  });

export const saveViewPreference = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => SaveInput.parse(d))
  .handler(async ({ data, context }): Promise<{ ok: boolean; error?: string }> => {
    if (!data.operatorId) return { ok: false, error: "no-operator" };
    const sb = context.supabase as unknown as LooseClient;
    const { error } = await sb
      .schema("crm")
      .from("user_view_preferences")
      .upsert(
        {
          user_id: data.operatorId,
          view_key: data.viewKey,
          filters: data.filters,
          sorting: data.sorting,
          grouping: data.grouping,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,view_key" },
      );
    if (error) {
      console.error("[viewPreferences] save failed", error.message);
      return { ok: false, error: error.message };
    }
    return { ok: true };
  });