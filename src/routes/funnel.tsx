import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";

import { PageHeader } from "@/components/PageHeader";
import { LoadingState, ErrorState, EmptyState } from "@/components/DataState";
import { useAnalyticsRpc } from "@/hooks/useAnalyticsRpc";
import { buildAnalyticsFilters } from "@/lib/filters";
import { ReachabilityBreakdown } from "@/components/ReachabilityBreakdown";
import { UnreachableBreakdown } from "@/components/UnreachableBreakdown";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
  const activeQuery = useAnalyticsRpc("get_funnel", filters);
  const acquisitionQuery = useAnalyticsRpc("get_acquisition_funnel", filters);

  const { mainStages, reach, total } = useMemo(() => {
    const rows = activeQuery.data?.rows ?? [];
    const mapped: Stage[] = rows.map((r) => ({
      stage: String(r.status ?? "—"),
      count: num(r.lead_count),
      order: num(r.status_order),
    }));

    const total = mapped.reduce((acc, s) => acc + s.count, 0);

    const byName = new Map(mapped.map((s) => [s.stage, s]));
    // Show all statuses returned by the RPC, ordered by status_order.
    // Include known statuses even when missing (count 0) so layout stays stable.
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
    const main = Array.from(merged.values()).sort((a, b) => a.order - b.order);

    const get = (name: string) => byName.get(name)?.count ?? 0;
    const newCount = get("Jauns");
    const notReached = get("Nesasniedzams");
    const reached = REACHED_STAGES.reduce((acc, n) => acc + get(n), 0);
    const pool = reached + notReached + newCount;

    return {
      mainStages: main,
      reach: { newCount, notReached, reached, pool },
      total,
    };
  }, [activeQuery.data]);

  const acquisitionStages = useMemo(() => {
    const rows = acquisitionQuery.data?.rows ?? [];
    const mapped: Stage[] = rows.map((r) => ({
      stage: String(r.status ?? "—"),
      count: num(r.lead_count),
      order: num(r.status_order),
    }));
    const knownOrder = new Map(MAIN_STAGES.map((n, i) => [n, i]));
    return mapped.sort(
      (a, b) =>
        (a.order || knownOrder.get(a.stage) || 999) -
        (b.order || knownOrder.get(b.stage) || 999),
    );
  }, [acquisitionQuery.data]);

  const acquisitionTotal = acquisitionStages.reduce((acc, s) => acc + s.count, 0);

  const activeError =
    (activeQuery.error as Error | null)?.message || activeQuery.data?.error;
  const acquisitionError =
    (acquisitionQuery.error as Error | null)?.message ||
    acquisitionQuery.data?.error;
  const hasActive = (activeQuery.data?.rows?.length ?? 0) > 0;
  const hasAcquisition = (acquisitionQuery.data?.rows?.length ?? 0) > 0;
  const mainMax = Math.max(1, ...mainStages.map((s) => s.count));
  const acqMax = Math.max(1, ...acquisitionStages.map((s) => s.count));

  const pct = (n: number) =>
    reach.pool > 0 ? ((n / reach.pool) * 100).toFixed(1) : "0.0";

  return (
    <>
      <PageHeader
        title="Funnel"
        description="Konversijas piltuves posmi un to attiecības."
      />

      <Tabs defaultValue="active" className="space-y-6">
        <TabsList>
          <TabsTrigger value="active">Aktīvie leadi</TabsTrigger>
          <TabsTrigger value="acquisition">Jaunie leadi</TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="space-y-6">
          {activeError && <ErrorState message={activeError} />}
          {!activeError && activeQuery.isLoading && <LoadingState />}
          {!activeError && !activeQuery.isLoading && !hasActive && <EmptyState />}
          {!activeError && !activeQuery.isLoading && hasActive && (
            <>
              <section className="rounded-lg border border-border bg-card p-4 shadow-sm sm:p-6">
                <div className="mb-4">
                  <h2 className="text-sm font-semibold text-foreground">
                    Statusu sadalījums aktīvajiem leadiem
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Šis skats rāda leadus, kuriem izvēlētajā periodā bija komunikācijas aktivitāte. Kopā {fmt(total)} leadi.
                  </p>
                </div>
                <StageList stages={mainStages} total={total} max={mainMax} />
              </section>

            </>
          )}
        </TabsContent>

        <TabsContent value="acquisition" className="space-y-6">
          {acquisitionError && <ErrorState message={acquisitionError} />}
          {!acquisitionError && acquisitionQuery.isLoading && <LoadingState />}
          {!acquisitionError && !acquisitionQuery.isLoading && !hasAcquisition && (
            <EmptyState />
          )}
          {!acquisitionError && !acquisitionQuery.isLoading && hasAcquisition && (
            <>
              <section className="rounded-lg border border-border bg-card p-4 shadow-sm sm:p-6">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Jauni leadi periodā
                </p>
                <p className="mt-2 text-3xl font-semibold tabular-nums text-foreground">
                  {fmt(acquisitionTotal)}
                </p>
              </section>

              <section className="rounded-lg border border-border bg-card p-4 shadow-sm sm:p-6">
                <div className="mb-4">
                  <h2 className="text-sm font-semibold text-foreground">
                    Jauno leadu rezultāts
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Šis skats rāda leadus, kas ienākuši izvēlētajā periodā, un kāds ir to pašreizējais statuss.
                  </p>
                </div>
                <StageList
                  stages={acquisitionStages}
                  total={acquisitionTotal}
                  max={acqMax}
                />
              </section>
            </>
          )}
        </TabsContent>
      </Tabs>

      <section className="rounded-lg border border-border bg-card p-4 shadow-sm sm:p-6">
        <div className="mb-4">
          <h2 className="text-sm font-semibold text-foreground">
            Sasniedzamība
          </h2>
          <p className="text-xs text-muted-foreground">
            Kontaktu bāze: {fmt(reach.pool)} (Jauns + sasniegti + nesasniedzami)
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <ReachCard
            label="Sasniegti"
            count={reach.reached}
            percent={pct(reach.reached)}
            hint="Piesaistīšana → Līgums"
            tone="success"
          />
          <ReachCard
            label="Nesasniedzami"
            count={reach.notReached}
            percent={pct(reach.notReached)}
            hint="Status: Nesasniedzams"
            tone="danger"
          />
          <ReachCard
            label="Jauni bez rezultāta"
            count={reach.newCount}
            percent={pct(reach.newCount)}
            hint="Status: Jauns"
            tone="muted"
          />
        </div>
      </section>

      <ReachabilityBreakdown search={search} />

      <UnreachableBreakdown search={search} />
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
