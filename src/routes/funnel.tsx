import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";

import { PageHeader } from "@/components/PageHeader";
import { LoadingState, ErrorState, EmptyState } from "@/components/DataState";
import { useAnalyticsView } from "@/hooks/useAnalyticsView";

export const Route = createFileRoute("/funnel")({
  component: FunnelPage,
});

function num(v: unknown): number {
  const n = typeof v === "string" ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function FunnelPage() {
  const { data, isLoading, error } = useAnalyticsView("funnel_summary");

  const stages = useMemo(() => {
    const rows = data?.rows ?? [];
    const mapped = rows.map((r) => ({
      stage: String(r.status ?? "—"),
      count: num(r.lead_count),
      order: num(r.status_order),
    }));
    mapped.sort((a, b) => a.order - b.order);
    return mapped;
  }, [data]);

  const max = Math.max(1, ...stages.map((s) => s.count));
  const errorMsg = (error as Error | null)?.message || data?.error;

  return (
    <>
      <PageHeader
        title="Funnel"
        description="Konversijas piltuves posmi un to attiecības."
      />

      {errorMsg && <ErrorState message={errorMsg} />}
      {!errorMsg && isLoading && <LoadingState />}

      {!errorMsg && !isLoading && (
        stages.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="rounded-lg border border-border bg-card p-4 shadow-sm sm:p-6">
            <div className="space-y-3">
              {stages.map((s, i) => {
                const pct = (s.count / max) * 100;
                return (
                  <div key={`${s.stage}-${i}`}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="font-medium text-foreground">{s.stage}</span>
                      <span className="tabular-nums text-muted-foreground">
                        {new Intl.NumberFormat("lv-LV").format(s.count)}
                      </span>
                    </div>
                    <div className="h-3 overflow-hidden rounded-full bg-secondary">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${Math.max(pct, 2)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )
      )}
    </>
  );
}