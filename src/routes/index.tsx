import { lazy, Suspense } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";

import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { LoadingState, ErrorState } from "@/components/DataState";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAnalyticsView } from "@/hooks/useAnalyticsView";

const AnalyticsGrid = lazy(() => import("@/components/overview/AnalyticsGrid"));

export const Route = createFileRoute("/")({
  component: PārskatsPage,
});

// ---------- helpers ----------
function num(v: unknown): number {
  const n = typeof v === "string" ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : 0;
}
const fmt = (n: number) => new Intl.NumberFormat("lv-LV").format(n);
const pct = (n: number) => `${num(n).toFixed(1)}%`;

type Row = Record<string, unknown>;

// ---------- page ----------
function PārskatsPage() {
  const kpiQ = useAnalyticsView("dashboard_kpi_overview");
  const funnelQ = useAnalyticsView("funnel_summary", "order=leadu_skaits.desc");
  const ppvQ = useAnalyticsView("ppv_performance", "order=aktivie_leadi.desc");
  const countryQ = useAnalyticsView("country_distribution", "order=leadu_skaits.desc");
  const dqQ = useAnalyticsView("data_quality");
  const workflowQ = useAnalyticsView("workflow_health", "order=kopa.desc");
  const qc = useQueryClient();

  const kpi = (kpiQ.data?.rows?.[0] ?? {}) as Row;
  const funnel = (funnelQ.data?.rows ?? []) as Row[];
  const ppv = (ppvQ.data?.rows ?? []) as Row[];
  const country = (countryQ.data?.rows ?? []) as Row[];
  const dq = (dqQ.data?.rows?.[0] ?? {}) as Row;
  const workflow = (workflowQ.data?.rows ?? []) as Row[];

  const queries = [kpiQ, funnelQ, ppvQ, countryQ, dqQ, workflowQ];
  const error =
    (kpiQ.data?.error as string | null) ||
    (funnelQ.data?.error as string | null) ||
    (kpiQ.error as Error | null)?.message ||
    null;
  const loading = queries.some((q) => q.isLoading);
  const refreshing = queries.some((q) => q.isFetching);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["analytics"] });
  };

  const totalLeads = num(kpi.kopa_leadi);
  const wfTotal = workflow.reduce((s, r) => s + num(r.kopa), 0);
  const wfErrors = workflow.reduce((s, r) => s + num(r.kludas), 0);
  const wfActive = workflow.reduce((s, r) => s + num(r.aktivi), 0);

  return (
    <>
      <PageHeader
        title="Pārskats"
        description="Operatīvais kontroles centrs — leadi, konversijas, komandas slodze un komunikācija."
      >
        <Button
          variant="outline"
          size="sm"
          onClick={refresh}
          disabled={refreshing}
          className="gap-2"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
          Atjaunot
        </Button>
      </PageHeader>

      {error && <ErrorState message={error} />}
      {!error && loading && <LoadingState />}

      {!error && !loading && (
        <div className="space-y-8">
          {/* 2. Primary KPIs */}
          <Section label="Galvenie rādītāji">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard
                label="Kopā leadi"
                value={fmt(totalLeads)}
                hint={`Kvalificēti: ${fmt(num(kpi.kvalificeti))}`}
              />
              <StatCard
                label="Kvalificēti"
                value={fmt(num(kpi.kvalificeti))}
                hint={pct(num(kpi.kvalifikacijas_pct))}
              />
              <StatCard
                label="Iegūti"
                value={fmt(num(kpi.ieguti))}
                hint={`${pct(num(kpi.iegusanas_pct))} no kopējā`}
              />
              <StatCard
                label="Sasniedzamība"
                value={pct(num(kpi.sasniedzamiba_pct))}
                hint={`Ar e-pastu: ${pct(num(dq.ar_epastu_pct))}`}
              />
            </div>
          </Section>

          {/* 3. Operational KPIs */}
          {wfTotal > 0 && (
            <Section label="Workflow stāvoklis">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <CompactStat label="Workflow kopā" value={fmt(wfTotal)} />
                <CompactStat label="Aktīvi" value={fmt(wfActive)} />
                <CompactStat label="Pabeigti" value={fmt(wfTotal - wfActive - wfErrors)} />
                <CompactStat
                  label="Kļūdas"
                  value={fmt(wfErrors)}
                  hint={wfErrors > 0 ? "Nepieciešama uzmanība" : "Nav kļūdu"}
                />
              </div>
            </Section>
          )}

          {/* 4. Analytics grid (lazy) */}
          <Section label="Analītika">
            <Suspense fallback={<AnalyticsSkeleton />}>
              <AnalyticsGrid
                funnel={funnel}
                ppv={ppv}
                country={country}
                workflow={workflow}
                totalLeads={totalLeads}
              />
            </Suspense>
          </Section>

          {/* 5. Data quality */}
          <Section label="Datu kvalitāte">
            <Suspense fallback={<AnalyticsSkeleton rows={1} />}>
              <DataQualityCard dq={dq} kpi={kpi} />
            </Suspense>
          </Section>
        </div>
      )}
    </>
  );
}

// ---------- compact card ----------
function CompactStat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground line-clamp-1">
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">
        {value}
      </p>
      {hint && (
        <p className="mt-0.5 text-[11px] text-muted-foreground line-clamp-1">
          {hint}
        </p>
      )}
    </div>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </h2>
      {children}
    </section>
  );
}

function AnalyticsSkeleton({ rows = 2 }: { rows?: number }) {
  return (
    <div className={cn("grid grid-cols-1 gap-4", rows > 1 && "lg:grid-cols-2")}>
      {Array.from({ length: rows * 2 }).map((_, i) => (
        <Skeleton key={i} className="h-64 w-full rounded-xl" />
      ))}
    </div>
  );
}

// ---------- Data quality card ----------
function DataQualityCard({
  dq,
  kpi,
}: {
  dq: Record<string, unknown>;
  kpi: Record<string, unknown>;
}) {
  const total = num(dq.kopa_leadi) || num(kpi.kopa_leadi);

  const bars = [
    { label: "Ar e-pastu", value: num(dq.ar_epastu_pct) },
    { label: "Ar telefonu", value: num(dq.ar_talruni_pct) },
    { label: "Validēti telefoni", value: num(dq.valideti_talruni_pct) },
    { label: "Sasniedzamība", value: num(kpi.sasniedzamiba_pct) },
  ];

  const issues = [
    { label: "Bez e-pasta", value: num(dq.bez_epasta_pct) },
    { label: "Bez telefona", value: num(dq.bez_talruna_pct) },
    { label: "Stacionārie", value: num(dq.landline_pct) },
  ].filter((i) => i.value > 0);

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ul className="space-y-2.5">
          {bars.map((b) => (
            <li key={b.label}>
              <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                <span className="text-foreground">{b.label}</span>
                <span className="tabular-nums text-muted-foreground">
                  {b.value.toFixed(1)}%
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-primary/70"
                  style={{ width: `${Math.min(100, b.value)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            Kopā leadi sistēmā: <span className="font-medium text-foreground tabular-nums">{fmt(total)}</span>
          </p>
          {issues.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {issues.map((i) => (
                <span
                  key={i.label}
                  className="inline-flex items-center gap-2 rounded-full border border-border bg-secondary/50 px-2.5 py-1 text-xs text-foreground"
                >
                  {i.label}
                  <span className="tabular-nums font-medium">{i.value.toFixed(1)}%</span>
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Nav atklātu datu trūkumu.</p>
          )}
        </div>
      </div>
    </div>
  );
}
