import { useMemo } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
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

const STEP_COLORS: Record<string, string> = {
  "Jauns → Piesaistīšana": "oklch(0.65 0.18 255)",
  "Piesaistīšana → Pieprasījums": "oklch(0.7 0.15 160)",
  "Pieprasījums → Piedāvājums": "oklch(0.75 0.15 60)",
};

const FALLBACK = [
  "oklch(0.65 0.18 255)",
  "oklch(0.7 0.15 160)",
  "oklch(0.75 0.15 60)",
  "oklch(0.65 0.2 25)",
  "oklch(0.55 0.12 350)",
];

function colorFor(step: string, idx: number): string {
  return STEP_COLORS[step] ?? FALLBACK[idx % FALLBACK.length];
}

function toPercent(v: unknown): number {
  const n = typeof v === "string" ? parseFloat(v) : Number(v);
  if (!Number.isFinite(n)) return 0;
  // RPC may return 0–1 fraction or 0–100 already; normalize to %.
  return n <= 1 ? n * 100 : n;
}

export function FunnelConversionDaily({ search }: { search: FiltersSearch }) {
  const filters = useMemo(() => buildAnalyticsFilters(search), [search]);
  // TODO: migrate this analytics page to analytics.get_dashboard_kpis()
  const { data, isLoading, error } = useAnalyticsRpc(
    "get_funnel_conversion_daily",
    filters,
  );

  const { chartData, steps } = useMemo(() => {
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
    const stepSet = new Set<string>();

    for (const r of rows) {
      const rawDate = r.date ?? r.day ?? null;
      if (!rawDate) continue;
      const date = String(rawDate).slice(0, 10);
      const step = r.step ? String(r.step) : "—";
      const pct = toPercent(r.conversion_rate);
      stepSet.add(step);
      const bucket = byDate.get(date) ?? {};
      bucket[step] = pct;
      byDate.set(date, bucket);
    }

    const steps = Array.from(stepSet);
    const chartData = Array.from(byDate.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, vals]) => {
        const row: Record<string, string | number> = { date };
        for (const s of steps) row[s] = vals[s] ?? 0;
        return row;
      });

    return { chartData, steps };
  }, [data]);

  const apiError = data?.error ?? null;

  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <h2 className="mb-1 text-sm font-semibold text-foreground">
        Funnel conversion pa dienām
      </h2>
      <p className="mb-4 text-xs text-muted-foreground">
        Konversijas % starp piltuves soļiem laikā.
      </p>

      {error || apiError ? (
        <ErrorState message={String(apiError ?? error)} />
      ) : isLoading ? (
        <LoadingState />
      ) : chartData.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
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
                domain={[0, 100]}
                tickFormatter={(v) => `${Math.round(Number(v))}%`}
                tick={{ fontSize: 11 }}
                stroke="hsl(var(--muted-foreground))"
              />
              <Tooltip
                formatter={(v: number | string) =>
                  `${Number(v).toFixed(1)}%`
                }
                contentStyle={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {steps.map((step, idx) => (
                <Line
                  key={step}
                  type="monotone"
                  dataKey={step}
                  name={step}
                  stroke={colorFor(step, idx)}
                  strokeWidth={2}
                  dot={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}