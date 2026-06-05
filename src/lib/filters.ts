import { z } from "zod";
import { fallback } from "@tanstack/zod-adapter";
import type { AnalyticsFilters } from "@/lib/analytics";

export type DateRangePreset =
  | "all"
  | "today"
  | "yesterday"
  | "7d"
  | "30d"
  | "this_month"
  | "custom";

export const filtersSearchSchema = z.object({
  range: fallback(
    z.enum(["all", "today", "yesterday", "7d", "30d", "this_month", "custom"]),
    "all",
  ).default("all"),
  from: fallback(z.string().optional(), undefined),
  to: fallback(z.string().optional(), undefined),
  countries: fallback(z.array(z.string()), []).default([]),
  sources: fallback(z.array(z.string()), []).default([]),
  owners: fallback(z.array(z.string()), []).default([]),
  ppvs: fallback(z.array(z.string()), []).default([]),
  tags: fallback(z.array(z.string()), []).default([]),
  q: fallback(z.string().optional(), undefined),
});

export type FiltersSearch = z.infer<typeof filtersSearchSchema>;

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function resolveDateRange(search: FiltersSearch): {
  from: string | null;
  to: string | null;
} {
  const today = new Date();
  const start = (days: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() - days);
    return d;
  };

  switch (search.range) {
    case "all":
      return { from: null, to: null };
    case "today":
      return { from: isoDate(today), to: isoDate(today) };
    case "yesterday": {
      const y = start(1);
      return { from: isoDate(y), to: isoDate(y) };
    }
    case "7d":
      return { from: isoDate(start(6)), to: isoDate(today) };
    case "30d":
      return { from: isoDate(start(29)), to: isoDate(today) };
    case "this_month": {
      const first = new Date(today.getFullYear(), today.getMonth(), 1);
      return { from: isoDate(first), to: isoDate(today) };
    }
    case "custom":
      return {
        from: search.from ?? null,
        to: search.to ?? null,
      };
  }
}

export function buildAnalyticsFilters(search: FiltersSearch): AnalyticsFilters {
  const { from, to } = resolveDateRange(search);
  return {
    p_from: from,
    p_to: to,
    p_countries: search.countries.length > 0 ? search.countries : null,
    p_sources: search.sources.length > 0 ? search.sources : null,
    p_owners: search.owners.length > 0 ? search.owners : null,
    p_ppvs: search.ppvs.length > 0 ? search.ppvs : null,
  };
}

/** Stable cache key for react-query. */
export function filtersKey(search: FiltersSearch): string {
  const f = buildAnalyticsFilters(search);
  return JSON.stringify(f);
}