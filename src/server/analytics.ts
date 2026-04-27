import { createServerFn } from "@tanstack/react-start";

/**
 * Read-only analytics client.
 * Calls Supabase PostgREST against the `analytics` schema using the
 * `Accept-Profile` header (required when a non-public schema is exposed).
 * Uses the anon key — RLS / view permissions on the source project apply.
 */

const VIEWS = [
  "leads_overview",
  "funnel_summary",
  "channel_performance_daily",
  "channel_performance_summary",
  "lead_engagement_summary",
] as const;

export type AnalyticsView = (typeof VIEWS)[number];

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

async function queryView(view: AnalyticsView, query: string) {
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

  return (await res.json()) as unknown[];
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
      return { rows: [] as unknown[], error: message };
    }
  });