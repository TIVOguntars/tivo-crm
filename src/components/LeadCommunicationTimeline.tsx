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

type EmailBodies = { html: string; text: string };

const QUOTE_REGEXES: RegExp[] = [
  /^-{2,}\s*Original Message\s*-{2,}/im,
  /^_{5,}\s*$/m,
  /^From:\s.+$/im,
  /^Sent:\s.+$/im,
  /^Subject:\s.+$/im,
  /^To:\s.+$/im,
  /^On\s.+wrote:\s*$/im,
  /^Le\s.+a écrit\s*:$/im,
  /^Am\s.+schrieb\s.+:$/im,
  /^Den\s.+skrev\s.+:$/im,
  /^Fra:\s.+$/im,
  /^Sendt:\s.+$/im,
  /^Emne:\s.+$/im,
  /^От:\s.+$/im,
  /^Тема:\s.+$/im,
  /^No:\s.+$/im,
  /^Kam:\s.+$/im,
  /^Nosūtīts:\s.+$/im,
  /^Tēma:\s.+$/im,
];

const MIME_GARBAGE_REGEX = /^(MIME-Version|Content-Type|Content-Transfer-Encoding|Content-Disposition|Content-ID|Content-Language|X-[\w-]+|DKIM-Signature|Return-Path|Received|Message-ID|References|In-Reply-To):/i;

function metaRecord(comm: Row | null): Row {
  const meta = comm?.metadata;
  return meta && typeof meta === "object" && !Array.isArray(meta) ? (meta as Row) : {};
}

function stringFrom(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(stringFrom).find(Boolean) ?? "";
  if (value && typeof value === "object") {
    const row = value as Row;
    return s(row.value ?? row.body ?? row.html ?? row.text ?? row.content ?? row.data);
  }
  return "";
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    const str = stringFrom(value).trim();
    if (str) return str;
  }
  return "";
}

function headerString(comm: Row | null): string {
  const meta = metaRecord(comm);
  const headers = meta.headers;
  const renderedHeaders = headers && typeof headers === "object" && !Array.isArray(headers)
    ? Object.entries(headers as Row).map(([key, value]) => `${key}: ${stringFrom(value)}`).join("\n")
    : stringFrom(headers);
  return [
    renderedHeaders,
    stringFrom(meta.raw_headers),
    stringFrom(meta.headerLines),
    stringFrom(meta.content_type),
    stringFrom(meta.contentType),
  ]
    .filter(Boolean)
    .join("\n");
}

function detectCharset(...values: string[]): string {
  const source = values.filter(Boolean).join("\n");
  const match = source.match(/charset\s*=\s*["']?([^"';\s]+)/i);
  return normalizeCharset(match?.[1] || "utf-8");
}

function normalizeCharset(charset: string): string {
  const value = charset.trim().toLowerCase().replace(/^charset=/, "");
  if (!value || value === "default") return "utf-8";
  if (value === "utf8") return "utf-8";
  if (value === "latin1") return "iso-8859-1";
  if (value === "cp1257") return "windows-1257";
  return value;
}

function detectTransferEncoding(headers: string, body: string): "quoted-printable" | "base64" | "" {
  const match = headers.match(/content-transfer-encoding\s*:\s*([^\r\n;]+)/i);
  const encoding = match?.[1]?.trim().toLowerCase() ?? "";
  if (encoding.includes("quoted-printable")) return "quoted-printable";
  if (encoding.includes("base64")) return "base64";
  if (/=[0-9A-F]{2}/i.test(body) || /=\r?\n/.test(body)) return "quoted-printable";
  if (body.replace(/\s+/g, "").length > 80 && /^[A-Za-z0-9+/\s]+={0,2}$/.test(body.trim())) return "base64";
  return "";
}

function decodeBytes(bytes: Uint8Array, charset: string): string {
  try {
    return new TextDecoder(normalizeCharset(charset), { fatal: false }).decode(bytes);
  } catch {
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  }
}

function decodeQuotedPrintable(input: string, charset: string): string {
  const clean = input.replace(/=\r?\n/g, "");
  const bytes: number[] = [];
  for (let i = 0; i < clean.length; i += 1) {
    const ch = clean[i];
    const hex = clean.slice(i + 1, i + 3);
    if (ch === "=" && /^[0-9A-F]{2}$/i.test(hex)) {
      bytes.push(parseInt(hex, 16));
      i += 2;
      continue;
    }
    const code = ch.charCodeAt(0);
    if (code <= 0xff) bytes.push(code);
    else bytes.push(...new TextEncoder().encode(ch));
  }
  return decodeBytes(new Uint8Array(bytes), charset);
}

function decodeBase64(input: string, charset: string): string {
  const normalized = input.replace(/\s+/g, "");
  if (!normalized || normalized.length % 4 === 1 || !/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) return input;
  try {
    const binary = globalThis.atob(normalized);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return decodeBytes(bytes, charset);
  } catch {
    return input;
  }
}

function repairMojibake(input: string): string {
  if (!/[ÃÂâ€]/.test(input)) return input;
  const cp1252: Record<string, number> = {
    "€": 0x80, "‚": 0x82, "ƒ": 0x83, "„": 0x84, "…": 0x85, "†": 0x86, "‡": 0x87,
    "ˆ": 0x88, "‰": 0x89, "Š": 0x8a, "‹": 0x8b, "Œ": 0x8c, "Ž": 0x8e, "‘": 0x91,
    "’": 0x92, "“": 0x93, "”": 0x94, "•": 0x95, "–": 0x96, "—": 0x97, "˜": 0x98,
    "™": 0x99, "š": 0x9a, "›": 0x9b, "œ": 0x9c, "ž": 0x9e, "Ÿ": 0x9f,
  };
  const bytes: number[] = [];
  for (const char of input) {
    const code = char.charCodeAt(0);
    if (cp1252[char] != null) bytes.push(cp1252[char]);
    else if (code <= 0xff) bytes.push(code);
    else bytes.push(...new TextEncoder().encode(char));
  }
  const repaired = decodeBytes(new Uint8Array(bytes), "utf-8");
  const before = (input.match(/[ÃÂ�]/g) ?? []).length;
  const after = (repaired.match(/[ÃÂ�]/g) ?? []).length;
  return after < before ? repaired : input;
}

function decodePayload(input: string, headers = ""): string {
  const raw = input.replace(/^\uFEFF/, "");
  const charset = detectCharset(headers, raw);
  const encoding = detectTransferEncoding(headers, raw);
  if (encoding === "quoted-printable") return decodeEncodedWords(repairMojibake(decodeQuotedPrintable(raw, charset)));
  if (encoding === "base64") return decodeEncodedWords(repairMojibake(decodeBase64(raw, charset)));
  return decodeEncodedWords(repairMojibake(raw));
}

function decodeEncodedWords(input: string): string {
  return input.replace(/=\?([^?]+)\?([bqBQ])\?([^?]+)\?=/g, (_match, charset, mode, value) => {
    const normalizedCharset = normalizeCharset(String(charset));
    if (String(mode).toUpperCase() === "B") return decodeBase64(String(value), normalizedCharset);
    const bytes: number[] = [];
    const q = String(value).replace(/_/g, " ");
    for (let i = 0; i < q.length; i += 1) {
      const hex = q.slice(i + 1, i + 3);
      if (q[i] === "=" && /^[0-9A-F]{2}$/i.test(hex)) {
        bytes.push(parseInt(hex, 16));
        i += 2;
      } else {
        bytes.push(q.charCodeAt(i));
      }
    }
    return decodeBytes(new Uint8Array(bytes), normalizedCharset);
  });
}

function parseHeaders(block: string): Row {
  const headers: Row = {};
  const unfolded = block.replace(/\r?\n[\t ]+/g, " ");
  for (const line of unfolded.split(/\r?\n/)) {
    const idx = line.indexOf(":");
    if (idx <= 0) continue;
    headers[line.slice(0, idx).trim().toLowerCase()] = line.slice(idx + 1).trim();
  }
  return headers;
}

function splitHeaderBody(raw: string): { headers: Row; headerText: string; body: string } {
  const match = raw.match(/\r?\n\r?\n/);
  if (!match || match.index == null) return { headers: {}, headerText: "", body: raw };
  const headerText = raw.slice(0, match.index);
  const body = raw.slice(match.index + match[0].length);
  return { headers: parseHeaders(headerText), headerText, body };
}

function boundaryFrom(contentType: string): string {
  return contentType.match(/boundary\s*=\s*"([^"]+)"/i)?.[1]
    ?? contentType.match(/boundary\s*=\s*([^;\s]+)/i)?.[1]
    ?? "";
}

function looksLikeHtml(value: string): boolean {
  return /<(html|body|div|p|br|table|a|span|strong|em|ul|ol|li|blockquote)\b/i.test(value);
}

function extractMimeBodies(raw: string, inheritedHeaders = ""): EmailBodies {
  const { headers, headerText, body } = splitHeaderBody(raw);
  const contentType = s(headers["content-type"] || inheritedHeaders);
  const boundary = boundaryFrom(contentType) || raw.match(/boundary\s*=\s*"([^"]+)"/i)?.[1] || "";
  const result: EmailBodies = { html: "", text: "" };

  if (boundary) {
    const parts = raw.split(new RegExp(`--${boundary.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:--)?(?:\\r?\\n)?`, "g"));
    for (const part of parts) {
      if (!part.trim() || part.includes("This is a multi-part message in MIME format")) continue;
      const nested = extractMimeBodies(part, headerText);
      result.html ||= nested.html;
      result.text ||= nested.text;
    }
    return result;
  }

  const disposition = s(headers["content-disposition"]).toLowerCase();
  if (disposition.includes("attachment")) return result;

  const transferHeaders = [headerText, inheritedHeaders].filter(Boolean).join("\n");
  const decoded = decodePayload(body, transferHeaders);
  if (/text\/html/i.test(contentType) || looksLikeHtml(decoded)) result.html = decoded.trim();
  else if (/text\/plain/i.test(contentType) || decoded.trim()) result.text = decoded.trim();
  return result;
}

function isRawMime(value: string): boolean {
  return /(^|\n)(MIME-Version|Content-Type|Content-Transfer-Encoding):/i.test(value)
    || /(^|\n)--[\w='()+_,.\/:?-]{8,}/.test(value);
}

function chooseEmailBodies(comm: Row | null): EmailBodies {
  const meta = metaRecord(comm);
  const headers = headerString(comm);
  const rawMime = firstString(meta.raw, meta.raw_email, meta.mime, meta.message_source, meta.source, meta.original);
  const directRawMime = firstString(comm?.raw, comm?.raw_email, comm?.mime, comm?.message_source, comm?.source, comm?.original);
  const mimeBodies = rawMime || directRawMime ? extractMimeBodies(rawMime || directRawMime, headers) : { html: "", text: "" };

  const htmlCandidates = [
    comm?.body_html,
    comm?.parsed_html,
    comm?.rendered_html,
    meta.body_html,
    meta.parsed_html,
    meta.rendered_html,
    comm?.html_body,
    meta.html_body,
    meta.html,
    mimeBodies.html,
  ];
  const textCandidates = [comm?.body_text, comm?.text_body, meta.body_text, meta.text_body, meta.text, mimeBodies.text];

  for (const candidate of htmlCandidates) {
    const decoded = decodePayload(stringFrom(candidate), headers).trim();
    if (!decoded) continue;
    if (isRawMime(decoded)) {
      const extracted = extractMimeBodies(decoded, headers);
      if (extracted.html) return { html: extracted.html, text: extracted.text };
      if (extracted.text) return { html: "", text: cleanPlainText(extracted.text) };
    }
    if (looksLikeHtml(decoded)) return { html: decoded, text: "" };
  }

  for (const candidate of textCandidates) {
    const decoded = decodePayload(stringFrom(candidate), headers).trim();
    if (!decoded) continue;
    if (isRawMime(decoded)) {
      const extracted = extractMimeBodies(decoded, headers);
      if (extracted.html) return { html: extracted.html, text: extracted.text };
      if (extracted.text) return { html: "", text: cleanPlainText(extracted.text) };
    }
    if (looksLikeHtml(decoded)) return { html: decoded, text: "" };
    return { html: "", text: cleanPlainText(decoded) };
  }

  return { html: "", text: "" };
}

function splitQuotedText(text: string): { main: string; quoted: string } {
  let cutAt = -1;
  for (const re of QUOTE_REGEXES) {
    const m = text.match(re);
    if (m && m.index != null && m.index > 0 && (cutAt === -1 || m.index < cutAt)) {
      cutAt = m.index;
    }
  }
  if (cutAt <= 0) return { main: text.trim(), quoted: "" };
  return {
    main: text.slice(0, cutAt).trimEnd(),
    quoted: text.slice(cutAt).trim(),
  };
}

function cleanPlainText(text: string): string {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const cleaned = lines
    .filter((line) => !MIME_GARBAGE_REGEX.test(line.trim()))
    .filter((line) => !/^--[\w='()+_,.\/:?-]{8,}--?$/.test(line.trim()))
    .join("\n")
    .replace(/={2,}\s*$/gm, "")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
  return cleaned;
}

function splitQuotedHtml(html: string): { main: string; quoted: string } {
  if (typeof window === "undefined" || typeof DOMParser === "undefined") {
    return { main: html, quoted: "" };
  }
  try {
    const doc = new DOMParser().parseFromString(`<div id="__r">${html}</div>`, "text/html");
    const root = doc.getElementById("__r");
    if (!root) return { main: html, quoted: "" };

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
      const elements = Array.from(root.querySelectorAll("div,p,span,td,table,hr"));
      firstQuoted = elements.find((el) => QUOTE_REGEXES.some((re) => re.test((el.textContent ?? "").trim()))) ?? null;
    }

    if (!firstQuoted) return { main: html, quoted: "" };

    const quotedContainer = doc.createElement("div");
    let node: Node | null = firstQuoted;
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
    FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "form", "input"],
    FORBID_ATTR: ["onerror", "onload", "onclick"],
  });
}

function ThreadHistory({ quoted, html }: { quoted: string; html: boolean }) {
  const [showQuoted, setShowQuoted] = useState(false);
  if (!quoted) return null;
  const blocks = html ? [quoted] : quoted.split(/\n(?=From:|No:|On\s.+wrote:|-----Original Message-----)/i).filter(Boolean);
  return (
    <div className="mt-5 border-t border-border pt-4">
      <button
        type="button"
        onClick={() => setShowQuoted((v) => !v)}
        className="rounded border border-border bg-muted/40 px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted"
      >
        {showQuoted ? "Paslēpt iepriekšējo saraksti" : `Rādīt iepriekšējo saraksti${blocks.length > 1 ? ` (${blocks.length})` : ""}`}
      </button>
      {showQuoted && (
        <div className="mt-3 space-y-3">
          {blocks.map((block, idx) => html ? (
            <div
              key={idx}
              className="rounded-md border border-border/60 bg-muted/20 p-3 text-xs leading-relaxed text-muted-foreground [&_a]:text-primary [&_img]:max-w-full"
              dangerouslySetInnerHTML={{ __html: sanitize(block) }}
            />
          ) : (
            <pre key={idx} className="whitespace-pre-wrap break-words rounded-md border border-border/60 bg-muted/20 p-3 font-sans text-xs leading-relaxed text-muted-foreground">
              {cleanPlainText(block)}
            </pre>
          ))}
        </div>
      )}
    </div>
  );
}

function EmailBody({ html, text }: { html: string; text: string }) {
  if (html) {
    const { main, quoted } = splitQuotedHtml(html);
    const cleanMain = sanitize(main);
    return (
      <div className="mx-auto max-w-3xl rounded-md bg-card px-5 py-4 shadow-sm ring-1 ring-border/60">
        <div
          className="email-html prose prose-sm max-w-none break-words text-sm leading-relaxed text-card-foreground
            [&_a]:text-primary [&_a]:underline-offset-2
            [&_img]:h-auto [&_img]:max-w-full [&_img]:rounded
            [&_table]:max-w-full [&_table]:border-collapse
            [&_blockquote]:my-3 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground
            [&_p]:my-2 [&_ul]:my-2 [&_ol]:my-2 [&_li]:my-0.5
            [&_hr]:my-4 [&_hr]:border-border"
          dangerouslySetInnerHTML={{ __html: cleanMain }}
        />
        <ThreadHistory quoted={quoted} html />
      </div>
    );
  }

  if (text) {
    const { main, quoted } = splitQuotedText(cleanPlainText(text));
    return (
      <div className="mx-auto max-w-3xl rounded-md bg-card px-5 py-4 shadow-sm ring-1 ring-border/60">
        <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-card-foreground">
          {main}
        </pre>
        <ThreadHistory quoted={quoted} html={false} />
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
          query: `id=eq.${encodeURIComponent(communicationId ?? "")}&select=*&limit=1`,
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
  const bodies = chooseEmailBodies(comm);
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
            <EmailBody html={bodies.html} text={bodies.text} />
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
