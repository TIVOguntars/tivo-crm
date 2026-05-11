import { createFileRoute } from "@tanstack/react-router";

import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { LoadingState, ErrorState, EmptyState } from "@/components/DataState";
import {
  useDashboardSummary,
  useDashboardKpis,
} from "@/hooks/useAnalyticsRpc";

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

function pct(n: number): string {
  return `${num(n).toFixed(1)}%`;
}

type SummaryShape = {
  total_leads?: number;
  won_count?: number;
  conversion_rate_percent?: number;
  reachable_rate_percent?: number;
  complete_contact_data_percent?: number;
  missing_contact_count?: number;
  open_tasks_count?: number;
  high_priority_open_tasks_count?: number;
  active_or_pending_workflow_steps?: number;
  completed_workflow_steps?: number;
  reply_events?: number;
  click_events?: number;
};

type KpisShape = {
  funnel?: unknown;
  conversion?: unknown;
  reachability?: unknown;
  data_quality?: unknown;
  team_workload?: unknown;
  workflow_speed?: unknown;
  reply_rate?: unknown;
  click_rate?: unknown;
};

function PārskatsPage() {
  const summaryQ = useDashboardSummary();
  const kpisQ = useDashboardKpis();

  const summary = (summaryQ.data ?? {}) as SummaryShape;
  const kpis = (kpisQ.data ?? {}) as KpisShape;

  const error =
    (summaryQ.error as Error | null)?.message ||
    (kpisQ.error as Error | null)?.message ||
    null;
  const loading = summaryQ.isLoading || kpisQ.isLoading;

  return (
    <>
      <PageHeader
        title="Pārskats"
        description="Galvenie KPI rādītāji par leadiem, konversijām un komunikāciju."
      />

      {error && <ErrorState message={error} />}
      {!error && loading && <LoadingState />}

      {!error && !loading && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <StatCard
              label="Kopā leadi"
              value={fmt(num(summary.total_leads))}
              tone="blue"
            />
            <StatCard
              label="Iegūti (won)"
              value={fmt(num(summary.won_count))}
              hint={`Konversija: ${pct(num(summary.conversion_rate_percent))}`}
              tone="purple"
            />
            <StatCard
              label="Sasniedzamība"
              value={pct(num(summary.reachable_rate_percent))}
              tone="amber"
            />
            <StatCard
              label="Pilni kontakti"
              value={pct(num(summary.complete_contact_data_percent))}
              hint={`Trūkst: ${fmt(num(summary.missing_contact_count))}`}
              tone="orange"
            />
            <StatCard
              label="Atvērti uzdevumi"
              value={fmt(num(summary.open_tasks_count))}
              hint={`Augsta prioritāte: ${fmt(num(summary.high_priority_open_tasks_count))}`}
              tone="red"
            />
            <StatCard
              label="Ieplānotās komunikācijas"
              value={fmt(num(summary.active_or_pending_workflow_steps))}
              hint={`Nosūtītās komunikācijas: ${fmt(num(summary.completed_workflow_steps))}`}
              tone="yellow"
            />
            <StatCard
              label="Atbildes"
              value={fmt(num(summary.reply_events))}
              tone="blue"
            />
            <StatCard
              label="Klikšķi"
              value={fmt(num(summary.click_events))}
              tone="purple"
            />
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <KpiSection title="Funnel" data={kpis.funnel} />
            <KpiSection title="Konversija" data={kpis.conversion} />
            <KpiSection title="Sasniedzamība" data={kpis.reachability} />
            <KpiSection title="Datu kvalitāte" data={kpis.data_quality} />
            <KpiSection title="Komandas slodze" data={kpis.team_workload} />
            <KpiSection title="Workflow ātrums" data={kpis.workflow_speed} />
            <KpiSection title="Atbilžu rādītājs" data={kpis.reply_rate} />
            <KpiSection title="Klikšķu rādītājs" data={kpis.click_rate} />
          </div>
        </>
      )}
    </>
  );
}

function KpiSection({ title, data }: { title: string; data: unknown }) {
  const empty =
    data == null ||
    (Array.isArray(data) && data.length === 0) ||
    (typeof data === "object" && Object.keys(data as object).length === 0);

  return (
    <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <h2 className="mb-3 text-sm font-semibold text-foreground">{title}</h2>
      {empty ? (
        <EmptyState />
      ) : Array.isArray(data) ? (
        <KpiTable rows={data as Array<Record<string, unknown>>} />
      ) : typeof data === "object" ? (
        <KpiKeyValue obj={data as Record<string, unknown>} />
      ) : (
        <p className="text-sm tabular-nums text-foreground">{String(data)}</p>
      )}
    </section>
  );
}

function formatValue(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "number") return fmt(v);
  if (typeof v === "string") {
    const n = Number(v);
    if (Number.isFinite(n) && v.trim() !== "") return fmt(n);
    return v;
  }
  if (typeof v === "boolean") return v ? "Jā" : "Nē";
  return JSON.stringify(v);
}

function humanizeKey(k: string): string {
  return k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function KpiKeyValue({ obj }: { obj: Record<string, unknown> }) {
  const entries = Object.entries(obj);
  if (entries.length === 0) return <EmptyState />;
  return (
    <dl className="divide-y divide-border">
      {entries.map(([k, v]) => (
        <div key={k} className="flex items-center justify-between py-2 text-sm">
          <dt className="text-muted-foreground">{humanizeKey(k)}</dt>
          <dd className="tabular-nums text-foreground">{formatValue(v)}</dd>
        </div>
      ))}
    </dl>
  );
}

function KpiTable({ rows }: { rows: Array<Record<string, unknown>> }) {
  if (rows.length === 0) return <EmptyState />;
  const cols = Array.from(
    rows.reduce<Set<string>>((acc, r) => {
      Object.keys(r).forEach((k) => acc.add(k));
      return acc;
    }, new Set()),
  );
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
            {cols.map((c) => (
              <th key={c} className="px-2 py-2 font-medium">
                {humanizeKey(c)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-border/50 last:border-0">
              {cols.map((c) => (
                <td key={c} className="px-2 py-2 tabular-nums text-foreground">
                  {formatValue(r[c])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
