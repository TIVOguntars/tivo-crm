import { useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  RefreshCw,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Users,
  Target,
  Trophy,
  PhoneCall,
} from "lucide-react";

import { LoadingState, ErrorState } from "@/components/DataState";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAnalyticsView } from "@/hooks/useAnalyticsView";
import { HeaderSlot } from "@/components/HeaderSlot";

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
const PIPELINE_STAGES = ["Jauns", "Piesaistīšana", "Piedāvājums", "Līgums"];

const SOURCE_LABELS: Record<string, string> = {
  public_legacy: "Mantotie ieraksti",
  legacy: "Mantotie ieraksti",
  manual: "Manuāli ievadīti",
  import: "Importēti",
  unknown: "Nezināms avots",
  "": "Nezināms avots",
};

function cleanLabel(raw: string, fallback = "Nezināms"): string {
  const key = raw.trim().toLowerCase();
  if (SOURCE_LABELS[key]) return SOURCE_LABELS[key];
  if (!raw || raw === "—") return fallback;
  // Strip technical suffixes / underscores
  const cleaned = raw
    .replace(/^public[_.-]?/i, "")
    .replace(/_/g, " ")
    .trim();
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

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
          group: cleanLabel(String(r.grupa ?? "—"), "Cita"),
          total: num(r.uzdevumi),
          high: num(r.augsta_prioritate),
        }))
        .filter((r) => r.total > 0),
    [tasks],
  );
  const tasksTotal = taskRows.reduce((s, r) => s + r.total, 0);
  const tasksHigh = taskRows.reduce((s, r) => s + r.high, 0);

  const funnelRows = useMemo(() => {
    const map = new Map<string, number>();
    funnel.forEach((r) => map.set(String(r.statuss ?? "—"), num(r.leadu_skaits)));
    const rows = Array.from(map.entries()).map(([label, count]) => ({ label, count }));
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

  const pipelineFunnel = useMemo(() => {
    const rows = PIPELINE_STAGES.map((label) => {
      const r = funnelRows.find((x) => x.label === label);
      return { label, count: r?.count ?? 0 };
    });
    const top = rows[0]?.count || 0;
    return rows.map((r, i) => {
      const prev = i === 0 ? null : rows[i - 1].count;
      const drop = prev != null ? Math.max(0, prev - r.count) : 0;
      const conv = prev && prev > 0 ? (r.count / prev) * 100 : i === 0 ? 100 : 0;
      const dropPct = prev && prev > 0 ? (drop / prev) * 100 : 0;
      const totalShare = top > 0 ? (r.count / top) * 100 : 0;
      return { ...r, prev, drop, conv, dropPct, totalShare };
    });
  }, [funnelRows]);

  const lostStatuses = useMemo(
    () =>
      funnelRows.filter((r) =>
        ["Atlikts", "Nesasniedzams", "Nekvalificējas", "Atcelts"].includes(r.label),
      ),
    [funnelRows],
  );

  const countryRows = useMemo(
    () =>
      country
        .map((r) => ({
          label: cleanLabel(String(r.valsts ?? "—"), "Cita"),
          count: num(r.leadu_skaits),
          extra:
            num(r.konversijas_pct) > 0
              ? `${num(r.konversijas_pct).toFixed(1)}% konv.`
              : undefined,
        }))
        .filter((r) => r.count > 0)
        .slice(0, 8),
    [country],
  );

  const commRows = useMemo(
    () =>
      commPerf
        .map((r) => ({
          channel: cleanLabel(String(r.kanals ?? "—"), "Cits"),
          sent: num(r.nosutiti),
          replyPct: num(r.atbildes_pct),
          replies: num(r.atbildes),
          errors: num(r.kludas),
        }))
        .filter((r) => r.sent > 0),
    [commPerf],
  );

  const importRows = useMemo(
    () =>
      importQuality
        .map((r) => ({
          source: cleanLabel(String(r.avots ?? "—"), "Nezināms avots"),
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

  const commsActive =
    commsSummary !== null &&
    num(commsSummary.nosutiti) + num(commsSummary.atbildes) > 0;
  const commsTracking = commsSummary !== null;

  const workflowErrors = useMemo(
    () =>
      workflow
        .map((r) => ({ name: cleanLabel(String(r.workflow ?? "—"), "Process"), errors: num(r.kludas) }))
        .filter((r) => r.errors > 0),
    [workflow],
  );

  // ---------- attention items ----------
  type Attention = {
    key: string;
    severity: "danger" | "warning";
    title: string;
    detail?: string;
    to?: string;
  };
  const attention: Attention[] = useMemo(() => {
    const items: Attention[] = [];
    if (tasksHigh > 0) {
      items.push({
        key: "tasks-high",
        severity: "warning",
        title: `${fmt(tasksHigh)} uzdevumi ar augstu prioritāti`,
        detail: "Pārskatiet darba rindu",
        to: "/uzdevumi",
      });
    }
    if (commsSummary && num(commsSummary.kludas) > 0) {
      items.push({
        key: "comm-errors",
        severity: "danger",
        title: `${fmt(num(commsSummary.kludas))} komunikācijas kļūdas`,
        detail: `${pct(num(commsSummary.kludu_pct))} no nosūtītajiem`,
        to: "/komunikacijas",
      });
    }
    workflowErrors.slice(0, 3).forEach((w) => {
      items.push({
        key: `wf-${w.name}`,
        severity: "danger",
        title: `${w.name}: ${fmt(w.errors)} kļūdas`,
        detail: "Procesa darbība pārtraukta",
      });
    });
    const noEmail = num(dq.bez_epasta_pct);
    const noPhone = num(dq.bez_talruna_pct);
    if (noEmail >= 20) {
      items.push({
        key: "dq-email",
        severity: "warning",
        title: `${pct(noEmail)} leadu bez e-pasta`,
        detail: "Datu kvalitāte ietekmē sasniedzamību",
      });
    }
    if (noPhone >= 20) {
      items.push({
        key: "dq-phone",
        severity: "warning",
        title: `${pct(noPhone)} leadu bez telefona`,
        detail: "Apsveriet datu papildināšanu",
      });
    }
    importRows
      .filter((r) => r.fullPct > 0 && r.fullPct < 50)
      .slice(0, 2)
      .forEach((r) => {
        items.push({
          key: `imp-${r.source}`,
          severity: "warning",
          title: `Imports "${r.source}": tikai ${pct(r.fullPct)} pilni kontakti`,
          detail: "Pārskatīt importa konfigurāciju",
          to: "/import-review",
        });
      });
    return items;
  }, [tasksHigh, commsSummary, workflowErrors, dq, importRows]);

  return (
    <>
      <HeaderSlot>
        <div className="min-w-0 leading-tight">
          <h1 className="truncate text-sm font-semibold tracking-tight text-foreground">
            Pārskats
          </h1>
          <p className="text-[11px] text-muted-foreground">Operatīvais kontroles centrs</p>
        </div>
      </HeaderSlot>
      {/* Sticky filter / action bar */}
      <div className="sticky top-0 z-20 -mx-4 mb-4 border-b border-border bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:-mx-6 sm:px-6">
        <div className="flex flex-wrap items-center justify-end gap-3">
          <div className="flex items-center gap-2">
            <Link
              to="/uzdevumi"
              className="hidden rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-accent sm:inline-flex"
            >
              Uzdevumi
            </Link>
            <Link
              to="/leadi"
              className="hidden rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-accent sm:inline-flex"
            >
              Leadi
            </Link>
            <Link
              to="/komunikacijas"
              className="hidden rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-accent sm:inline-flex"
            >
              Komunikācija
            </Link>
            <Button
              variant="outline"
              size="sm"
              onClick={refresh}
              disabled={refreshing}
              className="h-8 gap-1.5"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
              Atjaunot
            </Button>
          </div>
        </div>
      </div>

      {error && <ErrorState message={error} />}
      {!error && loading && <LoadingState />}

      {!error && !loading && (
        <div className="space-y-6">
          {/* Attention panel */}
          {attention.length > 0 && (
            <AttentionPanel items={attention} />
          )}

          {/* 1. Galvenie rādītāji */}
          <Section label="Galvenie rādītāji">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <HeroStat
                to="/leadi"
                icon={<Users className="h-4 w-4" />}
                label="Kopā leadi"
                value={fmt(totalLeads)}
                hint={`Kvalificēti: ${fmt(num(kpi.kvalificeti))}`}
              />
              <HeroStat
                to="/leadi"
                icon={<Target className="h-4 w-4" />}
                label="Kvalificēti"
                value={fmt(num(kpi.kvalificeti))}
                hint={pct(num(kpi.kvalifikacijas_pct))}
                accent="primary"
              />
              <HeroStat
                to="/leadi"
                icon={<Trophy className="h-4 w-4" />}
                label="Iegūti"
                value={fmt(num(kpi.ieguti))}
                hint={`${pct(num(kpi.iegusanas_pct))} no kopējā`}
                accent="success"
              />
              <HeroStat
                to="/komunikacijas"
                icon={<PhoneCall className="h-4 w-4" />}
                label="Sasniedzamība"
                value={pct(num(kpi.sasniedzamiba_pct))}
                hint={`Ar e-pastu: ${pct(num(dq.ar_epastu_pct))}`}
                accent={
                  num(kpi.sasniedzamiba_pct) < 50 ? "warning" : "primary"
                }
              />
            </div>
          </Section>

          {/* 2. Darba slodze */}
          {(wfTotal > 0 || tasksTotal > 0 || ppvRows.length > 0) && (
            <Section label="Darba slodze">
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <CompactStat to="/uzdevumi" label="Aktīvi procesi" value={fmt(wfActive)} />
                  <CompactStat label="Procesi kopā" value={fmt(wfTotal)} />
                  <CompactStat
                    to="/uzdevumi"
                    label="Atvērtie uzdevumi"
                    value={fmt(tasksTotal)}
                  />
                  <CompactStat
                    to="/uzdevumi"
                    label="Augsta prioritāte"
                    value={fmt(tasksHigh)}
                    tone={tasksHigh > 0 ? "warning" : undefined}
                  />
                </div>
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  {ppvRows.length > 0 && (
                    <Card title="Pārstāvju slodze" subtitle="Aktīvie leadi pa pārstāvjiem">
                      <PeopleList rows={ppvRows} />
                    </Card>
                  )}
                  {taskRows.length > 0 && (
                    <Card title="Uzdevumu sadalījums" subtitle="Pa darbību grupām">
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
          <Section label="Komunikācija">
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {commsActive ? (
                  <>
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
                      tone={num(commsSummary!.kludas) > 0 ? "danger" : undefined}
                    />
                  </>
                ) : (
                  <ContextEmpty
                    message={
                      commsTracking
                        ? "Pēdējās 30 dienās nav komunikācijas aktivitātes"
                        : "Komunikācijas izsekošana nav aktivizēta"
                    }
                  />
                )}
              </div>
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                <Card title="Kanālu efektivitāte" subtitle="Atbildes likme — pēdējās 90 dienas">
                  {commRows.length > 0 ? (
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
                          <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                            <div
                              className="h-full rounded-full bg-primary/70"
                              style={{ width: `${Math.min(100, r.replyPct)}%` }}
                            />
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <ContextEmpty inline message="Nav datu par kanālu sniegumu" />
                  )}
                </Card>
                <Card title="Aktivitātes (30 dienas)" subtitle="Jauni leadi un komunikācijas">
                  {showTimeline ? (
                    <Sparkline rows={tlRows} />
                  ) : (
                    <ContextEmpty inline message="Nesenā periodā aktivitāte nav reģistrēta" />
                  )}
                </Card>
              </div>
            </div>
          </Section>

          {/* 4. Leadu sadalījums */}
          {(funnelRows.length > 0 || countryRows.length > 0) && (
            <Section label="Leadu sadalījums">
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {pipelineFunnel.some((r) => r.count > 0) && (
                  <Card title="Pārdošanas piltuve" subtitle="Konversija un zudumi pa posmiem">
                    <FunnelChart rows={pipelineFunnel} lost={lostStatuses} />
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
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {importRows.length > 0 && (
                  <Card title="Importa kvalitāte" subtitle="Avoti un kontaktu pilnums">
                    <ul className="space-y-2.5">
                      {importRows.map((r) => (
                        <li key={r.source}>
                          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                            <span className="truncate text-foreground">{r.source}</span>
                            <span className="tabular-nums text-muted-foreground">
                              {fmt(r.count)}
                              <span
                                className={cn(
                                  "ml-2 text-xs",
                                  r.fullPct < 50 && "text-warning",
                                )}
                              >
                                {pct(r.fullPct)} pilni
                              </span>
                            </span>
                          </div>
                          <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                            <div
                              className={cn(
                                "h-full rounded-full",
                                r.fullPct < 50
                                  ? "bg-warning"
                                  : r.fullPct < 80
                                    ? "bg-primary/60"
                                    : "bg-success",
                              )}
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
                        <li key={r.name} className="flex items-center justify-between gap-3 py-2">
                          <span className="flex items-center gap-2 truncate text-sm text-foreground">
                            <AlertTriangle className="h-3.5 w-3.5 text-warning" />
                            {r.name}
                          </span>
                          <span className="text-sm font-semibold tabular-nums text-warning">
                            {fmt(r.errors)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <CheckCircle2 className="h-4 w-4 text-success" />
                      Visi procesi darbojas bez kļūdām
                    </div>
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
      <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </h2>
      {children}
    </section>
  );
}

function ContextEmpty({ message, inline }: { message: string; inline?: boolean }) {
  if (inline) {
    return (
      <p className="text-sm text-muted-foreground">{message}</p>
    );
  }
  return (
    <div className="col-span-full rounded-lg border border-dashed border-border bg-card px-3 py-2 text-sm text-muted-foreground">
      {message}
    </div>
  );
}

function AttentionPanel({
  items,
}: {
  items: Array<{ key: string; severity: "danger" | "warning"; title: string; detail?: string; to?: string }>;
}) {
  const dangerCount = items.filter((i) => i.severity === "danger").length;
  return (
    <section
      className={cn(
        "rounded-xl border bg-card p-4",
        dangerCount > 0 ? "border-danger/40" : "border-warning/40",
      )}
    >
      <div className="mb-2 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <AlertCircle
            className={cn(
              "h-4 w-4",
              dangerCount > 0 ? "text-danger" : "text-warning",
            )}
          />
          Nepieciešama uzmanība
          <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium tabular-nums text-foreground">
            {items.length}
          </span>
        </h2>
      </div>
      <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {items.map((it) => {
          const content = (
            <div
              className={cn(
                "flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm",
                it.severity === "danger"
                  ? "border-danger/30 bg-danger/5"
                  : "border-warning/30 bg-warning/5",
              )}
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-foreground">{it.title}</p>
                {it.detail && (
                  <p className="truncate text-xs text-muted-foreground">{it.detail}</p>
                )}
              </div>
              {it.to && <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
            </div>
          );
          return (
            <li key={it.key}>
              {it.to ? (
                <Link to={it.to} className="block hover:opacity-90">
                  {content}
                </Link>
              ) : (
                content
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function HeroStat({
  label,
  value,
  hint,
  icon,
  accent,
  to,
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: React.ReactNode;
  accent?: "primary" | "success" | "warning" | "danger";
  to?: string;
}) {
  const accentClass =
    accent === "success"
      ? "before:bg-success"
      : accent === "warning"
        ? "before:bg-warning"
        : accent === "danger"
          ? "before:bg-danger"
          : "before:bg-primary";
  const body = (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border border-border bg-card p-4 shadow-sm transition-colors",
        "before:absolute before:left-0 before:top-0 before:h-full before:w-1",
        accentClass,
        to && "hover:border-primary/40 hover:bg-accent/30",
      )}
    >
      <div className="flex items-start justify-between">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        {icon && <span className="text-muted-foreground">{icon}</span>}
      </div>
      <p className="mt-1 text-3xl font-semibold tabular-nums text-foreground lg:text-[2rem]">
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">{hint}</p>}
    </div>
  );
  return to ? <Link to={to}>{body}</Link> : body;
}

function CompactStat({
  label,
  value,
  hint,
  to,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  to?: string;
  tone?: "warning" | "danger" | "success";
}) {
  const toneClass =
    tone === "danger"
      ? "text-danger"
      : tone === "warning"
        ? "text-warning"
        : tone === "success"
          ? "text-success"
          : "text-foreground";
  const body = (
    <div
      className={cn(
        "rounded-lg border border-border bg-card px-3 py-2.5 transition-colors",
        to && "hover:border-primary/40 hover:bg-accent/30",
      )}
    >
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground line-clamp-1">
        {label}
      </p>
      <p className={cn("mt-0.5 text-base font-semibold tabular-nums", toneClass)}>{value}</p>
      {hint && (
        <p className="mt-0.5 text-[11px] text-muted-foreground line-clamp-1">{hint}</p>
      )}
    </div>
  );
  return to ? <Link to={to}>{body}</Link> : body;
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
    <section className={cn("flex flex-col rounded-xl border border-border bg-card p-4", className)}>
      <div className="mb-2.5">
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
    <ul className="space-y-2">
      {rows.map((r) => {
        const widthPct = (r.count / max) * 100;
        const share = sum > 0 ? (r.count / sum) * 100 : 0;
        return (
          <li key={r.label}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate text-foreground">{r.label}</span>
              <span className="tabular-nums text-muted-foreground">
                {fmt(r.count)}
                <span className="ml-2 text-xs">{r.extra ?? `(${share.toFixed(1)}%)`}</span>
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
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
    <ul className="space-y-2.5">
      {rows.map((r) => {
        const w = (r.active / max) * 100;
        return (
          <li key={r.name} className="flex items-center gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary text-[11px] font-semibold text-foreground">
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

function FunnelChart({
  rows,
  lost,
}: {
  rows: Array<{ label: string; count: number; prev: number | null; conv: number; drop: number; dropPct: number; totalShare: number }>;
  lost: Array<{ label: string; count: number }>;
}) {
  const top = rows[0]?.count || 0;
  if (top === 0) {
    return <ContextEmpty inline message="Piltuvē vēl nav datu" />;
  }
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {rows.map((r, i) => {
          const widthPct = top > 0 ? Math.max(8, (r.count / top) * 100) : 0;
          const tone =
            r.dropPct >= 50
              ? "bg-warning/80"
              : r.dropPct >= 25
                ? "bg-primary/70"
                : "bg-primary";
          return (
            <div key={r.label}>
              <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                <span className="text-foreground">{r.label}</span>
                <span className="flex items-center gap-2 text-xs tabular-nums text-muted-foreground">
                  {i > 0 && r.prev != null && r.prev > 0 && (
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 text-[10px] font-medium",
                        r.conv >= 50
                          ? "bg-success/15 text-success"
                          : r.conv >= 25
                            ? "bg-secondary text-foreground"
                            : "bg-warning/15 text-warning",
                      )}
                      title="Konversija no iepriekšējā posma"
                    >
                      {r.conv.toFixed(0)}% konv.
                    </span>
                  )}
                  <span className="font-medium text-foreground">{fmt(r.count)}</span>
                  <span>({r.totalShare.toFixed(0)}%)</span>
                </span>
              </div>
              <div className="relative flex h-7 items-center">
                <div
                  className={cn("h-full rounded-md transition-all", tone)}
                  style={{ width: `${widthPct}%` }}
                />
                {i > 0 && r.drop > 0 && (
                  <span className="ml-2 inline-flex items-center gap-1 text-[11px] text-warning">
                    <AlertTriangle className="h-3 w-3" />
                    −{fmt(r.drop)} ({r.dropPct.toFixed(0)}% zudums)
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {lost.length > 0 && (
        <div className="border-t border-border pt-2">
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Aizgājuši no piltuves
          </p>
          <div className="flex flex-wrap gap-1.5">
            {lost.map((l) => (
              <span
                key={l.label}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary/50 px-2 py-0.5 text-xs"
              >
                <span className="text-muted-foreground">{l.label}</span>
                <span className="font-medium tabular-nums text-foreground">{fmt(l.count)}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Sparkline({
  rows,
}: {
  rows: Array<{ date: string; leads: number; status: number; comms: number; total: number }>;
}) {
  const w = 600;
  const h = 110;
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
      <svg viewBox={`0 0 ${w} ${h}`} className="h-24 w-full" preserveAspectRatio="none">
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
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
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
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <ul className="space-y-2">
          {bars.map((b) => {
            const tone =
              b.value >= 80 ? "bg-success" : b.value >= 50 ? "bg-primary/70" : "bg-warning";
            return (
              <li key={b.label}>
                <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                  <span className="text-foreground">{b.label}</span>
                  <span className="tabular-nums text-muted-foreground">{b.value.toFixed(1)}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                  <div
                    className={cn("h-full rounded-full", tone)}
                    style={{ width: `${Math.min(100, b.value)}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
        <div className="flex flex-col gap-2.5">
          <p className="text-sm text-muted-foreground">
            Kopā leadi sistēmā:{" "}
            <span className="font-medium text-foreground tabular-nums">{fmt(total)}</span>
          </p>
          {issues.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {issues.map((i) => (
                <span
                  key={i.label}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-full border px-2.5 py-0.5 text-xs",
                    i.value >= 30
                      ? "border-warning/40 bg-warning/10 text-foreground"
                      : "border-border bg-secondary/50 text-foreground",
                  )}
                >
                  {i.label}
                  <span className="tabular-nums font-medium">{i.value.toFixed(1)}%</span>
                </span>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-success" />
              Datu kvalitāte ir augsta
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
