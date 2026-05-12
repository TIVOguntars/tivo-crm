import { useMemo } from "react";

type Row = Record<string, unknown>;

function num(v: unknown): number {
  const n = typeof v === "string" ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : 0;
}
const fmt = (n: number) => new Intl.NumberFormat("lv-LV").format(n);
const pct = (n: number) => `${num(n).toFixed(1)}%`;

export default function OperationalGrid({
  timeline,
  commPerf,
  importQuality,
  tasks,
  commsSummary,
}: {
  timeline: Row[];
  commPerf: Row[];
  importQuality: Row[];
  tasks: Row[];
  commsSummary: Row | null;
}) {
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

  const commRows = useMemo(
    () =>
      commPerf
        .map((r) => ({
          channel: String(r.kanals ?? "—"),
          sent: num(r.nosutiti),
          replies: num(r.atbildes),
          clicks: num(r.klikski),
          errors: num(r.kludas),
          replyPct: num(r.atbildes_pct),
          clickPct: num(r.klikskinasanas_pct),
        }))
        .filter((r) => r.sent > 0 || r.replies > 0),
    [commPerf],
  );

  const importRows = useMemo(
    () =>
      importQuality
        .map((r) => ({
          source: String(r.avots ?? "—"),
          count: num(r.leadu_skaits),
          full: num(r.pilni_kontakti),
          fullPct: num(r.pilnums_pct),
          week: num(r.pedeja_nedela),
        }))
        .filter((r) => r.count > 0)
        .slice(0, 8),
    [importQuality],
  );

  const taskRows = useMemo(
    () =>
      tasks
        .map((r) => ({
          group: String(r.grupa ?? "—"),
          total: num(r.uzdevumi),
          high: num(r.augsta_prioritate),
          auto: num(r.automatizeti),
          manual: num(r.manualie),
        }))
        .filter((r) => r.total > 0),
    [tasks],
  );

  const showTimeline = tlRows.some((r) => r.total > 0);
  const showComms = commRows.length > 0;
  const showImports = importRows.length > 0;
  const showTasks = taskRows.length > 0;
  const showSummary = commsSummary && num(commsSummary.nosutiti) + num(commsSummary.atbildes) > 0;

  if (!showTimeline && !showComms && !showImports && !showTasks && !showSummary) {
    return null;
  }

  return (
    <div className="space-y-4">
      {showSummary && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Stat label="Nosūtīti (30d)" value={fmt(num(commsSummary!.nosutiti))} />
          <Stat label="Piegādāti" value={fmt(num(commsSummary!.piegadati))} />
          <Stat label="Atbildes" value={fmt(num(commsSummary!.atbildes))} hint={pct(num(commsSummary!.atbildes_pct))} />
          <Stat label="Klikšķi" value={fmt(num(commsSummary!.klikski))} />
          <Stat
            label="Kļūdas"
            value={fmt(num(commsSummary!.kludas))}
            hint={num(commsSummary!.kludu_pct) > 0 ? pct(num(commsSummary!.kludu_pct)) : undefined}
          />
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {showTimeline && (
          <Card title="Aktivitātes (30 dienas)" subtitle="Jauni leadi, statusu maiņas, komunikācijas">
            <Sparkline rows={tlRows} />
          </Card>
        )}
        {showComms && (
          <Card title="Komunikāciju kanāli" subtitle="Pēdējās 90 dienas">
            <ul className="space-y-2.5">
              {commRows.map((r) => (
                <li key={r.channel}>
                  <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                    <span className="text-foreground">{r.channel}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {fmt(r.sent)} nos.
                      <span className="ml-2 text-xs">
                        {pct(r.replyPct)} atb.
                      </span>
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-secondary">
                    <div className="h-full rounded-full bg-primary/70" style={{ width: `${Math.min(100, r.replyPct)}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}
        {showTasks && (
          <Card title="Uzdevumu rinda" subtitle="Atvērto darbību sadalījums">
            <ul className="divide-y divide-border">
              {taskRows.map((r) => (
                <li key={r.group} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-foreground">{r.group}</p>
                    <p className="text-[11px] text-muted-foreground">
                      Manuāli: {fmt(r.manual)} · Automatizēti: {fmt(r.auto)}
                    </p>
                  </div>
                  <div className="flex items-center gap-4 text-sm tabular-nums">
                    <MiniStat label="Kopā" value={r.total} />
                    <MiniStat label="Augsta" value={r.high} warn={r.high > 0} />
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}
        {showImports && (
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
                    <div className="h-full rounded-full bg-foreground/60" style={{ width: `${Math.min(100, r.fullPct)}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
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
        {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      <div className="flex-1">{children}</div>
    </section>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground line-clamp-1">
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function MiniStat({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className="flex flex-col items-end leading-tight">
      <span
        className={
          warn
            ? "font-semibold text-amber-600 dark:text-amber-500"
            : "font-medium text-foreground"
        }
      >
        {fmt(value)}
      </span>
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
    </div>
  );
}

function Sparkline({
  rows,
}: {
  rows: Array<{ date: string; leads: number; status: number; comms: number; total: number }>;
}) {
  const w = 600;
  const h = 140;
  const pad = 8;
  const max = Math.max(1, ...rows.map((r) => r.total));
  const step = rows.length > 1 ? (w - pad * 2) / (rows.length - 1) : 0;

  const series = [
    { key: "leads" as const, color: "hsl(var(--primary))", label: "Jauni leadi" },
    { key: "comms" as const, color: "hsl(var(--foreground))", label: "Komunikācijas" },
    { key: "status" as const, color: "hsl(var(--muted-foreground))", label: "Statusi" },
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
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} className="h-32 w-full" preserveAspectRatio="none">
        {series.map((s) => (
          <path
            key={s.key}
            d={path(s.key)}
            fill="none"
            stroke={s.color}
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={s.key === "leads" ? 0.95 : s.key === "comms" ? 0.7 : 0.45}
          />
        ))}
      </svg>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <LegendDot color="bg-primary" label={`Jauni leadi: ${fmt(totalLeads)}`} />
        <LegendDot color="bg-foreground/70" label={`Komunikācijas: ${fmt(totalComms)}`} />
        <LegendDot color="bg-muted-foreground/70" label="Statusu maiņas" />
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