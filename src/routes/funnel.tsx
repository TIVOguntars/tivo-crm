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
  "Piesaistīšana",
  "Kvalificēts",
  "Pieprasījums",
  "Piedāvājums",
  "Līgums",
];
const REACHED_STAGES = [
  "Piesaistīšana",
  "Kvalificēts",
  "Pieprasījums",
  "Piedāvājums",
  "Līgums",
];

function fmt(n: number): string {
  return new Intl.NumberFormat("lv-LV").format(n);
}

type Stage = { stage: string; count: number; order: number };

function StageList({
  stages,
  total,
  max,
}: {
  stages: Stage[];
  total: number;
  max: number;
}) {
  return (
    <div className="space-y-3">
      {stages.map((s, i) => {
        const barPct = max > 0 ? (s.count / max) * 100 : 0;
        const sharePct =
          total > 0 ? ((s.count / total) * 100).toFixed(1) : null;
        return (
          <div key={`${s.stage}-${i}`}>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="font-medium text-foreground">{s.stage}</span>
              <span className="tabular-nums text-muted-foreground">
                {fmt(s.count)}
                {sharePct && (
                  <span className="ml-2 text-xs">({sharePct}% no kopā)</span>
                )}
              </span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${Math.max(barPct, 2)}%` }}
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
  const { data, isLoading, error } = useAnalyticsRpc("get_funnel", filters);

  const { mainStages, outcomeStages, total } = useMemo(() => {
    const rows = data?.rows ?? [];
    const mapped: Stage[] = rows.map((r) => ({
      stage: String(r.status ?? "—"),
      count: num(r.lead_count),
      order: num(r.status_order),
    }));

    const total = mapped.reduce((acc, s) => acc + s.count, 0);

    const byName = new Map(mapped.map((s) => [s.stage, s]));
    const main = MAIN_STAGES.map(
      (name, i) => byName.get(name) ?? { stage: name, count: 0, order: i },
    );
    const outcomes = OUTCOME_STAGES.map(
      (name, i) => byName.get(name) ?? { stage: name, count: 0, order: i },
    );

    return { mainStages: main, outcomeStages: outcomes, total };
  }, [data]);

  const errorMsg = (error as Error | null)?.message || data?.error;
  const hasData = (data?.rows?.length ?? 0) > 0;
  const mainMax = Math.max(1, ...mainStages.map((s) => s.count));
  const outcomeMax = Math.max(1, ...outcomeStages.map((s) => s.count));

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
        <div className="space-y-6">
          <section className="rounded-lg border border-border bg-card p-4 shadow-sm sm:p-6">
            <div className="mb-4">
              <h2 className="text-sm font-semibold text-foreground">
                Galvenā piltuve
              </h2>
              <p className="text-xs text-muted-foreground">
                Procesa posmi · kopā {fmt(total)} leadi
              </p>
            </div>
            <StageList stages={mainStages} total={total} max={mainMax} />
          </section>

          <section className="rounded-lg border border-border bg-card p-4 shadow-sm sm:p-6">
            <div className="mb-4">
              <h2 className="text-sm font-semibold text-foreground">
                Iznākumi
              </h2>
              <p className="text-xs text-muted-foreground">
                Noslēgtie statusi
              </p>
            </div>
            <StageList
              stages={outcomeStages}
              total={total}
              max={outcomeMax}
            />
          </section>
        </div>
      )}
    </>
  );
}
