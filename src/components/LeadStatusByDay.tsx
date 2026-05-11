import { useMemo, useState } from "react";
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

import { useAnalyticsRpc } from "@/hooks/useAnalyticsRpc";
import { LoadingState, ErrorState, EmptyState } from "@/components/DataState";
import type { FiltersSearch } from "@/lib/filters";
import { buildAnalyticsFilters } from "@/lib/filters";

const MAIN_STATUSES = [
  "Jauns",
  "Piesaistīšana",
  "Kvalificēts",
  "Pieprasījums",
  "Piedāvājums",
  "Līgums",
] as const;

type Mode = "main" | "all";

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
  const filters = useMemo(() => buildAnalyticsFilters(search), [search]);
  // TODO: migrate this analytics page to analytics.get_dashboard_kpis()
  const { data, isLoading, error } = useAnalyticsRpc(
    "get_status_changes_daily",
    filters,
  );
  const [mode, setMode] = useState<Mode>("main");

  const { chartData, statuses } = useMemo(() => {
    // RPC returns an array of { date, status, lead_count }. Be tolerant if
    // the response is wrapped (e.g. [{ data: [...] }] or { data: [...] }).
    let rows = (data?.rows ?? []) as Array<Record<string, unknown>>;
    if (
      rows.length === 1 &&
      rows[0] &&
      typeof rows[0] === "object" &&
      Array.isArray((rows[0] as Record<string, unknown>).data)
    ) {
      rows = (rows[0] as { data: Array<Record<string, unknown>> }).data;
    }

    const byDate = new Map<string, Record<string, number>>();
    const statusSet = new Set<string>();

    for (const r of rows) {
      const rawDate = r.date ?? r.day ?? r.bucket ?? null;
      if (!rawDate) continue;
      // Normalize to YYYY-MM-DD (handles ISO timestamps too).
      const date = String(rawDate).slice(0, 10);
      const status = r.status ? String(r.status) : "—";
      const count = Number(r.lead_count ?? r.count ?? 0);
      statusSet.add(status);
      const bucket = byDate.get(date) ?? {};
      bucket[status] = (bucket[status] ?? 0) + (Number.isFinite(count) ? count : 0);
      byDate.set(date, bucket);
    }

    const statuses =
      mode === "main"
        ? MAIN_STATUSES.filter((s) => statusSet.has(s))
        : Array.from(statusSet);
    const chartData = Array.from(byDate.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, counts]) => {
        const row: Record<string, string | number> = { date };
        for (const s of statuses) row[s] = counts[s] ?? 0;
        return row;
      })
      .filter((row) => statuses.some((s) => Number(row[s]) > 0));

    return { chartData, statuses };
  }, [data, mode]);

  const apiError = data?.error ?? null;

  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            Leadu statusi pa dienām
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Statusu izmaiņas laikā (pēc statusa maiņas datuma).
          </p>
        </div>
        <div className="inline-flex rounded-md border border-border bg-muted p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setMode("main")}
            className={`rounded px-3 py-1 transition-colors ${
              mode === "main"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Galvenie statusi
          </button>
          <button
            type="button"
            onClick={() => setMode("all")}
            className={`rounded px-3 py-1 transition-colors ${
              mode === "all"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Visi statusi
          </button>
        </div>
      </div>

      {error || apiError ? (
        <ErrorState message={String(apiError ?? error)} />
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