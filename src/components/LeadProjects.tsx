import { useQuery } from "@tanstack/react-query";
import { MapPin, FileText, Calendar, Send, FileSignature, XCircle, PauseCircle, CheckCircle2, Plus } from "lucide-react";
import { fetchCrmView } from "@/server/analytics";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingState, ErrorState } from "@/components/DataState";

type Row = Record<string, unknown>;

function s(v: unknown): string {
  if (v == null) return "";
  return String(v);
}
function b(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return v === "true" || v === "t" || v === "1";
  return !!v;
}
function fmtDate(value: unknown): string {
  const str = s(value);
  if (!str) return "Nav";
  const d = new Date(str);
  if (Number.isNaN(d.getTime())) return str;
  return new Intl.DateTimeFormat("lv-LV", {
    timeZone: "Europe/Riga",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}
function or(v: unknown): string {
  const x = s(v).trim();
  return x || "Nav";
}
function asArray(v: unknown): Row[] {
  if (Array.isArray(v)) return v as Row[];
  if (typeof v === "string") {
    try {
      const j = JSON.parse(v);
      return Array.isArray(j) ? (j as Row[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function LeadProjects({ leadId }: { leadId: string | null }) {
  const q = useQuery({
    queryKey: ["crm", "lead_project_overview", leadId ?? ""],
    queryFn: () =>
      fetchCrmView({
        data: {
          view: "lead_project_overview",
          query: `lead_id=eq.${encodeURIComponent(leadId ?? "")}&order=is_primary_object.desc,object_created_at.desc&limit=100`,
        },
      }),
    enabled: !!leadId,
    staleTime: 30_000,
  });

  if (!leadId) return null;
  if (q.isLoading) return <LoadingState />;
  if (q.data?.error) return <ErrorState message={q.data.error} />;

  const rows = (q.data?.rows ?? []) as Row[];

  return (
    <div className="space-y-3">
      {rows.length === 0 ? (
        <div className="flex h-32 items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 px-4 text-center text-sm text-muted-foreground">
          Projekta informācija vēl nav pievienota.
        </div>
      ) : (
        rows.map((r, i) => <ProjectCard key={s(r.object_id) || String(i)} row={r} />)
      )}

      <Button
        variant="outline"
        size="sm"
        className="w-full justify-center gap-1.5"
        disabled
        title="Objekta pievienošana būs nākamais solis"
      >
        <Plus className="h-3.5 w-3.5" />
        Pievienot objektu
      </Button>
      <p className="text-center text-[11px] text-muted-foreground">
        Objekta pievienošana būs nākamais solis
      </p>
    </div>
  );
}

function ProjectCard({ row }: { row: Row }) {
  const objectName = s(row.object_name) || "—";
  const country = s(row.country);
  const salesStatus = s(row.sales_status);
  const isPrimary = b(row.is_primary_object);
  const offers = asArray(row.offers);
  const contracts = asArray(row.contracts);

  return (
    <div className="rounded-lg border border-border bg-card shadow-sm">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border/60 bg-muted/30 px-4 py-2.5">
        <div className="text-sm font-semibold text-foreground">{objectName}</div>
        {country && (
          <Badge variant="outline" className="h-5 rounded-md px-1.5 text-[10px] font-medium">
            {country}
          </Badge>
        )}
        {salesStatus && (
          <Badge variant="secondary" className="h-5 rounded-md px-1.5 text-[10px] font-medium">
            {salesStatus}
          </Badge>
        )}
        {isPrimary && (
          <Badge className="h-5 rounded-md bg-primary/15 px-1.5 text-[10px] font-medium text-primary border-transparent hover:bg-primary/20">
            Primārais objekts
          </Badge>
        )}
      </div>

      {/* Main fields */}
      <dl className="grid grid-cols-1 gap-x-4 gap-y-2 px-4 py-3 sm:grid-cols-2">
        <Field icon={<MapPin className="h-3.5 w-3.5" />} label="Adrese" value={or(row.address)} />
        <Field label="Zeme" value={or(row.land_status)} />
        <Field label="Projekts" value={or(row.project_status)} />
        <Field label="Kad grib būvēt" value={or(row.planned_building_text)} />
        <Field label="Objekta statuss" value={or(row.sales_status)} />
      </dl>

      {/* Timeline */}
      <div className="space-y-1.5 border-t border-border/60 px-4 py-3">
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Laika josla
        </div>

        <TimelineRow
          icon={<Calendar className="h-3.5 w-3.5 text-muted-foreground" />}
          label="Pieprasījums"
          value={fmtDate(row.request_at)}
        />

        <TimelineGroup
          icon={<Send className="h-3.5 w-3.5 text-muted-foreground" />}
          label="Piedāvājumi"
          items={offers.map((o) => ({
            primary: fmtDate(o.sent_at),
            secondary: s(o.title) || s(o.offer_number) || s(o.status),
          }))}
        />

        <TimelineGroup
          icon={<FileSignature className="h-3.5 w-3.5 text-muted-foreground" />}
          label="Līgumi"
          items={contracts.map((c) => ({
            primary: fmtDate(c.signed_at),
            secondary: s(c.title) || s(c.contract_number) || s(c.status),
          }))}
        />

        <TimelineRow
          icon={<XCircle className="h-3.5 w-3.5 text-muted-foreground" />}
          label="Atcelts"
          value={fmtDate(row.cancelled_at)}
        />
        <TimelineRow
          icon={<PauseCircle className="h-3.5 w-3.5 text-muted-foreground" />}
          label="Atlikts"
          value={fmtDate(row.postponed_at)}
        />
        <TimelineRow
          icon={<CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground" />}
          label="Pabeigts"
          value={fmtDate(row.completed_at)}
        />
      </div>
    </div>
  );
}

function Field({
  icon,
  label,
  value,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md border border-border/60 bg-background/40 px-3 py-2">
      <dt className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/80">
        {icon}
        {label}
      </dt>
      <dd className="mt-0.5 text-sm font-medium text-foreground break-words">{value}</dd>
    </div>
  );
}

function TimelineRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className="font-medium text-foreground tabular-nums">{value}</span>
    </div>
  );
}

function TimelineGroup({
  icon,
  label,
  items,
}: {
  icon: React.ReactNode;
  label: string;
  items: { primary: string; secondary?: string }[];
}) {
  if (items.length === 0) {
    return <TimelineRow icon={icon} label={label} value="Nav" />;
  }
  return (
    <div className="text-xs">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-1 ml-5 space-y-0.5">
        {items.map((it, i) => (
          <div key={i} className="flex items-center justify-between gap-2">
            <span className="text-foreground/80 truncate">{it.secondary || "—"}</span>
            <span className="font-medium text-foreground tabular-nums">{it.primary}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
