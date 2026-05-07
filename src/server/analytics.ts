import { createServerFn } from "@tanstack/react-start";

/**
 * Read-only analytics client.
 * Calls Supabase PostgREST against the `analytics` schema using the
 * `Accept-Profile` / `Content-Profile` headers (required when a non-public
 * schema is exposed). Uses the anon key — RLS / view permissions on the
 * source project apply.
 */

const VIEWS = [
  "leads_overview",
  "funnel_summary",
  "channel_performance_daily",
  "channel_performance_summary",
  "lead_engagement_summary",
  "filter_options",
  "lead_priority_queue",
  "lead_next_action",
  "lead_communications",
  "lead_communication_events",
  "communications",
  "communication_events",
  "email_conversions",
  "email_click_performance",
  "email_click_summary",
] as const;

export type AnalyticsView = (typeof VIEWS)[number];

const RPC_FUNCTIONS = [
  "get_kpi_summary",
  "get_daily_activity",
  "get_funnel",
  "get_acquisition_funnel",
  "get_channel_summary",
  "get_channel_summary_v2",
  "get_communication_funnel",
  "get_status_changes_daily",
  "get_funnel_conversion_daily",
  "get_follow_up_counts",
] as const;

export type AnalyticsRpc = (typeof RPC_FUNCTIONS)[number];

export interface AnalyticsFilters {
  p_from?: string | null;
  p_to?: string | null;
  p_countries?: string[] | null;
  p_sources?: string[] | null;
  p_owners?: string[] | null;
  p_ppvs?: string[] | null;
  p_channels?: string[] | null;
}

function getEnv() {
  const url = process.env.ANALYTICS_SUPABASE_URL;
  const key = process.env.ANALYTICS_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "ANALYTICS_SUPABASE_URL un ANALYTICS_SUPABASE_ANON_KEY nav konfigurēti.",
    );
  }
  return { url: url.replace(/\/+$/, ""), key };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnalyticsRow = Record<string, any>;

async function queryView(
  view: AnalyticsView,
  query: string,
  withCount = false,
): Promise<{ rows: AnalyticsRow[]; total: number | null }> {
  const { url, key } = getEnv();
  const endpoint = `${url}/rest/v1/${view}${query ? `?${query}` : ""}`;

  const headers: Record<string, string> = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Accept-Profile": "analytics",
    Accept: "application/json",
  };
  if (withCount) headers.Prefer = "count=exact";

  const res = await fetch(endpoint, {
    method: "GET",
    headers,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Neizdevās nolasīt analytics.${view} (${res.status}): ${text.slice(0, 300)}`,
    );
  }

  const rows = (await res.json()) as AnalyticsRow[];
  let total: number | null = null;
  if (withCount) {
    const cr = res.headers.get("content-range"); // e.g. "0-99/590"
    if (cr) {
      const m = cr.match(/\/(\d+|\*)$/);
      if (m && m[1] !== "*") total = Number(m[1]);
    }
  }
  return { rows, total };
}

async function callRpc(
  fn: AnalyticsRpc,
  body: Record<string, unknown>,
): Promise<AnalyticsRow[]> {
  const { url, key } = getEnv();
  const endpoint = `${url}/rest/v1/rpc/${fn}`;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Accept-Profile": "analytics",
      "Content-Profile": "analytics",
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Neizdevās izsaukt RPC ${fn} (${res.status}): ${text.slice(0, 300)}`,
    );
  }

  const json = await res.json();
  // RPC may return array or single object depending on function definition
  return Array.isArray(json) ? (json as AnalyticsRow[]) : [json as AnalyticsRow];
}

function normalizeFilters(input: AnalyticsFilters): Record<string, unknown> {
  const out: Record<string, unknown> = {
    p_from: input.p_from ?? null,
    p_to: input.p_to ?? null,
    p_countries:
      input.p_countries && input.p_countries.length > 0
        ? input.p_countries
        : null,
    p_sources:
      input.p_sources && input.p_sources.length > 0 ? input.p_sources : null,
    p_owners:
      input.p_owners && input.p_owners.length > 0 ? input.p_owners : null,
    p_ppvs:
      input.p_ppvs && input.p_ppvs.length > 0 ? input.p_ppvs : null,
  };
  if (input.p_channels !== undefined) {
    out.p_channels =
      input.p_channels && input.p_channels.length > 0 ? input.p_channels : null;
  }
  return out;
}

export const fetchAnalyticsView = createServerFn({ method: "GET" })
  .inputValidator(
    (input: { view: AnalyticsView; query?: string; withCount?: boolean }) => {
    if (!VIEWS.includes(input.view)) {
      throw new Error(`Nezināms skats: ${input.view}`);
    }
      return {
        view: input.view,
        query: input.query ?? "",
        withCount: !!input.withCount,
      };
    },
  )
  .handler(async ({ data }) => {
    try {
      const { rows, total } = await queryView(
        data.view,
        data.query,
        data.withCount,
      );
      return { rows, total, error: null as string | null };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Nezināma kļūda";
      console.error("[analytics]", message);
      return { rows: [] as AnalyticsRow[], total: null, error: message };
    }
  });

export const fetchAnalyticsRpc = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      fn: AnalyticsRpc;
      filters: AnalyticsFilters;
    }) => {
      if (!RPC_FUNCTIONS.includes(input.fn)) {
        throw new Error(`Nezināma funkcija: ${input.fn}`);
      }
      return { fn: input.fn, filters: input.filters ?? {} };
    },
  )
  .handler(async ({ data }) => {
    try {
      const hasFilters =
        data.filters && Object.keys(data.filters).length > 0;
      const body = hasFilters ? normalizeFilters(data.filters) : {};
      const rows = await callRpc(data.fn, body);
      return { rows, error: null as string | null };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Nezināma kļūda";
      console.error("[analytics rpc]", message);
      return { rows: [] as AnalyticsRow[], error: message };
    }
  });

const PUBLIC_TABLES = [
  "communications",
  "communication_events",
  "tracking_links",
] as const;
export type PublicTable = (typeof PUBLIC_TABLES)[number];

async function queryPublicTable(
  table: PublicTable,
  query: string,
): Promise<AnalyticsRow[]> {
  const { url, key } = getEnv();
  const endpoint = `${url}/rest/v1/${table}${query ? `?${query}` : ""}`;

  const res = await fetch(endpoint, {
    method: "GET",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Accept-Profile": "public",
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Neizdevās nolasīt public.${table} (${res.status}): ${text.slice(0, 300)}`,
    );
  }

  return (await res.json()) as AnalyticsRow[];
}

export const fetchPublicTable = createServerFn({ method: "GET" })
  .inputValidator((input: { table: PublicTable; query?: string }) => {
    if (!PUBLIC_TABLES.includes(input.table)) {
      throw new Error(`Nezināma tabula: ${input.table}`);
    }
    return { table: input.table, query: input.query ?? "" };
  })
  .handler(async ({ data }) => {
    try {
      const rows = await queryPublicTable(data.table, data.query);
      return { rows, error: null as string | null };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Nezināma kļūda";
      console.error("[public]", message);
      return { rows: [] as AnalyticsRow[], error: message };
    }
  });

const CRM_VIEWS = [
  "next_action_queue",
  "next_action_queue_ui",
  "next_action_queue_display",
  "next_action_queue_display_enriched",
  "lead_status_options",
  "next_action_queue_filter_ui",
  "lead_drawer_summary",
  "lead_communication_timeline",
] as const;
export type CrmView = (typeof CRM_VIEWS)[number];

async function queryCrmView(
  view: CrmView,
  query: string,
): Promise<AnalyticsRow[]> {
  const { url, key } = getEnv();
  const endpoint = `${url}/rest/v1/${view}${query ? `?${query}` : ""}`;
  const res = await fetch(endpoint, {
    method: "GET",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Accept-Profile": "crm",
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Neizdevās nolasīt crm.${view} (${res.status}): ${text.slice(0, 300)}`,
    );
  }
  return (await res.json()) as AnalyticsRow[];
}

async function queryCrmViewAll(
  view: CrmView,
  query: string,
): Promise<AnalyticsRow[]> {
  const { url, key } = getEnv();
  const chunk = 1000;
  let offset = 0;
  const all: AnalyticsRow[] = [];
  // Hard safety cap to avoid runaway loops
  const maxRows = 100_000;
  while (offset < maxRows) {
    const endpoint = `${url}/rest/v1/${view}${query ? `?${query}` : ""}`;
    const res = await fetch(endpoint, {
      method: "GET",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Accept-Profile": "crm",
        Accept: "application/json",
        Range: `${offset}-${offset + chunk - 1}`,
        "Range-Unit": "items",
      },
    });
    if (!res.ok && res.status !== 206) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `Neizdevās nolasīt crm.${view} (${res.status}): ${text.slice(0, 300)}`,
      );
    }
    const batch = (await res.json()) as AnalyticsRow[];
    if (!Array.isArray(batch) || batch.length === 0) break;
    all.push(...batch);
    if (batch.length < chunk) break;
    offset += chunk;
  }
  return all;
}

export const fetchCrmView = createServerFn({ method: "GET" })
  .inputValidator((input: { view: CrmView; query?: string; all?: boolean }) => {
    if (!CRM_VIEWS.includes(input.view)) {
      throw new Error(`Nezināms skats: ${input.view}`);
    }
    return { view: input.view, query: input.query ?? "", all: !!input.all };
  })
  .handler(async ({ data }) => {
    try {
      const rows = data.all
        ? await queryCrmViewAll(data.view, data.query)
        : await queryCrmView(data.view, data.query);
      return { rows, error: null as string | null };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Nezināma kļūda";
      console.error("[crm]", message);
      return { rows: [] as AnalyticsRow[], error: message };
    }
  });

const CRM_RPCS = ["complete_human_action"] as const;
export type CrmRpc = (typeof CRM_RPCS)[number];

async function callCrmRpcRaw(
  fn: CrmRpc,
  body: Record<string, unknown>,
): Promise<AnalyticsRow[]> {
  const { url, key } = getEnv();
  const endpoint = `${url}/rest/v1/rpc/${fn}`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Accept-Profile": "crm",
      "Content-Profile": "crm",
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Neizdevās izsaukt crm.${fn} (${res.status}): ${text.slice(0, 300)}`,
    );
  }
  const json = await res.json().catch(() => null);
  if (json == null) return [];
  return Array.isArray(json) ? (json as AnalyticsRow[]) : [json as AnalyticsRow];
}

export const callCrmRpc = createServerFn({ method: "POST" })
  .inputValidator((input: { fn: CrmRpc; params: Record<string, unknown> }) => {
    if (!CRM_RPCS.includes(input.fn)) {
      throw new Error(`Nezināma crm RPC funkcija: ${input.fn}`);
    }
    return { fn: input.fn, params: input.params ?? {} };
  })
  .handler(async ({ data }) => {
    try {
      const rows = await callCrmRpcRaw(data.fn, data.params);
      return { rows, error: null as string | null };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Nezināma kļūda";
      console.error("[crm rpc]", message);
      return { rows: [] as AnalyticsRow[], error: message };
    }
  });