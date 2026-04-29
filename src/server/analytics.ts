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
] as const;

export type AnalyticsView = (typeof VIEWS)[number];

const RPC_FUNCTIONS = [
  "get_kpi_summary",
  "get_daily_activity",
  "get_funnel",
  "get_acquisition_funnel",
  "get_channel_summary",
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

async function queryView(view: AnalyticsView, query: string): Promise<AnalyticsRow[]> {
  const { url, key } = getEnv();
  const endpoint = `${url}/rest/v1/${view}${query ? `?${query}` : ""}`;

  const res = await fetch(endpoint, {
    method: "GET",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Accept-Profile": "analytics",
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Neizdevās nolasīt analytics.${view} (${res.status}): ${text.slice(0, 300)}`,
    );
  }

  return (await res.json()) as AnalyticsRow[];
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
  .inputValidator((input: { view: AnalyticsView; query?: string }) => {
    if (!VIEWS.includes(input.view)) {
      throw new Error(`Nezināms skats: ${input.view}`);
    }
    return { view: input.view, query: input.query ?? "" };
  })
  .handler(async ({ data }) => {
    try {
      const rows = await queryView(data.view, data.query);
      return { rows, error: null as string | null };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Nezināma kļūda";
      console.error("[analytics]", message);
      return { rows: [] as AnalyticsRow[], error: message };
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
      const rows = await callRpc(data.fn, normalizeFilters(data.filters));
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