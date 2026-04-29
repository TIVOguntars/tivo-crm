import { useMemo } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";

import { useAnalyticsView } from "@/hooks/useAnalyticsView";
import { LoadingState, ErrorState, EmptyState } from "@/components/DataState";
import type { FiltersSearch } from "@/lib/filters";
import { resolveDateRange } from "@/lib/filters";

const STATUS_COLORS: Record<string, string> = {
  Jauns: "oklch(0.65 0.18 255)",
  Nesasniedzams: "oklch(0.55 0.05 260)",
  Piesaistīšana: "oklch(0.7 0.15 200)",
  Kvalificēts: "oklch(0.7 0.15 160)",
  Pieprasījums: "oklch(0.7 0.15 130)",
  Piedāvājums: "oklch(0.75 0.15 90)",
  Līgums: "oklch(0.7 0.15 60)",
  Pabeigts: "oklch(0.65 0.2 145)",
  Atlikts: "oklch(0.7 0.1 50)",
  Atcelts: "oklch(0.65 0.2 25)",
  Nekvalificējas: "oklch(0.55 0.12 350)",
};

const FALLBACK_PALETTE = [
  "oklch(0.65 0.18 255)",
  "oklch(0.7 0.15 160)",
  "oklch(0.75 0.15 90)",
  "oklch(0.65 0.2 25)",
  "oklch(0.55 0.12 350)",
  "oklch(0.7 0.15 200)",
];

function colorFor(status: string, idx: number): string {
  return STATUS_COLORS[status] ?? FALLBACK_PALETTE[idx % FALLBACK_PALETTE.length];
}

export function LeadStatusByDay({ search }: { search: FiltersSearch }) {
  const { from, to } = useMemo(() => resolveDateRange(search), [search]);

  const query = useMemo(() => {
    const parts: string[] = [
      "select=lead_created_date,status",
      "order=lead_created_date.asc.nullslast",
      "limit=5000",
    ];
    if (from) parts.push(`lead_created_date=gte.${from}`);
    if (to) parts.push(`lead_created_date=lte.${to}`);
    if (search.countries.length > 0)
      parts.push(
        `country=in.(${search.countries.map(encodeURIComponent).join(",")})`,
      );
    if (search.sources.length > 0)
      parts.push(
        `source=in.(${search.sources.map(encodeURIComponent).join(",")})`,
      );
    if (search.owners.length > 0)
      parts.push(
        `owner=in.(${search.owners.map(encodeURIComponent).join(",")})`,
      );
    if (search.ppvs.length > 0)
      parts.push(
        `ppv_vards=in.(${search.ppvs.map(encodeURIComponent).join(",")})`,
      );
    return parts.join("&");
  }, [from, to, search.countries, search.sources, search.owners, search.ppvs]);

  const { data, isLoading, error } = useAnalyticsView("leads_overview", query);

  const { chartData, statuses } = useMemo(() => {
    const rows = (data?.rows ?? []) as Array<Record<string, unknown>>;
    const byDate = new Map<string, Record<string, number>>();
    const statusSet = new Set<string>();

    for (const r of rows) {
      const date = r.lead_created_date ? String(r.lead_created_date) : null;
      if (!date) continue;
      const status = r.status ? String(r.status) : "—";
      statusSet.add(status);
      const bucket = byDate.get(date) ?? {};
      bucket[status] = (bucket[status] ?? 0) + 1;
      byDate.set(date, bucket);
    }

    const statuses = Array.from(statusSet).sort();
    const chartData = Array.from(byDate.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, counts]) => {
        const row: Record<string, string | number> = { date };
        for (const s of statuses) row[s] = counts[s] ?? 0;
        return row;
      });

    return { chartData, statuses };
  }, [data]);

  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <h2 className="mb-1 text-sm font-semibold text-foreground">
        Leadu statusi pa dienām
      </h2>
      <p className="mb-4 text-xs text-muted-foreground">
        Kā mainās leadu statusi laikā (pēc izveides datuma).
      </p>

      {error ? (
        <ErrorState message={String(error)} />
      ) : isLoading ? (
        <LoadingState />
      ) : chartData.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="hsl(var(--border))"
                opacity={0.4}
              />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11 }}
                stroke="hsl(var(--muted-foreground))"
              />
              <YAxis
                tick={{ fontSize: 11 }}
                stroke="hsl(var(--muted-foreground))"
              />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {statuses.map((status, idx) => (
                <Bar
                  key={status}
                  dataKey={status}
                  stackId="status"
                  name={status}
                  fill={colorFor(status, idx)}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}