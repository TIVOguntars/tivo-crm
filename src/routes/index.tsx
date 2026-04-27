import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
  Legend,
} from "recharts";

import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { LoadingState, ErrorState, EmptyState } from "@/components/DataState";
import { useAnalyticsView } from "@/hooks/useAnalyticsView";

export const Route = createFileRoute("/")({
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
  const channels = useAnalyticsView("channel_performance_summary");
  const daily = useAnalyticsView(
    "channel_performance_daily",
    "order=date.desc&limit=90",
  );

  const stats = useMemo(() => {
    const rows = channels.data?.rows ?? [];
    return rows.reduce(
      (acc, r) => ({
        outbound: acc.outbound + num(r.outbound_count),
        delivered: acc.delivered + num(r.delivered_count),
        engagement: acc.engagement + num(r.engagement_count),
        reply: acc.reply + num(r.reply_count),
      }),
      { outbound: 0, delivered: 0, engagement: 0, reply: 0 },
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

  const channelChart = useMemo(() => {
    const rows = channels.data?.rows ?? [];
    return rows.map((r) => ({
      channel: String(r.channel ?? "—"),
      outbound: num(r.outbound_count),
      reply: num(r.reply_count),
    }));
  }, [channels.data]);

  const error =
    channels.data?.error ||
    daily.data?.error;

  const loading = channels.isLoading || daily.isLoading;

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
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <StatCard label="Kopā leadi" value={fmt(stats.outbound)} />
            <StatCard label="Piegādāti" value={fmt(stats.delivered)} />
            <StatCard label="Klikšķi" value={fmt(stats.engagement)} />
            <StatCard label="Atbildes" value={fmt(stats.reply)} />
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
              <h2 className="mb-4 text-sm font-semibold text-foreground">
                Leadi pa dienām
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

            <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
              <h2 className="mb-4 text-sm font-semibold text-foreground">
                Kanāli
              </h2>
              {channelChart.length === 0 ? (
                <EmptyState />
              ) : (
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={channelChart}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                      <XAxis dataKey="channel" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
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
                      <Bar dataKey="outbound" name="Nosūtīti" fill="oklch(0.55 0.18 255)" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="reply" name="Atbildes" fill="oklch(0.6 0.118 184.704)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
