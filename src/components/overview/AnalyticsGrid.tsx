import { useMemo } from "react";

type Row = Record<string, unknown>;

function num(v: unknown): number {
  const n = typeof v === "string" ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : 0;
}
const fmt = (n: number) => new Intl.NumberFormat("lv-LV").format(n);

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

export default function AnalyticsGrid({
  funnel,
  ppv,
  country,
  workflow,
  totalLeads,
}: {
  funnel: Row[];
  ppv: Row[];
  country: Row[];
  workflow: Row[];
  totalLeads: number;
}) {
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

  const ppvRows = useMemo(
    () =>
      ppv
        .map((r) => ({
          label: String(r.ppv ?? "—"),
          count: num(r.aktivie_leadi),
          extra: `${fmt(num(r.ieguti))} iegūti`,
        }))
        .filter((r) => r.label !== "—" && r.count > 0)
        .slice(0, 8),
    [ppv],
  );

  const countryRows = useMemo(
    () =>
      country
        .map((r) => ({
          label: String(r.valsts ?? "—"),
          count: num(r.leadu_skaits),
          extra: num(r.konversijas_pct) > 0 ? `${num(r.konversijas_pct).toFixed(1)}% konv.` : undefined,
        }))
        .filter((r) => r.label !== "—" && r.count > 0)
        .slice(0, 8),
    [country],
  );

  const workflowRows = useMemo(
    () =>
      workflow
        .map((r) => ({
          name: String(r.workflow ?? "—"),
          total: num(r.kopa),
          active: num(r.aktivi),
          done: num(r.pabeigti),
          errors: num(r.kludas),
        }))
        .filter((r) => r.total > 0),
    [workflow],
  );

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {funnelRows.length > 0 && (
        <Card title="Pārdošanas funnel" subtitle="Leadi pa statusiem">
          <BarList rows={funnelRows} total={totalLeads || funnelRows.reduce((s, r) => s + r.count, 0)} />
        </Card>
      )}
      {ppvRows.length > 0 && (
        <Card title="PPV slodze" subtitle="Aktīvie leadi pa pārstāvjiem">
          <BarList rows={ppvRows} />
        </Card>
      )}
      {countryRows.length > 0 && (
        <Card title="Valstu sadalījums" subtitle="Leadi pa valstīm">
          <BarList rows={countryRows} />
        </Card>
      )}
      {workflowRows.length > 0 && (
        <Card title="Workflow stāvoklis" subtitle="Instances pa procesiem">
          <WorkflowList rows={workflowRows} />
        </Card>
      )}
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
              <div className="h-full rounded-full bg-foreground/60" style={{ width: `${widthPct}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function WorkflowList({
  rows,
}: {
  rows: Array<{ name: string; total: number; active: number; done: number; errors: number }>;
}) {
  return (
    <ul className="divide-y divide-border">
      {rows.map((r) => (
        <li key={r.name} className="flex items-center justify-between gap-3 py-2.5">
          <span className="truncate text-sm text-foreground">{r.name}</span>
          <div className="flex items-center gap-4 text-sm tabular-nums">
            <Stat label="Aktīvi" value={r.active} />
            <Stat label="Pabeigti" value={r.done} />
            <Stat label="Kļūdas" value={r.errors} warn={r.errors > 0} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function Stat({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className="flex flex-col items-end leading-tight">
      <span
        className={
          warn && value > 0
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
