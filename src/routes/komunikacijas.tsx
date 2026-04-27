import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";

import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { LoadingState, ErrorState, EmptyState } from "@/components/DataState";
import { useAnalyticsView } from "@/hooks/useAnalyticsView";

export const Route = createFileRoute("/komunikacijas")({
  component: KomunikācijasPage,
});

function num(v: unknown): number {
  const n = typeof v === "string" ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function fmt(n: number): string {
  return new Intl.NumberFormat("lv-LV").format(n);
}

function KomunikācijasPage() {
  const engagement = useAnalyticsView("lead_engagement_summary");
  const channels = useAnalyticsView("channel_performance_summary");

  const totals = useMemo(() => {
    const rows = engagement.data?.rows ?? [];
    const sent = rows.reduce(
      (acc, r) => acc + num(r.messages_sent ?? r.sent ?? r.total_sent ?? 0),
      0,
    );
    const received = rows.reduce(
      (acc, r) =>
        acc + num(r.messages_received ?? r.received ?? r.replies ?? 0),
      0,
    );
    const engaged = rows.filter(
      (r) => num(r.engagement_score ?? r.score ?? r.engaged ?? 0) > 0,
    ).length;
    return { sent, received, engaged, totalLeads: rows.length };
  }, [engagement.data]);

  const errorMsg =
    (engagement.error as Error | null)?.message ||
    engagement.data?.error ||
    channels.data?.error;
  const loading = engagement.isLoading || channels.isLoading;

  const channelRows = channels.data?.rows ?? [];

  return (
    <>
      <PageHeader
        title="Komunikācijas"
        description="Komunikāciju aktivitātes un kanālu rezultāti."
      />

      {errorMsg && <ErrorState message={errorMsg} />}
      {!errorMsg && loading && <LoadingState />}

      {!errorMsg && !loading && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <StatCard label="Nosūtīti" value={fmt(totals.sent)} />
            <StatCard label="Saņemti" value={fmt(totals.received)} />
            <StatCard label="Aktīvi leadi" value={fmt(totals.engaged)} />
            <StatCard
              label="Atbildes likme"
              value={
                totals.sent > 0
                  ? `${((totals.received / totals.sent) * 100).toFixed(1)}%`
                  : "—"
              }
            />
          </div>

          <div className="mt-6 rounded-lg border border-border bg-card shadow-sm">
            <div className="border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold text-foreground">
                Kanāli
              </h2>
            </div>
            {channelRows.length === 0 ? (
              <div className="p-4">
                <EmptyState />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                    <tr>
                      {Object.keys(channelRows[0]).map((k) => (
                        <th
                          key={k}
                          className="px-4 py-2 text-left font-medium tracking-wide"
                        >
                          {k}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {channelRows.map((row, i) => (
                      <tr
                        key={i}
                        className="border-t border-border hover:bg-secondary/30"
                      >
                        {Object.values(row).map((v, j) => (
                          <td
                            key={j}
                            className="px-4 py-2 tabular-nums text-foreground"
                          >
                            {v == null ? "—" : String(v)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}