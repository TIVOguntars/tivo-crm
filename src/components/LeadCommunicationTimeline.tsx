import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownLeft, ArrowUpRight, CheckCircle2, MousePointerClick, MessageSquareReply, AlertTriangle, Paperclip, Reply, Forward, X } from "lucide-react";
import DOMPurify from "isomorphic-dompurify";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { fetchCrmView, fetchPublicTable } from "@/server/analytics";
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

  const [viewerId, setViewerId] = useState<string | null>(null);

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
    <>
      <ol className="relative space-y-3 border-l border-border pl-4">
        {rows.map((row, idx) => (
          <TimelineItem
            key={s(row.communication_id) || s(row.timeline_at) + idx}
            row={row}
            onOpen={(id) => setViewerId(id)}
          />
        ))}
      </ol>
      <CommunicationViewerModal
        communicationId={viewerId}
        onClose={() => setViewerId(null)}
      />
    </>
  );
}

function TimelineItem({ row, onOpen }: { row: Row; onOpen: (id: string) => void }) {
  const inbound = isInbound(row);
  const channel = s(row.channel) || s(row.timeline_channel);
  const label = s(row.timeline_label);
  const subject = s(row.subject);
  const preview = s(row.message_preview);
  const status = s(row.current_status);
  const latestEvent = s(row.latest_event_type);
  const fromAddress = s(row.from_address);
  const isEmail = channel.toLowerCase().includes("email") || channel.toLowerCase().includes("e-pasts");
  const commId = s(row.communication_id);

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
        role={commId ? "button" : undefined}
        tabIndex={commId ? 0 : undefined}
        onClick={() => commId && onOpen(commId)}
        onKeyDown={(e) => {
          if (commId && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            onOpen(commId);
          }
        }}
        className={cn(
          "rounded-md border p-3 transition-colors",
          inbound ? "border-primary/30 bg-primary/5" : "border-border bg-background",
          commId &&
            "cursor-pointer hover:border-primary/60 hover:bg-accent/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
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

/* ---------------------- Communication Viewer Modal ---------------------- */

function getAttachments(comm: Row | null): string[] {
  if (!comm) return [];
  const meta = (comm.metadata ?? null) as Record<string, unknown> | null;
  if (!meta) return [];
  let raw: unknown =
    meta.attachment_names ?? meta.attachments ?? meta.attachment_filenames ?? null;
  if (typeof raw === "string") {
    const str = raw;
    try { raw = JSON.parse(str); } catch { return [str]; }
  }
  if (!Array.isArray(raw)) return [];
  return raw
    .map((a) => {
      if (typeof a === "string") return a;
      if (a && typeof a === "object") {
        const o = a as Record<string, unknown>;
        return String(o.filename ?? o.name ?? o.file ?? "").trim();
      }
      return "";
    })
    .filter(Boolean);
}

/* ---- Email body rendering helpers ---- */

const QUOTE_REGEXES: RegExp[] = [
  /^-{2,}\s*Original Message\s*-{2,}/im,
  /^_{5,}\s*$/m,
  /^From:\s.+$/im,
  /^On\s.+wrote:\s*$/im,
  /^Sent:\s.+$/im,
  /^От:\s.+$/im,
  /^No:\s.+$/im, // Latvian "From:"
  /^Nosūtīts:\s.+$/im,
];

function splitQuotedText(text: string): { main: string; quoted: string } {
  let cutAt = -1;
  for (const re of QUOTE_REGEXES) {
    const m = text.match(re);
    if (m && m.index != null && (cutAt === -1 || m.index < cutAt)) {
      cutAt = m.index;
    }
  }
  if (cutAt <= 0) return { main: text, quoted: "" };
  return {
    main: text.slice(0, cutAt).trimEnd(),
    quoted: text.slice(cutAt).trim(),
  };
}

function splitQuotedHtml(html: string): { main: string; quoted: string } {
  if (typeof window === "undefined" || typeof DOMParser === "undefined") {
    return { main: html, quoted: "" };
  }
  try {
    const doc = new DOMParser().parseFromString(`<div id="__r">${html}</div>`, "text/html");
    const root = doc.getElementById("__r");
    if (!root) return { main: html, quoted: "" };

    // Common quoted markers across email clients
    const selectors = [
      "blockquote",
      ".gmail_quote",
      ".gmail_attr",
      "div.yahoo_quoted",
      "div#OLK_SRC_BODY_SECTION",
      "div.OutlookMessageHeader",
      "div[id^='divRplyFwdMsg']",
      "hr#stopSpelling",
    ];
    let firstQuoted: Element | null = null;
    for (const sel of selectors) {
      const el = root.querySelector(sel);
      if (el && (!firstQuoted || (firstQuoted.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_PRECEDING))) {
        firstQuoted = el;
      }
    }
    if (!firstQuoted) {
      // text-based fallback
      const fullText = root.textContent ?? "";
      const { quoted } = splitQuotedText(fullText);
      if (!quoted) return { main: html, quoted: "" };
      return { main: html, quoted: "" };
    }

    // Build quoted fragment by extracting firstQuoted + all following siblings up the tree
    const quotedContainer = doc.createElement("div");
    let node: Node | null = firstQuoted;
    // Walk up to a child of root
    while (node && node.parentNode && node.parentNode !== root) {
      node = node.parentNode;
    }
    if (!node) return { main: html, quoted: "" };

    const toMove: Node[] = [];
    let cur: Node | null = node;
    while (cur) {
      toMove.push(cur);
      cur = cur.nextSibling;
    }
    toMove.forEach((n) => quotedContainer.appendChild(n));

    return {
      main: root.innerHTML,
      quoted: quotedContainer.innerHTML,
    };
  } catch {
    return { main: html, quoted: "" };
  }
}

function sanitize(html: string): string {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    ADD_ATTR: ["target", "rel"],
    FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "form", "input", "button"],
    FORBID_ATTR: ["onerror", "onload", "onclick"],
  });
}

function EmailBody({ html, text }: { html: string; text: string }) {
  const [showQuoted, setShowQuoted] = useState(false);

  if (html) {
    const { main, quoted } = splitQuotedHtml(html);
    const cleanMain = sanitize(main);
    const cleanQuoted = quoted ? sanitize(quoted) : "";
    return (
      <div className="mx-auto max-w-3xl">
        <div
          className="email-html prose prose-sm max-w-none break-words text-sm leading-relaxed text-foreground
            [&_a]:text-primary [&_a]:underline-offset-2
            [&_img]:h-auto [&_img]:max-w-full [&_img]:rounded
            [&_table]:max-w-full [&_table]:border-collapse
            [&_blockquote]:my-3 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground
            [&_p]:my-2 [&_ul]:my-2 [&_ol]:my-2 [&_li]:my-0.5
            [&_hr]:my-4 [&_hr]:border-border"
          dangerouslySetInnerHTML={{ __html: cleanMain }}
        />
        {cleanQuoted && (
          <div className="mt-4">
            <button
              type="button"
              onClick={() => setShowQuoted((v) => !v)}
              className="rounded border border-border bg-muted/40 px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted"
            >
              {showQuoted ? "Paslēpt iepriekšējo saraksti" : "Rādīt iepriekšējo saraksti"}
            </button>
            {showQuoted && (
              <div
                className="mt-3 rounded-md border border-border/60 bg-muted/20 p-3 text-xs leading-relaxed text-muted-foreground
                  [&_a]:text-primary [&_img]:max-w-full"
                dangerouslySetInnerHTML={{ __html: cleanQuoted }}
              />
            )}
          </div>
        )}
      </div>
    );
  }

  if (text) {
    const { main, quoted } = splitQuotedText(text);
    return (
      <div className="mx-auto max-w-3xl">
        <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-foreground">
          {main}
        </pre>
        {quoted && (
          <div className="mt-4">
            <button
              type="button"
              onClick={() => setShowQuoted((v) => !v)}
              className="rounded border border-border bg-muted/40 px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted"
            >
              {showQuoted ? "Paslēpt iepriekšējo saraksti" : "Rādīt iepriekšējo saraksti"}
            </button>
            {showQuoted && (
              <pre className="mt-3 whitespace-pre-wrap break-words rounded-md border border-border/60 bg-muted/20 p-3 font-sans text-xs leading-relaxed text-muted-foreground">
                {quoted}
              </pre>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-md border border-dashed border-border bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
      Šai ziņai nav satura.
    </div>
  );
}

function CommunicationViewerModal({
  communicationId,
  onClose,
}: {
  communicationId: string | null;
  onClose: () => void;
}) {
  const open = !!communicationId;

  const commQ = useQuery({
    queryKey: ["communication", communicationId],
    queryFn: () =>
      fetchPublicTable({
        data: {
          table: "communications",
          query: `id=eq.${encodeURIComponent(communicationId ?? "")}&select=id,direction,channel,subject,from_address,to_address,current_status,sent_at,received_at,created_at,text_body,html_body,metadata&limit=1`,
        },
      }),
    enabled: open,
    staleTime: 60_000,
  });

  const eventsQ = useQuery({
    queryKey: ["communication-events", communicationId],
    queryFn: () =>
      fetchPublicTable({
        data: {
          table: "communication_events",
          query: `communication_id=eq.${encodeURIComponent(communicationId ?? "")}&select=id,event_type,event_timestamp&order=event_timestamp.asc&limit=100`,
        },
      }),
    enabled: open,
    staleTime: 60_000,
  });

  const comm = ((commQ.data?.rows ?? [])[0] ?? null) as Row | null;
  const events = (eventsQ.data?.rows ?? []) as Row[];

  const subject = s(comm?.subject) || "(bez temata)";
  const fromAddress = s(comm?.from_address);
  const toAddress = (() => {
    const t = comm?.to_address;
    if (Array.isArray(t)) return t.join(", ");
    const meta = (comm?.metadata ?? null) as Record<string, unknown> | null;
    return s(t) || s(meta?.mailbox);
  })();
  const dateStr = fmtDateTime(comm?.sent_at ?? comm?.received_at ?? comm?.created_at);
  const html = s(comm?.html_body);
  const text = s(comm?.text_body);
  const status = s(comm?.current_status);
  const attachments = getAttachments(comm);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden p-0 sm:rounded-lg">
        <DialogHeader className="sticky top-0 z-10 space-y-2 border-b border-border bg-background/95 px-5 py-4 backdrop-blur">
          <DialogTitle className="pr-8 text-base font-semibold">
            {commQ.isLoading ? "Ielādē…" : subject}
          </DialogTitle>
          {!commQ.isLoading && comm && (
            <dl className="grid grid-cols-[80px_1fr] gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {fromAddress && (
                <>
                  <dt className="uppercase tracking-wide">No</dt>
                  <dd className="truncate font-medium text-foreground">{fromAddress}</dd>
                </>
              )}
              {toAddress && (
                <>
                  <dt className="uppercase tracking-wide">Saņēmējs</dt>
                  <dd className="truncate font-medium text-foreground">{toAddress}</dd>
                </>
              )}
              <dt className="uppercase tracking-wide">Datums</dt>
              <dd className="font-medium text-foreground tabular-nums">{dateStr}</dd>
              {status && (
                <>
                  <dt className="uppercase tracking-wide">Statuss</dt>
                  <dd className="font-medium text-foreground">{status}</dd>
                </>
              )}
            </dl>
          )}
          {attachments.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 border-t border-border/60 pt-2">
              <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Pielikumi ({attachments.length})
              </span>
              {attachments.map((a, i) => (
                <Badge key={i} variant="secondary" className="text-[11px] font-normal">
                  {a}
                </Badge>
              ))}
            </div>
          )}
        </DialogHeader>

        <div className="flex-1 overflow-y-auto bg-background px-6 py-5">
          {commQ.isLoading ? (
            <LoadingState />
          ) : commQ.data?.error ? (
            <ErrorState message={commQ.data.error} />
          ) : !comm ? (
            <div className="rounded-md border border-dashed border-border bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
              Ziņa nav atrasta.
            </div>
          ) : (
            <EmailBody html={html} text={text} />
          )}

          {events.length > 0 && (
            <div className="mx-auto mt-6 max-w-3xl border-t border-border pt-3">
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Notikumi ({events.length})
              </div>
              <ul className="space-y-1 text-xs">
                {events.map((e, i) => (
                  <li
                    key={s(e.id) || i}
                    className="flex items-center justify-between gap-3 border-b border-border/60 py-1 last:border-0"
                  >
                    <span className="font-medium text-foreground">{s(e.event_type)}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {fmtDateTime(e.event_timestamp)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <DialogFooter className="flex-row items-center justify-end gap-2 border-t border-border bg-muted/30 px-5 py-3">
          <Button size="sm" variant="outline" disabled title="Drīzumā">
            <Forward className="h-3.5 w-3.5" />
            Pārsūtīt
          </Button>
          <Button size="sm" variant="default" disabled title="Drīzumā">
            <Reply className="h-3.5 w-3.5" />
            Atbildēt
          </Button>
          <Button size="sm" variant="ghost" onClick={onClose}>
            <X className="h-3.5 w-3.5" />
            Aizvērt
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
