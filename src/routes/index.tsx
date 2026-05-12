import { useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";

import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { LoadingState, ErrorState } from "@/components/DataState";
import { Button } from "@/components/ui/button";
import {
  useDashboardSummary,
  useDashboardKpis,
} from "@/hooks/useAnalyticsRpc";
import { useCrmView } from "@/hooks/useCrmView";

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

function isEmpty(v: unknown): boolean {
  if (v == null) return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") return Object.keys(v as object).length === 0;
  return false;
}

// Strip emails / UUIDs from labels
function cleanLabel(s: string | null | undefined): string {
  if (!s) return "—";
  const trimmed = s.trim();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(trimmed)) return "—";
  if (/@/.test(trimmed)) return trimmed.split("@")[0];
  return trimmed;
}

// ---------- types ----------
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
  workflow_speed?: Array<Record<string, unknown>>;
  reply_rate?: Array<Record<string, unknown>>;
  click_rate?: Array<Record<string, unknown>>;
};

const STATUS_ORDER = [
  "Jauns",
  "Piesaistīšana",
  "Piedāvājums",
  "Līgums",
  "Atlikts",
  "Atkārtojas",
  "Nesasniedzams",
  "Nekvalificējas",
  "Atcelts",
];

const QUEUE_BUCKET_LABELS: Record<string, string> = {
  overdue: "Nokavēti",
  due_today: "Šodien",
  planned: "Plānoti",
  automated: "Automatizēti",
  upcoming: "Drīzumā",
};

// ---------- page ----------
function PārskatsPage() {
  const summaryQ = useDashboardSummary();
  const kpisQ = useDashboardKpis();
  const queueQ = useCrmView(
    "next_action_queue_display_enriched",
    "select=ppv_name,country,queue_bucket,priority_label,lead_status_label",
    { all: true },
  );
  const qc = useQueryClient();

  const summary = (summaryQ.data ?? {}) as Summary;
  const kpis = (kpisQ.data ?? {}) as Kpis;

  const error =
    (summaryQ.error as Error | null)?.message ||
    (kpisQ.error as Error | null)?.message ||
    null;
  const loading = summaryQ.isLoading || kpisQ.isLoading;
  const refreshing =
    summaryQ.isFetching || kpisQ.isFetching || queueQ.isFetching;

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["dashboard-summary"] });
    qc.invalidateQueries({ queryKey: ["dashboard-kpis"] });
    qc.invalidateQueries({ queryKey: ["crm"] });
  };

  // ----- aggregations from queue view -----
  const queueRows = (queueQ.data?.rows ?? []) as Array<Record<string, unknown>>;
  const ppvDist = useMemo(() => aggregateBy(queueRows, "ppv_name"), [queueRows]);
  const countryDist = useMemo(
    () => aggregateBy(queueRows, "country"),
    [queueRows],
  );
  const bucketDist = useMemo(
    () => aggregateBy(queueRows, "queue_bucket"),
    [queueRows],
  );

  // ----- funnel (from kpis.funnel) -----
  const funnelRows = useMemo(() => {
    const rows = (kpis.funnel ?? []).map((r) => ({
      status: String(r.status ?? "—"),
      count: num(r.lead_count),
      last30: num(r.last_30d_count),
    }));
    rows.sort((a, b) => {
      const ai = STATUS_ORDER.indexOf(a.status);
      const bi = STATUS_ORDER.indexOf(b.status);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return b.count - a.count;
    });
    return rows;
  }, [kpis.funnel]);

  const conversion = (kpis.conversion?.[0] ?? {}) as Record<string, unknown>;
  const dataQuality = (kpis.data_quality?.[0] ?? {}) as Record<string, unknown>;
  const reach = (kpis.reachability?.[0] ?? {}) as Record<string, unknown>;
  const team = (kpis.team_workload ?? []) as Array<Record<string, unknown>>;

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
          {/* Hero KPIs */}
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
                hint={`Lead → Iegūts`}
              />
              <StatCard
                label="Sasniedzamība"
                value={pct(num(summary.reachable_rate_percent))}
                hint={`Pilni kontakti: ${pct(num(summary.complete_contact_data_percent))}`}
              />
            </div>
          </Section>

          {/* Operational alerts — only show non-zero */}
          {(num(summary.open_tasks_count) > 0 ||
            num(summary.active_or_pending_workflow_steps) > 0 ||
            num(summary.missing_contact_count) > 0) && (
            <Section label="Nepieciešama uzmanība">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                {num(summary.open_tasks_count) > 0 && (
                  <StatCard
                    label="Atvērti uzdevumi"
                    value={fmt(num(summary.open_tasks_count))}
                    hint={`Augsta prioritāte: ${fmt(num(summary.high_priority_open_tasks_count))}`}
                  />
                )}
                {num(summary.active_or_pending_workflow_steps) > 0 && (
                  <StatCard
                    label="Plānotās komunikācijas"
                    value={fmt(num(summary.active_or_pending_workflow_steps))}
                    hint={`Nosūtītās: ${fmt(num(summary.completed_workflow_steps))}`}
                  />
                )}
                {num(summary.missing_contact_count) > 0 && (
                  <StatCard
                    label="Trūkst kontakti"
                    value={fmt(num(summary.missing_contact_count))}
                    hint="Leadi bez e-pasta vai telefona"
                  />
                )}
              </div>
            </Section>
          )}

          {/* Two-column analytics */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Funnel */}
            {funnelRows.length > 0 && (
              <Card title="Pārdošanas funnel" subtitle="Leadi pa statusiem">
                <FunnelBars
                  rows={funnelRows}
                  total={num(summary.total_leads) || funnelRows.reduce((s, r) => s + r.count, 0)}
                />
              </Card>
            )}

            {/* PPV performance */}
            {ppvDist.length > 0 && (
              <Card
                title="PPV slodze"
                subtitle="Aktīvie leadi pa pārdošanas pārstāvjiem"
              >
                <BarList rows={ppvDist.slice(0, 8)} />
              </Card>
            )}

            {/* Country distribution */}
            {countryDist.length > 0 && (
              <Card title="Valstu sadalījums" subtitle="Aktīvie leadi pa valstīm">
                <BarList rows={countryDist.slice(0, 8)} />
              </Card>
            )}

            {/* Workflow buckets */}
            {bucketDist.length > 0 && (
              <Card
                title="Darba rinda"
                subtitle="Sadalījums pēc termiņa stāvokļa"
              >
                <BarList
                  rows={bucketDist.map((r) => ({
                    ...r,
                    label: QUEUE_BUCKET_LABELS[r.label] ?? r.label,
                  }))}
                />
              </Card>
            )}

            {/* Team leaderboard */}
            {team.length > 0 && (
              <Card title="Komandas slodze" subtitle="Atvērti uzdevumi un leadi">
                <Leaderboard rows={team} />
              </Card>
            )}

            {/* Data quality */}
            {!isEmpty(dataQuality) && (
              <Card title="Datu kvalitāte" subtitle="Kontaktinformācijas pilnums">
                <QualityBars dq={dataQuality} reach={reach} />
              </Card>
            )}
          </div>

          {/* Communications — only if data exists */}
          {(!isEmpty(kpis.reply_rate) ||
            !isEmpty(kpis.click_rate) ||
            !isEmpty(kpis.workflow_speed) ||
            num(summary.reply_events) > 0 ||
            num(summary.click_events) > 0) && (
            <Section label="Komunikācijas sniegums">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <StatCard
                  label="Atbildes"
                  value={fmt(num(summary.reply_events))}
                />
                <StatCard
                  label="Klikšķi"
                  value={fmt(num(summary.click_events))}
                />
                <StatCard
                  label="Nosūtītās"
                  value={fmt(num(summary.completed_workflow_steps))}
                />
                <StatCard
                  label="Plānotās"
                  value={fmt(num(summary.active_or_pending_workflow_steps))}
                />
              </div>
            </Section>
          )}
        </div>
      )}
    </>
  );
}

// ---------- shared building blocks ----------
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

function Card({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex h-full flex-col rounded-xl border border-border bg-card p-5">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {subtitle && (
          <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
        )}
      </div>
      <div className="flex-1">{children}</div>
    </section>
  );
}

// ---------- viz: funnel ----------
function FunnelBars({
  rows,
  total,
}: {
  rows: Array<{ status: string; count: number; last30: number }>;
  total: number;
}) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => {
        const widthPct = (r.count / max) * 100;
        const sharePct = total > 0 ? (r.count / total) * 100 : 0;
        return (
          <li key={r.status}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate text-foreground">{r.status}</span>
              <span className="tabular-nums text-muted-foreground">
                {fmt(r.count)}
                <span className="ml-2 text-xs">({sharePct.toFixed(1)}%)</span>
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-primary/80"
                style={{ width: `${widthPct}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// ---------- viz: bar list ----------
function aggregateBy(
  rows: Array<Record<string, unknown>>,
  key: string,
): Array<{ label: string; count: number }> {
  const map = new Map<string, number>();
  for (const r of rows) {
    const raw = r[key];
    const label = cleanLabel(raw == null ? null : String(raw));
    map.set(label, (map.get(label) ?? 0) + 1);
  }
  return Array.from(map.entries())
    .map(([label, count]) => ({ label, count }))
    .filter((r) => r.label !== "—" || r.count > 0)
    .sort((a, b) => b.count - a.count);
}

function BarList({ rows }: { rows: Array<{ label: string; count: number }> }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  const total = rows.reduce((s, r) => s + r.count, 0);
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => {
        const widthPct = (r.count / max) * 100;
        const share = total > 0 ? (r.count / total) * 100 : 0;
        return (
          <li key={r.label}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate text-foreground">{r.label}</span>
              <span className="tabular-nums text-muted-foreground">
                {fmt(r.count)}
                <span className="ml-2 text-xs">({share.toFixed(1)}%)</span>
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-foreground/60"
                style={{ width: `${widthPct}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// ---------- viz: leaderboard ----------
function Leaderboard({ rows }: { rows: Array<Record<string, unknown>> }) {
  const items = rows
    .map((r) => ({
      code: cleanLabel(String(r.user_code ?? "")) || "—",
      name: cleanLabel(String(r.full_name ?? "")),
      open: num(r.open_tasks_count),
      high: num(r.high_priority_open_tasks_count),
      leads: num(r.assigned_leads_count),
    }))
    .sort((a, b) => b.open + b.leads - (a.open + a.leads))
    .slice(0, 8);

  if (items.length === 0)
    return (
      <p className="text-sm text-muted-foreground">Nav komandas datu.</p>
    );

  return (
    <ul className="divide-y divide-border">
      {items.map((it) => (
        <li
          key={it.code + it.name}
          className="flex items-center justify-between gap-3 py-2.5"
        >
          <div className="flex items-center gap-3 min-w-0">
            <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-foreground">
              {it.code.slice(0, 2).toUpperCase()}
            </span>
            <span className="truncate text-sm text-foreground">{it.code}</span>
          </div>
          <div className="flex items-center gap-4 text-sm tabular-nums">
            <Stat label="Leadi" value={it.leads} />
            <Stat label="Uzdevumi" value={it.open} />
            <Stat
              label="Augsta"
              value={it.high}
              tone={it.high > 0 ? "warn" : undefined}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "warn";
}) {
  return (
    <div className="flex flex-col items-end leading-tight">
      <span
        className={
          tone === "warn" && value > 0
            ? "font-semibold text-amber-600 dark:text-amber-500"
            : "font-medium text-foreground"
        }
      >
        {fmt(value)}
      </span>
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

// ---------- viz: data quality ----------
function QualityBars({
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
    <div className="space-y-4">
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
      {issues.length > 0 && (
        <div className="flex flex-wrap gap-2 border-t border-border pt-3">
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
      )}
    </div>
  );
}
