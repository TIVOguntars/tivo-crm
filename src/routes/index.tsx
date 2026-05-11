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

const KEY_LABELS: Record<string, string> = {
  total_leads: "Kopā leadi",
  lead_count: "Leadu skaits",
  first_lead_at: "Pirmais leads",
  latest_lead_at: "Jaunākais leads",
  has_email_count: "Ar e-pastu",
  has_phone_count: "Ar telefonu",
  mobile_phone_count: "Mobilie numuri",
  validated_phone_count: "Validēti numuri",
  reachable_rate_percent: "Sasniedzamība %",
  missing_email_count: "Trūkst e-pasts",
  missing_phone_count: "Trūkst telefons",
  complete_contact_data_percent: "Pilni kontakti %",
  reply_rate_percent: "Atbilžu %",
  click_rate_percent: "Klikšķu %",
  delivery_rate_percent: "Piegādes %",
  engagement_rate_percent: "Iesaistes %",
  active_or_pending_steps: "Ieplānotās komunikācijas",
  completed_steps: "Nosūtītās komunikācijas",
  failed_steps: "Neizdevušās",
  total_steps: "Kopā soļi",
  step_type: "Tips",
  avg_completion_minutes: "Vidējais ilgums (min)",
  channel: "Kanāls",
  status: "Statuss",
  date: "Datums",
  owner: "Atbildīgais",
  source: "Avots",
  country: "Valsts",
};

const ISO_DATETIME_RE =
  /^\d{4}-\d{2}-\d{2}[Tt ]\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/;

function formatDateTime(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function isPercentKey(k?: string): boolean {
  if (!k) return false;
  return /percent|_pct$|rate/i.test(k);
}

function isContactCompletenessKey(k?: string): boolean {
  if (!k) return false;
  return /complete_contact|contact_data_percent/i.test(k);
}

function formatValue(v: unknown, key?: string): string {
  if (v == null || v === "") {
    if (isContactCompletenessKey(key)) return "Nav kontaktinformācijas";
    if (isPercentKey(key)) return "Nav datu";
    return "—";
  }
  if (typeof v === "string" && ISO_DATETIME_RE.test(v)) {
    return formatDateTime(v);
  }
  if (typeof v === "number") {
    if (v === 0 && isContactCompletenessKey(key)) return "Nav kontaktinformācijas";
    if (isPercentKey(key)) return `${v.toFixed(1)}%`;
    return fmt(v);
  }
  if (typeof v === "string") {
    const n = Number(v);
    if (Number.isFinite(n) && v.trim() !== "") {
      if (n === 0 && isContactCompletenessKey(key)) return "Nav kontaktinformācijas";
      if (isPercentKey(key)) return `${n.toFixed(1)}%`;
      return fmt(n);
    }
    return v;
  }
  if (typeof v === "boolean") return v ? "Jā" : "Nē";
  return JSON.stringify(v);
}

function humanizeKey(k: string): string {
  if (KEY_LABELS[k]) return KEY_LABELS[k];
  const spaced = k.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function KpiKeyValue({ obj }: { obj: Record<string, unknown> }) {
  const entries = Object.entries(obj);
  if (entries.length === 0) return <EmptyState />;
  return (
    <dl className="divide-y divide-border">
      {entries.map(([k, v]) => (
        <div key={k} className="flex items-center justify-between gap-4 py-2 text-sm">
          <dt className="text-muted-foreground">{humanizeKey(k)}</dt>
          <dd className="tabular-nums text-foreground text-right">
            {formatValue(v, k)}
          </dd>
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
          <tr className="border-b border-border text-left text-xs font-medium text-muted-foreground">
            {cols.map((c) => (
              <th key={c} className="whitespace-nowrap px-3 py-2 font-medium">
                {humanizeKey(c)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-border/50 last:border-0">
              {cols.map((c) => (
                <td
                  key={c}
                  className="whitespace-nowrap px-3 py-2 tabular-nums text-foreground"
                >
                  {formatValue(r[c], c)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
