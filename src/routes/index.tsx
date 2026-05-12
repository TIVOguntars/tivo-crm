import { lazy, Suspense, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";

import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { LoadingState, ErrorState } from "@/components/DataState";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  useDashboardSummary,
  useDashboardKpis,
} from "@/hooks/useAnalyticsRpc";

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

type Summary = {
  total_leads?: number;
  won_count?: number;
  reply_events?: number;
  click_events?: number;
  open_tasks_count?: number;
  high_priority_open_tasks_count?: number;
  active_or_pending_workflow_steps?: number;
  completed_workflow_steps?: number;
  reachable_rate_percent?: number;
  conversion_rate_percent?: number;
  complete_contact_data_percent?: number;
  missing_contact_count?: number;
};

type Kpis = {
  funnel?: Array<Record<string, unknown>>;
  conversion?: Array<Record<string, unknown>>;
  reachability?: Array<Record<string, unknown>>;
  data_quality?: Array<Record<string, unknown>>;
  team_workload?: Array<Record<string, unknown>>;
};

// ---------- page ----------
function PārskatsPage() {
  const summaryQ = useDashboardSummary();
  const kpisQ = useDashboardKpis();
  const qc = useQueryClient();

  const summary = (summaryQ.data ?? {}) as Summary;
  const kpis = (kpisQ.data ?? {}) as Kpis;

  const error =
    (summaryQ.error as Error | null)?.message ||
    (kpisQ.error as Error | null)?.message ||
    null;
  const loading = summaryQ.isLoading || kpisQ.isLoading;
  const refreshing =
    summaryQ.isFetching || kpisQ.isFetching;

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["dashboard-summary"] });
    qc.invalidateQueries({ queryKey: ["dashboard-kpis"] });
    qc.invalidateQueries({ queryKey: ["crm"] });
  };

  const conversion = (kpis.conversion?.[0] ?? {}) as Record<string, unknown>;
  const dataQuality = (kpis.data_quality?.[0] ?? {}) as Record<string, unknown>;
  const reach = (kpis.reachability?.[0] ?? {}) as Record<string, unknown>;

  const operational = useMemo(
    () => [
      {
        label: "Atvērti uzdevumi",
        value: fmt(num(summary.open_tasks_count)),
        hint: `Augsta: ${fmt(num(summary.high_priority_open_tasks_count))}`,
      },
      {
        label: "Plānotās komunikācijas",
        value: fmt(num(summary.active_or_pending_workflow_steps)),
        hint: "Workflow soļi",
      },
      {
        label: "Nosūtītās",
        value: fmt(num(summary.completed_workflow_steps)),
        hint: "Pabeigti soļi",
      },
      {
        label: "Atbildes",
        value: fmt(num(summary.reply_events)),
        hint: "Ienākošās",
      },
      {
        label: "Klikšķi",
        value: fmt(num(summary.click_events)),
        hint: "Saites",
      },
      {
        label: "Trūkst kontakti",
        value: fmt(num(summary.missing_contact_count)),
        hint: "Bez e-pasta vai telefona",
      },
    ],
    [summary],
  );

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
                value={fmt(num(summary.total_leads))}
                hint={`Kvalificēti+: ${fmt(num(conversion.qualified_or_later_count))}`}
              />
              <StatCard
                label="Piedāvājumi"
                value={fmt(num(conversion.offer_count))}
                hint={`Iegūti: ${fmt(num(summary.won_count))}`}
              />
              <StatCard
                label="Konversija"
                value={pct(num(summary.conversion_rate_percent))}
                hint="Lead → Iegūts"
              />
              <StatCard
                label="Sasniedzamība"
                value={pct(num(summary.reachable_rate_percent))}
                hint={`Pilni kontakti: ${pct(num(summary.complete_contact_data_percent))}`}
              />
            </div>
          </Section>

          {/* 3. Operational KPIs */}
          <Section label="Operatīvie rādītāji">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {operational.map((c) => (
                <CompactStat key={c.label} {...c} />
              ))}
            </div>
          </Section>

          {/* 4. Analytics grid (lazy) */}
          <Section label="Analītika">
            <Suspense fallback={<AnalyticsSkeleton />}>
              <AnalyticsGrid kpis={kpis} totalLeads={num(summary.total_leads)} />
            </Suspense>
          </Section>

          {/* 5. Data quality */}
          <Section label="Datu kvalitāte">
            <Suspense fallback={<AnalyticsSkeleton rows={1} />}>
              <DataQualityCard dq={dataQuality} reach={reach} />
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

// ---------- Data quality card (kept on main bundle for simplicity) ----------
function DataQualityCard({
  dq,
  reach,
}: {
  dq: Record<string, unknown>;
  reach: Record<string, unknown>;
}) {
  const total = num(dq.total_leads) || num(reach.total_leads);
  const completePct = num(dq.complete_contact_data_percent);
  const reachPct = num(reach.reachable_rate_percent);

  const bars = [
    { label: "Pilni kontakti", value: completePct },
    { label: "Sasniedzamība", value: reachPct },
    {
      label: "Ar e-pastu",
      value: total > 0 ? (num(reach.has_email_count) / total) * 100 : 0,
    },
    {
      label: "Ar telefonu",
      value: total > 0 ? (num(reach.has_phone_count) / total) * 100 : 0,
    },
    {
      label: "Validēts telefons",
      value: total > 0 ? (num(reach.validated_phone_count) / total) * 100 : 0,
    },
  ];

  const issues = [
    { label: "Trūkst e-pasts", value: num(dq.missing_email_count) },
    { label: "Trūkst telefons", value: num(dq.missing_phone_count) },
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
                  <span className="tabular-nums font-medium">{fmt(i.value)}</span>
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
