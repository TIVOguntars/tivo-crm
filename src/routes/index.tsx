import { createFileRoute, redirect } from "@tanstack/react-router";
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

import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { LoadingState, ErrorState, EmptyState } from "@/components/DataState";
import { useAnalyticsRpc } from "@/hooks/useAnalyticsRpc";
import { buildAnalyticsFilters } from "@/lib/filters";
import { LeadStatusByDay } from "@/components/LeadStatusByDay";
import { ChannelSummaryTable } from "@/components/ChannelSummaryTable";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/queue" });
  },
  component: PārskatsPage,
});

function num(v: unknown): number {
  const n = typeof v === "string" ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function fmt(n: number): string {
  return new Intl.NumberFormat("lv-LV").format(n);
}

function PārskatsPage() {
  const search = Route.useSearch();
  const filters = useMemo(() => buildAnalyticsFilters(search), [search]);

  const kpi = useAnalyticsRpc("get_kpi_summary", filters);
  const daily = useAnalyticsRpc("get_daily_activity", filters);
  const channels = useAnalyticsRpc("get_channel_summary", filters);

  const kpiRow = (kpi.data?.rows ?? [])[0] ?? {};

  const channelTotals = useMemo(() => {
    const rows = (channels.data?.rows ?? []) as Array<Record<string, unknown>>;
    const init = { verified: 0, unverified: 0, delivered: 0, failed: 0, engagement: 0, reply: 0 };
    return rows.reduce<typeof init>(
      (acc, r) => ({
        verified: acc.verified + num(r.verified_outbound_count),
        unverified: acc.unverified + num(r.unverified_outbound_count),
        delivered: acc.delivered + num(r.delivered_count),
        failed: acc.failed + num(r.failed_count),
        engagement: acc.engagement + num(r.engagement_count),
        reply: acc.reply + num(r.reply_count),
      }),
      init,
    );
  }, [channels.data]);

  const dailyChart = useMemo(() => {
    const rows = daily.data?.rows ?? [];
    return [...rows]
      .map((r) => ({
        date: String(r.date ?? ""),
        outbound: num(r.outbound_count),
        reply: num(r.reply_count),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [daily.data]);

  const error = kpi.data?.error || daily.data?.error || channels.data?.error;
  const loading = kpi.isLoading || daily.isLoading || channels.isLoading;

  return (
    <>
      <PageHeader
        title="Pārskats"
        description="Kopējais analītikas pārskats par leadiem, kanāliem un konversijām."
      />

      {error && <ErrorState message={error} />}
      {!error && loading && <LoadingState />}

      {!error && !loading && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
            <StatCard label="Kopā leadi" value={fmt(num(kpiRow.total_leads))} />
            <StatCard
              label="Nosūtīti (verificēti)"
              value={fmt(channelTotals.verified)}
            />
            <StatCard label="Piegādāti" value={fmt(channelTotals.delivered)} />
            <StatCard label="Klikšķi" value={fmt(channelTotals.engagement)} />
            <StatCard
              label="Atbildējuši"
              value={fmt(channelTotals.reply)}
              hint="Unikāli leadi"
            />
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4">
            <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
              <h2 className="mb-4 text-sm font-semibold text-foreground">
                Aktivitāte pa dienām
              </h2>
              {dailyChart.length === 0 ? (
                <EmptyState />
              ) : (
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={dailyChart}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                      <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                      <Tooltip
                        contentStyle={{
                          background: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: 8,
                          fontSize: 12,
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Line
                        type="monotone"
                        dataKey="outbound"
                        name="Nosūtīti"
                        stroke="oklch(0.55 0.18 255)"
                        strokeWidth={2}
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="reply"
                        name="Atbildes"
                        stroke="oklch(0.6 0.118 184.704)"
                        strokeWidth={2}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>

          <div className="mt-4">
            <ChannelSummaryTable search={search} />
          </div>

          <div className="mt-4">
            <LeadStatusByDay search={search} />
          </div>
        </>
      )}
    </>
  );
}
