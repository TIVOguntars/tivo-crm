import { z } from "zod";
import { fallback } from "@tanstack/zod-adapter";
import type { AnalyticsFilters } from "@/server/analytics";

export type DateRangePreset = "today" | "7d" | "30d" | "custom";

export const filtersSearchSchema = z.object({
  range: fallback(
    z.enum(["today", "7d", "30d", "custom"]),
    "30d",
  ).default("30d"),
  from: fallback(z.string().optional(), undefined),
  to: fallback(z.string().optional(), undefined),
  countries: fallback(z.array(z.string()), []).default([]),
  sources: fallback(z.array(z.string()), []).default([]),
  owners: fallback(z.array(z.string()), []).default([]),
  ppvs: fallback(z.array(z.string()), []).default([]),
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
    case "today":
      return { from: isoDate(today), to: isoDate(today) };
    case "7d":
      return { from: isoDate(start(6)), to: isoDate(today) };
    case "30d":
      return { from: isoDate(start(29)), to: isoDate(today) };
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