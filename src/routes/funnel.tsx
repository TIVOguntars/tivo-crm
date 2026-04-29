import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";

import { PageHeader } from "@/components/PageHeader";
import { LoadingState, ErrorState, EmptyState } from "@/components/DataState";
import { useAnalyticsRpc } from "@/hooks/useAnalyticsRpc";
import { buildAnalyticsFilters } from "@/lib/filters";

export const Route = createFileRoute("/funnel")({
  component: FunnelPage,
});

function num(v: unknown): number {
  const n = typeof v === "string" ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : 0;
}

const MAIN_STAGES = [
  "Jauns",
  "Nesasniedzams",
  "Piesaistīšana",
  "Kvalificēts",
  "Pieprasījums",
  "Piedāvājums",
  "Līgums",
  "Pabeigts",
  "Atlikts",
  "Atcelts",
  "Nekvalificējas",
];

function fmt(n: number): string {
  return new Intl.NumberFormat("lv-LV").format(n);
}

type Stage = { stage: string; count: number; order: number };

function DistributionList({
  stages,
  total,
}: {
  stages: Stage[];
  total: number;
}) {
  return (
    <div className="space-y-2">
      {stages.map((s, i) => {
        const sharePct = total > 0 ? (s.count / total) * 100 : 0;
        const sharePctText = sharePct.toFixed(1);
        return (
          <div
            key={`${s.stage}-${i}`}
            className="rounded-md border border-border/60 bg-background p-3"
          >
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="font-medium text-foreground">{s.stage}</span>
              <span className="tabular-nums text-muted-foreground">
                {fmt(s.count)}
                <span className="ml-2 text-xs">({sharePctText}%)</span>
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-primary/70 transition-all"
                style={{ width: `${Math.max(sharePct, 1.5)}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function FunnelPage() {
  const search = Route.useSearch();
  const filters = useMemo(() => buildAnalyticsFilters(search), [search]);
  const { data, isLoading, error } = useAnalyticsRpc(
    "get_acquisition_funnel",
    filters,
  );

  const stages = useMemo(() => {
    const rows = data?.rows ?? [];
    const mapped: Stage[] = rows.map((r) => ({
      stage: String(r.status ?? "—"),
      count: num(r.lead_count),
      order: num(r.status_order),
    }));
    const knownOrder = new Map(MAIN_STAGES.map((n, i) => [n, i]));
    const merged = new Map<string, Stage>();
    MAIN_STAGES.forEach((name, i) => {
      merged.set(name, { stage: name, count: 0, order: i });
    });
    mapped.forEach((s) => {
      merged.set(s.stage, {
        stage: s.stage,
        count: s.count,
        order: s.order || knownOrder.get(s.stage) || 999,
      });
    });
    return Array.from(merged.values()).sort((a, b) => a.order - b.order);
  }, [data]);

  const total = stages.reduce((acc, s) => acc + s.count, 0);
  const errorMsg = (error as Error | null)?.message || data?.error;
  const hasData = (data?.rows?.length ?? 0) > 0;
  const max = Math.max(1, total, ...stages.map((s) => s.count));

  return (
    <>
      <PageHeader
        title="Funnel"
        description="Konversijas piltuves posmi un to attiecības."
      />

      {errorMsg && <ErrorState message={errorMsg} />}
      {!errorMsg && isLoading && <LoadingState />}
      {!errorMsg && !isLoading && !hasData && <EmptyState />}
      {!errorMsg && !isLoading && hasData && (
        <section className="rounded-lg border border-border bg-card p-4 shadow-sm sm:p-6">
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-foreground">
              Statusu sadalījums (nav lineārs funnel)
            </h2>
            <p className="text-xs text-muted-foreground">
              Šis skats rāda visus izvēlētajā periodā ienākušos leadus un to pašreizējo statusu. Tas nav secīgs konversijas funnel.
            </p>
          </div>
          <div className="mb-4 flex items-center justify-between rounded-md border border-border bg-secondary/40 px-3 py-2 text-sm">
            <span className="font-medium text-foreground">Ienākuši periodā</span>
            <span className="tabular-nums text-foreground">
              {fmt(total)} <span className="ml-2 text-xs text-muted-foreground">(100%)</span>
            </span>
          </div>
          <DistributionList stages={stages} total={total} />
        </section>
      )}
    </>
  );
}
