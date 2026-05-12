import { useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw, AlertTriangle } from "lucide-react";

import { PageHeader } from "@/components/PageHeader";
import { LoadingState, ErrorState } from "@/components/DataState";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAnalyticsView } from "@/hooks/useAnalyticsView";

export const Route = createFileRoute("/")({
  component: PārskatsPage,
});

// ---------- helpers ----------
type Row = Record<string, unknown>;

function num(v: unknown): number {
  const n = typeof v === "string" ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : 0;
}
const fmt = (n: number) => new Intl.NumberFormat("lv-LV").format(n);
const pct = (n: number) => `${num(n).toFixed(1)}%`;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "—";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

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

// ---------- page ----------
function PārskatsPage() {
  const kpiQ = useAnalyticsView("dashboard_kpi_overview");
  const funnelQ = useAnalyticsView("funnel_summary", "order=leadu_skaits.desc");
  const ppvQ = useAnalyticsView("ppv_performance", "order=aktivie_leadi.desc");
  const countryQ = useAnalyticsView("country_distribution", "order=leadu_skaits.desc");
  const dqQ = useAnalyticsView("data_quality");
  const workflowQ = useAnalyticsView("workflow_health", "order=kopa.desc");
  const timelineQ = useAnalyticsView("activity_timeline");
  const commPerfQ = useAnalyticsView("communication_performance");
  const importQualityQ = useAnalyticsView("import_quality", "order=leadu_skaits.desc");
  const tasksQ = useAnalyticsView("dashboard_tasks");
  const commsSummaryQ = useAnalyticsView("dashboard_communications");
  const qc = useQueryClient();

  const kpi = (kpiQ.data?.rows?.[0] ?? {}) as Row;
  const funnel = (funnelQ.data?.rows ?? []) as Row[];
  const ppv = (ppvQ.data?.rows ?? []) as Row[];
  const country = (countryQ.data?.rows ?? []) as Row[];
  const dq = (dqQ.data?.rows?.[0] ?? {}) as Row;
  const workflow = (workflowQ.data?.rows ?? []) as Row[];
  const timeline = (timelineQ.data?.rows ?? []) as Row[];
  const commPerf = (commPerfQ.data?.rows ?? []) as Row[];
  const importQuality = (importQualityQ.data?.rows ?? []) as Row[];
  const tasks = (tasksQ.data?.rows ?? []) as Row[];
  const commsSummary = (commsSummaryQ.data?.rows?.[0] ?? null) as Row | null;

  const queries = [
    kpiQ, funnelQ, ppvQ, countryQ, dqQ, workflowQ,
    timelineQ, commPerfQ, importQualityQ, tasksQ, commsSummaryQ,
  ];
  const error =
    (kpiQ.data?.error as string | null) ||
    (funnelQ.data?.error as string | null) ||
    (kpiQ.error as Error | null)?.message ||
    null;
  const loading = queries.some((q) => q.isLoading);
  const refreshing = queries.some((q) => q.isFetching);

  const refresh = () => qc.invalidateQueries({ queryKey: ["analytics"] });

  // ---------- derived data ----------
  const totalLeads = num(kpi.kopa_leadi);
  const wfTotal = workflow.reduce((s, r) => s + num(r.kopa), 0);
  const wfErrors = workflow.reduce((s, r) => s + num(r.kludas), 0);
  const wfActive = workflow.reduce((s, r) => s + num(r.aktivi), 0);
  const wfDone = wfTotal - wfActive - wfErrors;

  const ppvRows = useMemo(
    () =>
      ppv
        .map((r) => ({
          name: String(r.ppv ?? "—"),
          active: num(r.aktivie_leadi),
          won: num(r.ieguti),
        }))
        .filter((r) => r.name !== "—" && r.active > 0)
        .slice(0, 6),
    [ppv],
  );

  const taskRows = useMemo(
    () =>
      tasks
        .map((r) => ({
          group: String(r.grupa ?? "—"),
          total: num(r.uzdevumi),
          high: num(r.augsta_prioritate),
        }))
        .filter((r) => r.total > 0),
    [tasks],
  );

  const tasksTotal = taskRows.reduce((s, r) => s + r.total, 0);
  const tasksHigh = taskRows.reduce((s, r) => s + r.high, 0);

  const funnelRows = useMemo(() => {
    const rows = funnel.map((r) => ({
      label: String(r.statuss ?? "—"),
      count: num(r.leadu_skaits),
    }));
    rows.sort((a, b) => {
      const ai = STATUS_ORDER.indexOf(a.label);
      const bi = STATUS_ORDER.indexOf(b.label);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return b.count - a.count;
    });
    return rows;
  }, [funnel]);

  const countryRows = useMemo(
    () =>
      country
        .map((r) => ({
          label: String(r.valsts ?? "—"),
          count: num(r.leadu_skaits),
          extra:
            num(r.konversijas_pct) > 0
              ? `${num(r.konversijas_pct).toFixed(1)}% konv.`
              : undefined,
        }))
        .filter((r) => r.label !== "—" && r.count > 0)
        .slice(0, 8),
    [country],
  );

  const commRows = useMemo(
    () =>
      commPerf
        .map((r) => ({
          channel: String(r.kanals ?? "—"),
          sent: num(r.nosutiti),
          replyPct: num(r.atbildes_pct),
          replies: num(r.atbildes),
        }))
        .filter((r) => r.sent > 0),
    [commPerf],
  );

  const importRows = useMemo(
    () =>
      importQuality
        .map((r) => ({
          source: String(r.avots ?? "—"),
          count: num(r.leadu_skaits),
          fullPct: num(r.pilnums_pct),
          week: num(r.pedeja_nedela),
        }))
        .filter((r) => r.count > 0)
        .slice(0, 8),
    [importQuality],
  );

  const tlRows = useMemo(
    () =>
      timeline.map((r) => ({
        date: String(r.datums ?? ""),
        leads: num(r.jauni_leadi),
        status: num(r.statusa_izmainas),
        comms: num(r.komunikacijas),
        total: num(r.kopa),
      })),
    [timeline],
  );
  const showTimeline = tlRows.some((r) => r.total > 0);
  const hasComms =
    commsSummary !== null &&
    num(commsSummary.nosutiti) + num(commsSummary.atbildes) > 0;

  const workflowErrors = useMemo(
    () =>
      workflow
        .map((r) => ({ name: String(r.workflow ?? "—"), errors: num(r.kludas) }))
        .filter((r) => r.errors > 0),
    [workflow],
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
        <div className="space-y-10">
          {/* 1. Galvenie rādītāji — dominant */}
          <Section label="Galvenie rādītāji">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <HeroStat
                label="Kopā leadi"
                value={fmt(totalLeads)}
                hint={`Kvalificēti: ${fmt(num(kpi.kvalificeti))}`}
              />
              <HeroStat
                label="Kvalificēti"
                value={fmt(num(kpi.kvalificeti))}
                hint={pct(num(kpi.kvalifikacijas_pct))}
              />
              <HeroStat
                label="Iegūti"
                value={fmt(num(kpi.ieguti))}
                hint={`${pct(num(kpi.iegusanas_pct))} no kopējā`}
              />
              <HeroStat
                label="Sasniedzamība"
                value={pct(num(kpi.sasniedzamiba_pct))}
                hint={`Ar e-pastu: ${pct(num(dq.ar_epastu_pct))}`}
              />
            </div>
          </Section>

          {/* 2. Darba slodze */}
          {(wfTotal > 0 || tasksTotal > 0 || ppvRows.length > 0) && (
            <Section label="Darba slodze">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <CompactStat label="Procesi kopā" value={fmt(wfTotal)} />
                  <CompactStat label="Aktīvi" value={fmt(wfActive)} />
                  <CompactStat label="Pabeigti" value={fmt(Math.max(0, wfDone))} />
                  <CompactStat
                    label="Atvērtie uzdevumi"
                    value={fmt(tasksTotal)}
                    hint={tasksHigh > 0 ? `${fmt(tasksHigh)} ar augstu prioritāti` : undefined}
                  />
                </div>
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  {ppvRows.length > 0 && (
                    <Card title="Pārstāvju slodze" subtitle="Aktīvie leadi pa pārstāvjiem">
                      <PeopleList rows={ppvRows} />
                    </Card>
                  )}
                  {taskRows.length > 0 && (
                    <Card title="Uzdevumu rinda" subtitle="Atvērto darbību sadalījums">
                      <BarList
                        rows={taskRows.map((r) => ({
                          label: r.group,
                          count: r.total,
                          extra: r.high > 0 ? `${fmt(r.high)} augsta` : undefined,
                        }))}
                      />
                    </Card>
                  )}
                </div>
              </div>
            </Section>
          )}

          {/* 3. Komunikācija */}
          {(hasComms || commRows.length > 0 || showTimeline) && (
            <Section label="Komunikācija">
              <div className="space-y-4">
                {hasComms && (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                    <CompactStat label="Nosūtīti (30d)" value={fmt(num(commsSummary!.nosutiti))} />
                    <CompactStat label="Piegādāti" value={fmt(num(commsSummary!.piegadati))} />
                    <CompactStat
                      label="Atbildes"
                      value={fmt(num(commsSummary!.atbildes))}
                      hint={pct(num(commsSummary!.atbildes_pct))}
                    />
                    <CompactStat label="Klikšķi" value={fmt(num(commsSummary!.klikski))} />
                    <CompactStat
                      label="Kļūdas"
                      value={fmt(num(commsSummary!.kludas))}
                      hint={num(commsSummary!.kludu_pct) > 0 ? pct(num(commsSummary!.kludu_pct)) : undefined}
                    />
                  </div>
                )}
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  {commRows.length > 0 && (
                    <Card title="Kanālu efektivitāte" subtitle="Atbildes likme — pēdējās 90 dienas">
                      <ul className="space-y-2.5">
                        {commRows.map((r) => (
                          <li key={r.channel}>
                            <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                              <span className="text-foreground">{r.channel}</span>
                              <span className="tabular-nums text-muted-foreground">
                                {fmt(r.sent)} nos.
                                <span className="ml-2 text-xs">{pct(r.replyPct)} atb.</span>
                              </span>
                            </div>
                            <div className="h-2 overflow-hidden rounded-full bg-secondary">
                              <div
                                className="h-full rounded-full bg-primary/70"
                                style={{ width: `${Math.min(100, r.replyPct)}%` }}
                              />
                            </div>
                          </li>
                        ))}
                      </ul>
                    </Card>
                  )}
                  {showTimeline && (
                    <Card title="Aktivitātes (30 dienas)" subtitle="Jauni leadi un komunikācijas">
                      <Sparkline rows={tlRows} />
                    </Card>
                  )}
                </div>
              </div>
            </Section>
          )}

          {/* 4. Leadu sadalījums */}
          {(funnelRows.length > 0 || countryRows.length > 0) && (
            <Section label="Leadu sadalījums">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {funnelRows.length > 0 && (
                  <Card title="Pārdošanas piltuve" subtitle="Leadi pa statusiem">
                    <BarList rows={funnelRows} total={totalLeads || funnelRows.reduce((s, r) => s + r.count, 0)} />
                  </Card>
                )}
                {countryRows.length > 0 && (
                  <Card title="Valstu sadalījums" subtitle="Leadi pa valstīm">
                    <BarList rows={countryRows} />
                  </Card>
                )}
              </div>
            </Section>
          )}

          {/* 5. Datu kvalitāte */}
          <Section label="Datu kvalitāte">
            <DataQualityCard dq={dq} kpi={kpi} />
          </Section>

          {/* 6. Importi un riski */}
          {(importRows.length > 0 || workflowErrors.length > 0 || wfErrors > 0) && (
            <Section label="Importi un riski">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {importRows.length > 0 && (
                  <Card title="Importa kvalitāte" subtitle="Avoti un kontaktu pilnums">
                    <ul className="space-y-2.5">
                      {importRows.map((r) => (
                        <li key={r.source}>
                          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                            <span className="truncate text-foreground">{r.source}</span>
                            <span className="tabular-nums text-muted-foreground">
                              {fmt(r.count)}
                              <span className="ml-2 text-xs">{pct(r.fullPct)} pilni</span>
                            </span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-secondary">
                            <div
                              className="h-full rounded-full bg-foreground/60"
                              style={{ width: `${Math.min(100, r.fullPct)}%` }}
                            />
                          </div>
                        </li>
                      ))}
                    </ul>
                  </Card>
                )}
                <Card
                  title="Procesu riski"
                  subtitle={wfErrors > 0 ? "Kļūdas, kurām nepieciešama uzmanība" : "Stāvoklis stabils"}
                >
                  {workflowErrors.length > 0 ? (
                    <ul className="divide-y divide-border">
                      {workflowErrors.map((r) => (
                        <li key={r.name} className="flex items-center justify-between gap-3 py-2.5">
                          <span className="flex items-center gap-2 truncate text-sm text-foreground">
                            <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                            {r.name}
                          </span>
                          <span className="text-sm font-semibold tabular-nums text-amber-600 dark:text-amber-500">
                            {fmt(r.errors)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">Nav atklātu kļūdu procesos.</p>
                  )}
                </Card>
              </div>
            </Section>
          )}
        </div>
      )}
    </>
  );
}

// ---------- shared UI ----------
function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </h2>
      {children}
    </section>
  );
}

function HeroStat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-3xl font-semibold tabular-nums text-foreground lg:text-4xl">
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-muted-foreground line-clamp-1">{hint}</p>}
    </div>
  );
}

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
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground line-clamp-1">
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">{value}</p>
      {hint && (
        <p className="mt-0.5 text-[11px] text-muted-foreground line-clamp-1">{hint}</p>
      )}
    </div>
  );
}

function Card({
  title,
  subtitle,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("flex flex-col rounded-xl border border-border bg-card p-5", className)}>
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      <div className="flex-1">{children}</div>
    </section>
  );
}

function BarList({
  rows,
  total,
}: {
  rows: Array<{ label: string; count: number; extra?: string }>;
  total?: number;
}) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  const sum = total ?? rows.reduce((s, r) => s + r.count, 0);
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => {
        const widthPct = (r.count / max) * 100;
        const share = sum > 0 ? (r.count / sum) * 100 : 0;
        return (
          <li key={r.label}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate text-foreground">{r.label}</span>
              <span className="tabular-nums text-muted-foreground">
                {fmt(r.count)}
                <span className="ml-2 text-xs">
                  {r.extra ?? `(${share.toFixed(1)}%)`}
                </span>
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

function PeopleList({
  rows,
}: {
  rows: Array<{ name: string; active: number; won: number }>;
}) {
  const max = Math.max(1, ...rows.map((r) => r.active));
  return (
    <ul className="space-y-3">
      {rows.map((r) => {
        const w = (r.active / max) * 100;
        return (
          <li key={r.name} className="flex items-center gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-[11px] font-semibold text-foreground">
              {initials(r.name)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                <span className="truncate text-foreground">{r.name}</span>
                <span className="tabular-nums text-muted-foreground">
                  {fmt(r.active)}
                  <span className="ml-2 text-xs">{fmt(r.won)} iegūti</span>
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-primary/70"
                  style={{ width: `${w}%` }}
                />
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function Sparkline({
  rows,
}: {
  rows: Array<{ date: string; leads: number; status: number; comms: number; total: number }>;
}) {
  const w = 600;
  const h = 120;
  const pad = 6;
  const max = Math.max(1, ...rows.map((r) => Math.max(r.leads, r.comms, r.status)));
  const step = rows.length > 1 ? (w - pad * 2) / (rows.length - 1) : 0;

  const series = [
    { key: "leads" as const, color: "hsl(var(--primary))", opacity: 0.95 },
    { key: "comms" as const, color: "currentColor", opacity: 0.7 },
    { key: "status" as const, color: "currentColor", opacity: 0.35 },
  ];

  const path = (key: "leads" | "status" | "comms") =>
    rows
      .map((r, i) => {
        const x = pad + i * step;
        const y = h - pad - (r[key] / max) * (h - pad * 2);
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");

  const totalLeads = rows.reduce((s, r) => s + r.leads, 0);
  const totalComms = rows.reduce((s, r) => s + r.comms, 0);

  return (
    <div className="text-foreground">
      <svg viewBox={`0 0 ${w} ${h}`} className="h-28 w-full" preserveAspectRatio="none">
        {series.map((s) => (
          <path
            key={s.key}
            d={path(s.key)}
            fill="none"
            stroke={s.color}
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={s.opacity}
          />
        ))}
      </svg>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <LegendDot color="bg-primary" label={`Jauni leadi: ${fmt(totalLeads)}`} />
        <LegendDot color="bg-foreground/70" label={`Komunikācijas: ${fmt(totalComms)}`} />
        <LegendDot color="bg-foreground/40" label="Statusu maiņas" />
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-2 w-2 rounded-full ${color}`} />
      {label}
    </span>
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
            Kopā leadi sistēmā:{" "}
            <span className="font-medium text-foreground tabular-nums">{fmt(total)}</span>
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
