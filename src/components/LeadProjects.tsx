import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { fetchCrmView } from "@/server/analytics";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/button";
import { LoadingState, ErrorState } from "@/components/DataState";

type Row = Record<string, unknown>;

const DASH = "—";

function s(v: unknown): string {
  if (v == null) return "";
  return String(v);
}
function fmtDate(value: unknown): string {
  const str = s(value);
  if (!str) return DASH;
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
  return x || DASH;
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

const REAL_STATES = new Set([
  "Pieprasījums",
  "Piedāvājums",
  "Līgums",
  "Atcelts",
  "Atlikts",
  "Pabeigts",
]);

function deriveStatus(row: Row, offers: Row[], contracts: Row[]): string {
  if (s(row.completed_at)) return "Pabeigts";
  if (s(row.cancelled_at)) return "Atcelts";
  if (s(row.postponed_at)) return "Atlikts";
  if (contracts.length > 0) return "Līgums";
  if (offers.length > 0) return "Piedāvājums";
  if (s(row.request_at)) return "Pieprasījums";
  const sales = s(row.sales_status);
  if (sales && REAL_STATES.has(sales)) return sales;
  return "";
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
  if (q.data?.error) {
    return (
      <div className="rounded-md border border-dashed border-border bg-muted/10 px-4 py-6 text-center text-sm text-muted-foreground">
        Projektu dati vēl nav pieejami.
      </div>
    );
  }

  const rows = (q.data?.rows ?? []) as Row[];

  return (
    <div className="space-y-2">
      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-md border border-dashed border-border bg-muted/20 px-4 py-8 text-center">
          <div className="text-xs text-muted-foreground">
            Šim lead'am vēl nav pievienots objekts.
          </div>
          <Button
            variant="default"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            disabled
            title="Objekta pievienošana būs nākamais solis"
          >
            <Plus className="h-3.5 w-3.5" />
            Pievienot objektu
          </Button>
        </div>
      ) : (
        <>
          {rows.map((r, i) => (
            <ProjectCard key={s(r.object_id) || String(i)} row={r} />
          ))}
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-full justify-center gap-1.5 text-xs"
            disabled
            title="Objekta pievienošana būs nākamais solis"
          >
            <Plus className="h-3.5 w-3.5" />
            Pievienot objektu
          </Button>
        </>
      )}
    </div>
  );
}

function ProjectCard({ row }: { row: Row }) {
  const objectName = s(row.object_name) || DASH;
  const country = s(row.country);
  const offers = asArray(row.offers);
  const contracts = asArray(row.contracts);
  const status = deriveStatus(row, offers, contracts);

  return (
    <div className="rounded-md border border-border bg-card">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-border/60 px-2.5 py-1.5">
        <div className="text-[13px] font-semibold text-foreground">{objectName}</div>
        {country && (
          <Badge variant="outline" className="h-4 rounded px-1 text-[10px] font-medium leading-none">
            {country}
          </Badge>
        )}
        {status && <StatusBadge status={status} />}
      </div>

      {/* Detail grid */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 px-2.5 py-2">
        <Row label="Adrese" value={or(row.address)} />
        <Row label="Zeme" value={or(row.land_status)} />
        <Row label="Projekts" value={or(row.project_status)} />
        <Row label="Kad grib būvēt" value={or(row.planned_building_text)} />
      </div>

      {/* Timeline */}
      <div className="border-t border-border/60 px-2.5 py-1.5 space-y-0.5">
        <TLine label="Pieprasījums" value={fmtDate(row.request_at)} />
        <TLineMulti
          label="Piedāvājumi"
          items={offers.map((o) => ({
            date: fmtDate(o.sent_at),
            note: s(o.title) || s(o.offer_number) || s(o.status),
          }))}
        />
        <TLineMulti
          label="Līgumi"
          items={contracts.map((c) => ({
            date: fmtDate(c.signed_at),
            note: s(c.title) || s(c.contract_number) || s(c.status),
          }))}
        />
        <TLine label="Atcelts" value={fmtDate(row.cancelled_at)} />
        <TLine label="Atlikts" value={fmtDate(row.postponed_at)} />
        <TLine label="Pabeigts" value={fmtDate(row.completed_at)} />
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  const muted = value === DASH;
  return (
    <div className="flex items-baseline gap-1.5 min-w-0 text-[12px] leading-tight">
      <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground/80">
        {label}
      </span>
      <span className={`truncate font-medium ${muted ? "text-muted-foreground" : "text-foreground"}`}>
        {value}
      </span>
    </div>
  );
}

function TLine({ label, value }: { label: string; value: string }) {
  const muted = value === DASH;
  return (
    <div className="flex items-center justify-between gap-2 text-[11px] leading-tight">
      <span className="text-muted-foreground">{label}</span>
      <span className={`tabular-nums font-medium ${muted ? "text-muted-foreground" : "text-foreground"}`}>
        {value}
      </span>
    </div>
  );
}

function TLineMulti({
  label,
  items,
}: {
  label: string;
  items: { date: string; note?: string }[];
}) {
  if (items.length === 0) return <TLine label={label} value={DASH} />;
  return (
    <div className="text-[11px] leading-tight">
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums font-medium text-foreground">{items[0].date}</span>
      </div>
      {items.length > 1 && (
        <div className="ml-2 mt-0.5 space-y-0.5">
          {items.slice(1).map((it, i) => (
            <div key={i} className="flex items-center justify-between gap-2 text-muted-foreground">
              <span className="truncate">{it.note || "·"}</span>
              <span className="tabular-nums">{it.date}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
