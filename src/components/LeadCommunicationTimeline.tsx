import { useQuery } from "@tanstack/react-query";
import { ArrowDownLeft, ArrowUpRight, CheckCircle2, MousePointerClick, MessageSquareReply, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { fetchCrmView } from "@/server/analytics";
import { cn } from "@/lib/utils";
import { LoadingState, ErrorState } from "@/components/DataState";

type Row = Record<string, unknown>;

function s(v: unknown): string {
  if (v == null) return "";
  return String(v);
}
function num(v: unknown): number {
  const x = typeof v === "string" ? parseFloat(v) : Number(v);
  return Number.isFinite(x) ? x : 0;
}
function fmtDateTime(value: unknown): string {
  const str = s(value);
  if (!str) return "—";
  const d = new Date(str);
  if (Number.isNaN(d.getTime())) return str;
  return new Intl.DateTimeFormat("lv-LV", {
    timeZone: "Europe/Riga",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function isInbound(row: Row): boolean {
  const dir = s(row.direction).toLowerCase();
  if (dir === "inbound" || dir === "in") return true;
  if (dir === "outbound" || dir === "out") return false;
  // fallback: timeline_label hints
  const lbl = s(row.timeline_label).toLowerCase();
  return lbl.includes("ienāk") || lbl.includes("inbound") || lbl.includes("saņem");
}

export function LeadCommunicationTimeline({ leadId }: { leadId: string | null }) {
  const view = useQuery({
    queryKey: ["crm", "lead_communication_timeline", leadId ?? ""],
    queryFn: () =>
      fetchCrmView({
        data: {
          view: "lead_communication_timeline",
          query: `lead_id=eq.${encodeURIComponent(leadId ?? "")}&order=timeline_at.desc&limit=200`,
        },
      }),
    enabled: !!leadId,
    staleTime: 30_000,
  });

  if (view.isLoading) return <LoadingState />;
  if (view.data?.error) return <ErrorState message={view.data.error} />;

  const rows = (view.data?.rows ?? []) as Row[];
  if (rows.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
        Komunikāciju vēsture vēl nav pieejama.
      </div>
    );
  }

  return (
    <ol className="relative space-y-3 border-l border-border pl-4">
      {rows.map((row, idx) => (
        <TimelineItem key={s(row.communication_id) || s(row.timeline_at) + idx} row={row} />
      ))}
    </ol>
  );
}

function TimelineItem({ row }: { row: Row }) {
  const inbound = isInbound(row);
  const channel = s(row.channel) || s(row.timeline_channel);
  const label = s(row.timeline_label);
  const subject = s(row.subject);
  const preview = s(row.message_preview);
  const status = s(row.current_status);
  const latestEvent = s(row.latest_event_type);
  const fromAddress = s(row.from_address);
  const isEmail = channel.toLowerCase().includes("email") || channel.toLowerCase().includes("e-pasts");

  const delivered = num(row.delivered_count);
  const clicked = num(row.clicked_count);
  const replied = num(row.replied_count);
  const failed = num(row.failed_count);
  const showStats = !inbound && isEmail && (delivered + clicked + replied + failed > 0);

  return (
    <li className="relative">
      <span
        className={cn(
          "absolute -left-[21px] top-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full ring-2 ring-background",
          inbound ? "bg-primary" : "bg-muted-foreground/60",
        )}
      >
        {inbound ? (
          <ArrowDownLeft className="h-2 w-2 text-primary-foreground" />
        ) : (
          <ArrowUpRight className="h-2 w-2 text-background" />
        )}
      </span>
      <div
        className={cn(
          "rounded-md border p-3",
          inbound ? "border-primary/30 bg-primary/5" : "border-border bg-background",
        )}
      >
        <div className="flex flex-wrap items-center gap-2">
          {channel && (
            <Badge variant="outline" className="h-5 rounded px-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {channel}
            </Badge>
          )}
          {label && (
            <span className="text-xs font-medium text-foreground">{label}</span>
          )}
          <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">
            {fmtDateTime(row.timeline_at)}
          </span>
        </div>

        {subject && (
          <div className="mt-1.5 text-sm font-medium text-foreground">{subject}</div>
        )}
        {inbound && isEmail && fromAddress && (
          <div className="mt-1 text-[11px] text-muted-foreground">
            <span className="text-muted-foreground/70">No: </span>
            <span className="font-medium text-foreground">{fromAddress}</span>
          </div>
        )}
        {preview && (
          <div className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
            {preview}
          </div>
        )}

        {(status || latestEvent) && (
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            {status && (
              <span>
                <span className="text-muted-foreground/70">Statuss: </span>
                {status}
              </span>
            )}
            {latestEvent && (
              <span>
                <span className="text-muted-foreground/70">Pēdējais notikums: </span>
                {latestEvent}
              </span>
            )}
          </div>
        )}

        {showStats && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Stat icon={<CheckCircle2 className="h-3 w-3" />} value={delivered} label="piegādāti" tone="muted" />
            <Stat icon={<MousePointerClick className="h-3 w-3" />} value={clicked} label="klikšķi" tone="muted" />
            <Stat icon={<MessageSquareReply className="h-3 w-3" />} value={replied} label="atbildes" tone="muted" />
            <Stat icon={<AlertTriangle className="h-3 w-3" />} value={failed} label="kļūdas" tone={failed > 0 ? "danger" : "muted"} />
          </div>
        )}
      </div>
    </li>
  );
}

function Stat({
  icon,
  value,
  label,
  tone,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
  tone: "muted" | "danger";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] tabular-nums",
        tone === "danger"
          ? "border-destructive/40 bg-destructive/5 text-destructive"
          : "border-border bg-muted/40 text-muted-foreground",
      )}
    >
      {icon}
      <span className="font-semibold">{value}</span>
      <span>{label}</span>
    </span>
  );
}
