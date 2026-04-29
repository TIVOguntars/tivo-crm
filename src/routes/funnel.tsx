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
            <h2 className="text-sm font-semibold text-foreground">Funnel</h2>
            <p className="text-xs text-muted-foreground">
              Šis skats rāda leadus, kas ienākuši izvēlētajā periodā, un kāds ir to pašreizējais statuss.
            </p>
          </div>
          <StageList
            stages={[
              { stage: "Ienākuši periodā", count: total, order: -1 },
              ...stages,
            ]}
            total={total}
            max={max}
          />
        </section>
      )}
    </>
  );
}

function ReachCard({
  label,
  count,
  percent,
  hint,
  tone,
}: {
  label: string;
  count: number;
  percent: string;
  hint: string;
  tone: "success" | "danger" | "muted";
}) {
  const barClass =
    tone === "success"
      ? "bg-primary"
      : tone === "danger"
        ? "bg-destructive"
        : "bg-muted-foreground";
  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">
        {percent}%
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {fmt(count)} · {hint}
      </p>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-secondary">
        <div
          className={`h-full rounded-full ${barClass} transition-all`}
          style={{ width: `${Math.min(100, parseFloat(percent))}%` }}
        />
      </div>
    </div>
  );
}
