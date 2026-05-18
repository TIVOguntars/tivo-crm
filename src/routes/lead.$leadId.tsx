import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Phone,
  Mail,
  MessageCircle,
  Plus,
  Mail as MailIcon,
  Phone as PhoneIcon,
  MessageSquare,
  Activity,
  StickyNote,
  CheckSquare,
  ArrowDownLeft,
  ArrowUpRight,
  Reply,
  Forward,
  Star,
  X,
} from "lucide-react";

import { LoadingState, ErrorState } from "@/components/DataState";
import { Button } from "@/components/ui/button";
import DOMPurify from "isomorphic-dompurify";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import { useCrmRpc } from "@/hooks/useCrmRpc";
import { useCrmView } from "@/hooks/useCrmView";
import { HeaderSlot } from "@/components/HeaderSlot";
import { toast } from "sonner";

export const Route = createFileRoute("/lead/$leadId")({
  component: LeadProfilePage,
});

/* -------------------------- helpers -------------------------- */

const NA = "Nav datu";
type Row = Record<string, unknown>;

function asArray(v: unknown): Row[] {
  if (Array.isArray(v)) return v as Row[];
  if (v && typeof v === "object") return [v as Row];
  return [];
}
function asObject(v: unknown): Row | null {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Row;
  return null;
}
function str(v: unknown): string {
  if (v == null) return "";
  return typeof v === "string" ? v : String(v);
}
function fmt(v: unknown): string {
  const s = str(v).trim();
  return s === "" ? NA : s;
}
function fmtDate(v: unknown): string {
  if (v == null || v === "") return NA;
  const d = new Date(str(v));
  if (Number.isNaN(d.getTime())) return str(v);
  return d.toLocaleString("lv-LV", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
function fmtBool(v: unknown): string {
  if (v == null || v === "") return NA;
  if (typeof v === "boolean") return v ? "Jā" : "Nē";
  const s = str(v).trim().toLowerCase();
  if (["true", "t", "1", "yes", "ja", "jā"].includes(s)) return "Jā";
  if (["false", "f", "0", "no", "ne", "nē"].includes(s)) return "Nē";
  return str(v);
}
function fmtMoney(v: unknown): string {
  if (v == null || v === "") return NA;
  const n = Number(v);
  if (Number.isNaN(n)) return str(v);
  return n.toLocaleString("lv-LV", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  });
}
function pick(row: Row | null | undefined, ...keys: string[]): unknown {
  if (!row) return undefined;
  for (const k of keys) {
    const v = row[k];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
}
function section(profile: Row | null, ...keys: string[]): Row[] {
  if (!profile) return [];
  for (const k of keys) {
    if (profile[k] !== undefined) return asArray(profile[k]);
  }
  return [];
}
function sectionObject(profile: Row | null, ...keys: string[]): Row | null {
  if (!profile) return null;
  for (const k of keys) {
    if (profile[k] !== undefined) {
      const arr = asArray(profile[k]);
      if (arr.length > 0) return arr[0];
      return asObject(profile[k]);
    }
  }
  return null;
}

/* -------------------------- UI primitives -------------------------- */

function Empty({ label = NA }: { label?: string }) {
  return <div className="text-sm text-muted-foreground py-3">{label}</div>;
}

/* Strip HTML and decode entities for safe plain-text snippet rendering. */
function htmlToPreviewText(input: string): string {
  if (!input) return "";
  let out = input;
  out = out.replace(/<(script|style|head)\b[^>]*>[\s\S]*?<\/\1>/gi, " ");
  out = out.replace(/<!--[\s\S]*?-->/g, " ");
  out = out.replace(/<![^>]*>/g, " ");
  out = out.replace(/<\/?[a-z][^>]*>/gi, " ");
  out = out
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, d) => {
      try { return String.fromCodePoint(Number(d)); } catch { return ""; }
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => {
      try { return String.fromCodePoint(parseInt(h, 16)); } catch { return ""; }
    });
  return out.replace(/\s+/g, " ").trim();
}
function cleanPreview(raw: unknown): string {
  let v = htmlToPreviewText(typeof raw === "string" ? raw : str(raw));
  if (/<html|<head|<body|<style|<\/?[a-z]+/i.test(v)) {
    v = htmlToPreviewText(v);
  }
  return v;
}

/* Map known automation template keys to short human labels. */
const TEMPLATE_LABEL_MAP: Record<string, string> = {
  email_getestimate_1: "getestimate 1",
  email_getestimate_2: "getestimate 2",
  email_getestimate_3: "getestimate 3",
  email_getestimate_4: "getestimate 4",
  email_transition_to_sketch: "transition to sketch",
  email_sketch_1: "sketch 1",
  email_sketch_2: "sketch 2",
  email_sketch_3: "sketch 3",
  email_sketch_4: "sketch 4",
};
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function normalizeTemplateKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/^e_mail_/, "email_");
}
/* Resolve a known template label from a list of candidate strings.
 * UUID-shaped values are ignored (those are template_version_id, not keys).
 * Returns "" if no candidate matches a known template. */
function resolveTemplateLabel(...candidates: unknown[]): string {
  for (const c of candidates) {
    const s = typeof c === "string" ? c : c == null ? "" : String(c);
    const t = s.trim();
    if (!t || UUID_RE.test(t)) continue;
    const norm = normalizeTemplateKey(t);
    if (TEMPLATE_LABEL_MAP[norm]) return TEMPLATE_LABEL_MAP[norm];
  }
  return "";
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="text-sm text-foreground break-words">{value}</span>
    </div>
  );
}

function Panel({
  title,
  count,
  action,
  children,
  className = "",
}: {
  title: string;
  count?: number;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={`shadow-sm ${className}`}>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 px-4 py-3 border-b">
        <div className="flex items-center gap-2">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
          {typeof count === "number" && (
            <span className="text-xs text-muted-foreground tabular-nums">
              {count}
            </span>
          )}
        </div>
        {action}
      </CardHeader>
      <CardContent className="p-4">{children}</CardContent>
    </Card>
  );
}

function channelIcon(channel: string) {
  const c = channel.toLowerCase();
  if (c.includes("mail")) return <MailIcon className="h-3.5 w-3.5" />;
  if (c.includes("phone") || c.includes("call"))
    return <PhoneIcon className="h-3.5 w-3.5" />;
  if (c.includes("whats") || c.includes("sms") || c.includes("chat"))
    return <MessageSquare className="h-3.5 w-3.5" />;
  return <Activity className="h-3.5 w-3.5" />;
}

/* -------------------------- page -------------------------- */

function LeadProfilePage() {
  const navigate = useNavigate();
  const goBackToList = () => {
    let prev: Record<string, unknown> | null = null;
    try {
      const raw = sessionStorage.getItem("leadi:lastSearch");
      if (raw) prev = JSON.parse(raw);
    } catch {
      /* ignore */
    }
    navigate({ to: "/leadi", search: (prev ?? {}) as never });
  };
  const { leadId } = Route.useParams();
  const q = useCrmRpc("get_lead_360_profile", { p_lead_id: leadId }, !!leadId);
  const [showRaw, setShowRaw] = useState(false);
  // CANONICAL priority source: crm.lead_priority_scoring_v2.
  // Display only — never write back to crm.leads.
  const scoringQ = useCrmView(
    "lead_priority_scoring_v2",
    `select=lead_id,priority_score,priority_label,recommended_status&lead_id=eq.${leadId}&limit=1`,
  );
  const commCountsQ = useCrmView(
    "leads_list_display",
    `select=lead_id,status,email_outbound_count,email_inbound_count,call_outbound_count,call_inbound_count,chat_outbound_count,chat_inbound_count&lead_id=eq.${leadId}`,
  );
  const commPayloadsQ = useCrmView(
    "communications",
    `select=id,raw_payload&lead_id=eq.${leadId}&channel=eq.email`,
    { all: true },
  );
  const plannedActionsQ = useCrmView(
    "v_lead_planned_actions",
    `select=source,id,lead_id,kind,status,scheduled_for,title,metadata&lead_id=eq.${leadId}&order=scheduled_for.asc.nullslast`,
  );
  const queueTemplatesQ = useCrmView(
    "communication_queue",
    `select=id,template_key&lead_id=eq.${leadId}`,
    { all: true },
  );
  const rpcError = (q.error as Error | null)?.message || q.data?.error;
  const raw = q.data?.rows?.[0] ?? null;
  const profile: Row | null = (() => {
    if (!raw) return null;
    if (typeof raw === "object" && "profile" in raw && raw.profile) {
      return asObject(raw.profile);
    }
    return raw as Row;
  })();

  const header =
    sectionObject(profile, "lead", "lead_header", "header") ?? profile;
  const legacyContext = sectionObject(profile, "legacy_context");
  const people = section(profile, "people");
  const companies = section(profile, "companies");
  const objects = section(profile, "objects");
  const notes = section(profile, "notes");
  const communications = section(profile, "communications", "comms");

  const primaryContact =
    people.find((p) => pick(p, "is_primary", "is_primary_contact") === true) ??
    people[0] ??
    null;
  const primaryData = primaryContact
    ? asObject(primaryContact.person) ?? primaryContact
    : null;

  const primaryEmail = str(pick(primaryData, "email_normalized", "email"));
  const primaryPhoneE164 = str(pick(primaryData, "phone_e164"));
  const primaryPhoneRaw = str(pick(primaryData, "phone_raw", "phone"));
  const primaryPhone = primaryPhoneE164 || primaryPhoneRaw;
  const waNumber = primaryPhoneE164.replace(/[^\d]/g, "");

  const rawData = asObject(pick(header, "raw_data")) ?? null;
  const ownerLabel = fmt(
    pick(rawData, "ppv_vards") ??
      pick(legacyContext, "ppv_vards") ??
      pick(header, "owner_name", "owner", "assigned_user_name", "assigned_user_id"),
  );
  const leadTitle =
    str(pick(primaryData, "full_name")) ||
    str(pick(legacyContext, "full_name")) ||
    str(pick(rawData, "full_name")) ||
    str(pick(header, "summary")) ||
    str(pick(header, "id", "lead_id")) ||
    NA;
  const leadSource =
    str(pick(header, "source", "lead_source")) ||
    str(pick(rawData, "source")) ||
    str(pick(legacyContext, "source", "avots_detalizets")) ||
    NA;
  const leadCountry =
    str(pick(primaryData, "country")) ||
    str(pick(rawData, "valsts")) ||
    str(pick(legacyContext, "valsts")) ||
    "";
  const leadRegisteredAt =
    pick(header, "created_at") ?? pick(rawData, "created_at") ?? null;
  const leadStatus = str(pick(header, "status", "lead_status"));
  const scoringRow = ((scoringQ.data?.rows ?? []) as Row[])[0];
  const priorityScore = Number(scoringRow?.priority_score ?? 0) || 0;
  const priorityLabel = String(scoringRow?.priority_label ?? "") || "Zema";
  const recommendedStatus = String(scoringRow?.recommended_status ?? "");
  const showRecommendedStatus =
    !!recommendedStatus &&
    recommendedStatus.toLowerCase() !== leadStatus.toLowerCase();
  const priorityStars = Math.max(0, Math.min(5, Math.round(priorityScore / 20)));
  const leadTags = (() => {
    const t = pick(rawData, "tags") ?? pick(legacyContext, "tags");
    if (!t) return "";
    if (Array.isArray(t)) return t.map(str).filter(Boolean).join(", ");
    return str(t);
  })();

  const commStats = useMemo(() => {
    const rows = (commCountsQ.data?.rows ?? []) as Row[];
    const r = rows[0];
    if (!commCountsQ.isLoading && !r && leadId) {
      console.error(
        `[lead 360] leads_list_display returned no row for lead_id=${leadId}`,
      );
    }
    const num = (v: unknown) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : 0;
    };
    return {
      phone: {
        outbound: num(r?.call_outbound_count),
        inbound: num(r?.call_inbound_count),
      },
      email: {
        outbound: num(r?.email_outbound_count),
        inbound: num(r?.email_inbound_count),
      },
      chat: {
        outbound: num(r?.chat_outbound_count),
        inbound: num(r?.chat_inbound_count),
      },
    };
  }, [commCountsQ.data, commCountsQ.isLoading, leadId]);

  const lastActivityAt = useMemo(() => {
    const candidates: number[] = [];
    const pushFrom = (rows: Row[], ...keys: string[]) => {
      for (const r of rows) {
        const v = pick(r, ...keys);
        if (v) {
          const t = new Date(str(v)).getTime();
          if (!Number.isNaN(t)) candidates.push(t);
        }
      }
    };
    // Match the Activities list source exactly (communications + notes).
    pushFrom(communications, "created_at", "occurred_at", "sent_at");
    pushFrom(notes, "created_at", "updated_at");
    if (!candidates.length) return null;
    return new Date(Math.max(...candidates)).toISOString();
  }, [communications, notes]);

  type TLItem = {
    key: string;
    kind: "comm" | "note";
    ts: number;
    raw: Row;
  };
  const rawPayloadById = useMemo(() => {
    const map = new Map<string, Row>();
    const rows = (commPayloadsQ.data?.rows ?? []) as Row[];
    for (const row of rows) {
      const id = str(row.id);
      const rp = row.raw_payload;
      if (id && rp && typeof rp === "object") {
        map.set(id, rp as Row);
      }
    }
    return map;
  }, [commPayloadsQ.data]);
  const timeline = useMemo<TLItem[]>(() => {
    const items: TLItem[] = [];
    communications.forEach((c, i) => {
      const id = str(pick(c, "id", "communication_id"));
      const rp = id ? rawPayloadById.get(id) : undefined;
      const tsStr =
        (rp && str(pick(rp, "sent_at"))) ||
        str(pick(c, "sent_at", "occurred_at", "created_at"));
      const ts = new Date(tsStr).getTime() || 0;
      items.push({
        key: `c:${id || i}`,
        kind: "comm",
        ts,
        raw: c,
      });
    });
    notes.forEach((n, i) => {
      const ts =
        new Date(str(pick(n, "created_at", "updated_at"))).getTime() || 0;
      items.push({
        key: `n:${str(pick(n, "id", "note_id")) || i}`,
        kind: "note",
        ts,
        raw: n,
      });
    });
    return items.sort((a, b) => b.ts - a.ts);
  }, [communications, notes, rawPayloadById]);

  const [openItem, setOpenItem] = useState<TLItem | null>(null);

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-4 space-y-4">
      <HeaderSlot>
        <Button variant="ghost" size="sm" onClick={goBackToList} className="h-8 px-2">
          <ArrowLeft className="mr-1 h-4 w-4" />
          Atpakaļ uz sarakstu
        </Button>
      </HeaderSlot>
      {q.isLoading && <LoadingState label="Ielādē lead profilu..." />}
      {!q.isLoading && rpcError && <ErrorState message={rpcError} />}
      {!q.isLoading && !rpcError && !profile && <Empty label="Lead profils nav atrasts." />}

      {!q.isLoading && !rpcError && profile && (
        <>
          {/* Sticky operator header */}
          <Card className="sticky top-2 z-20 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-card/95">
            <CardContent className="flex flex-col gap-3 p-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h1 className="text-base font-semibold truncate">
                      {leadTitle}
                    </h1>
                    <StatusBadge status={leadStatus} />
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                    {leadCountry && (
                      <>
                        <span className="font-medium text-foreground">
                          {leadCountry}
                        </span>
                        <span>•</span>
                      </>
                    )}
                    <span title="Zvani izejošie / ienākošie">
                      📞 {commStats.phone.outbound}/{commStats.phone.inbound}
                    </span>
                    <span title="E-pasti izejošie / ienākošie">
                      ✉️ {commStats.email.outbound}/{commStats.email.inbound}
                    </span>
                    <span title="WhatsApp / SMS izejošie / ienākošie">
                      💬 {commStats.chat.outbound}/{commStats.chat.inbound}
                    </span>
                  </div>
                </div>
                <div className="hidden md:flex items-center text-xs text-muted-foreground ml-6">
                  <div className="flex flex-col">
                    <span className="text-foreground mx-[10px]">PPV</span>
                    <span className="text-foreground mx-[10px] font-medium">{ownerLabel}</span>
                  </div>
                  <div className="flex flex-col ml-[50px]">
                    <span className="text-foreground mx-[10px]">Prioritāte</span>
                    <span className="text-foreground mx-[10px] font-medium flex items-center gap-1">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star
                          key={i}
                          className={`h-3 w-3 ${i < priorityStars ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`}
                        />
                      ))}
                      <span className="ml-1">{priorityLabel} · {priorityScore}</span>
                      {showRecommendedStatus && (
                        <span
                          className="ml-2 inline-flex items-center rounded border border-dashed border-amber-400/60 bg-amber-50/60 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200"
                          title={`Ieteiktais statuss: ${recommendedStatus}`}
                        >
                          → {recommendedStatus}
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="flex flex-col ml-4">
                    <span className="text-foreground mx-[10px]">Pēdējā aktivitāte</span>
                    <span className="text-foreground mx-[10px]">{lastActivityAt ? fmtDate(lastActivityAt) : "Nav aktivitāšu"}</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1">
                  <Button
                    asChild={!!primaryPhone}
                    size="icon"
                    variant="outline"
                    disabled={!primaryPhone}
                    title={primaryPhone ? `Zvanīt: ${primaryPhone}` : "Zvanīt"}
                    aria-label="Zvanīt"
                    className="h-8 w-8"
                  >
                    {primaryPhone ? (
                      <a href={`tel:${primaryPhone}`} aria-label="Zvanīt">
                        <Phone className="h-3.5 w-3.5" />
                      </a>
                    ) : (
                      <Phone className="h-3.5 w-3.5" />
                    )}
                  </Button>
                  <Button
                    asChild={!!primaryEmail}
                    size="icon"
                    variant="outline"
                    disabled={!primaryEmail}
                    title={primaryEmail ? `E-pasts: ${primaryEmail}` : "E-pasts"}
                    aria-label="E-pasts"
                    className="h-8 w-8"
                  >
                    {primaryEmail ? (
                      <a href={`mailto:${primaryEmail}`} aria-label="E-pasts">
                        <Mail className="h-3.5 w-3.5" />
                      </a>
                    ) : (
                      <Mail className="h-3.5 w-3.5" />
                    )}
                  </Button>
                  <Button
                    asChild={!!primaryPhone}
                    size="icon"
                    variant="outline"
                    disabled={!primaryPhone}
                    title={primaryPhone ? `SMS: ${primaryPhone}` : "SMS"}
                    aria-label="SMS"
                    className="h-8 w-8"
                  >
                    {primaryPhone ? (
                      <a href={`sms:${primaryPhone}`} aria-label="SMS">
                        <MessageSquare className="h-3.5 w-3.5" />
                      </a>
                    ) : (
                      <MessageSquare className="h-3.5 w-3.5" />
                    )}
                  </Button>
                  <Button
                    asChild={!!waNumber}
                    size="icon"
                    variant="outline"
                    disabled={!waNumber}
                    title={waNumber ? `WhatsApp: +${waNumber}` : "WhatsApp"}
                    aria-label="WhatsApp"
                    className="h-8 w-8"
                  >
                    {waNumber ? (
                      <a
                        href={`https://wa.me/${waNumber}`}
                        target="_blank"
                        rel="noreferrer"
                        aria-label="WhatsApp"
                      >
                        <MessageCircle className="h-3.5 w-3.5" />
                      </a>
                    ) : (
                      <MessageCircle className="h-3.5 w-3.5" />
                    )}
                  </Button>
                  <Button
                    size="icon"
                    variant="outline"
                    disabled
                    title="Piezīme"
                    aria-label="Piezīme"
                    className="h-8 w-8"
                  >
                    <StickyNote className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="outline"
                    disabled
                    title="Uzdevums"
                    aria-label="Uzdevums"
                    className="h-8 w-8"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Two-column workspace */}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            {/* LEFT */}
            <div className="space-y-4 xl:col-span-1">
              {/* Kontakts */}
              <Panel title="Kontakts" count={people.length}>
                {people.length === 0 ? (
                  <Empty />
                ) : (
                  <div className="space-y-3">
                    {primaryContact && (
                      <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
                        <div className="mb-2 text-[10px] font-medium uppercase tracking-wide text-primary">
                          Primārais kontakts
                        </div>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          <div className="sm:col-span-2">
                            <Field label="Vārds" value={fmt(pick(primaryData, "full_name", "name"))} />
                          </div>
                          <div className="sm:col-span-2">
                            <Field label="E-pasts" value={fmt(primaryEmail)} />
                          </div>
                          <Field label="Telefons" value={fmt(primaryPhoneRaw)} />
                          <Field label="E.164" value={fmt(primaryPhoneE164)} />
                          <Field label="Komunikācijas statuss" value={fmt(pick(primaryContact, "communication_status"))} />
                          <Field label="Tagi" value={fmt(leadTags)} />
                        </div>
                        <div className="mt-3 border-t pt-2">
                          <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                            Pamatdati
                          </div>
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            <Field label="Avots" value={fmt(leadSource)} />
                            <Field label="Reģistrēts" value={fmtDate(leadRegisteredAt)} />
                          </div>
                        </div>
                      </div>
                    )}

                    {people.length > 1 && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b text-left text-[10px] uppercase text-muted-foreground">
                              <th className="py-1.5 pr-2">Vārds</th>
                              <th className="py-1.5 pr-2">Kontakts</th>
                              <th className="py-1.5 pr-2">Loma</th>
                            </tr>
                          </thead>
                          <tbody>
                            {people.map((p, i) => {
                              if (p === primaryContact) return null;
                              const personData = asObject(p.person) ?? p;
                              return (
                                <tr
                                  key={String(pick(p, "id", "person_id") ?? pick(personData, "id", "person_id") ?? i)}
                                  className="border-b last:border-0"
                                >
                                  <td className="py-1.5 pr-2">{fmt(pick(personData, "full_name", "name"))}</td>
                                  <td className="py-1.5 pr-2 text-muted-foreground">
                                    {fmt(pick(personData, "email_normalized", "email", "phone_e164", "phone_raw"))}
                                  </td>
                                  <td className="py-1.5 pr-2">{fmt(pick(p, "role"))}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </Panel>

              {/* Uzņēmumi */}
              <Panel title="Uzņēmumi" count={companies.length}>
                {companies.length === 0 ? (
                  <Empty />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b text-left text-[10px] uppercase text-muted-foreground">
                          <th className="py-1.5 pr-2">Uzņēmums</th>
                          <th className="py-1.5 pr-2">Loma</th>
                          <th className="py-1.5 pr-2">Primārais</th>
                        </tr>
                      </thead>
                      <tbody>
                        {companies.map((c, i) => {
                          const companyData = asObject(c.company) ?? c;
                          return (
                            <tr
                              key={String(pick(c, "id", "company_id") ?? pick(companyData, "id", "company_id") ?? i)}
                              className="border-b last:border-0"
                            >
                              <td className="py-1.5 pr-2">
                                <div className="font-medium">{fmt(pick(companyData, "company_name", "name"))}</div>
                                <div className="text-muted-foreground text-[10px]">
                                  {[pick(companyData, "city"), pick(companyData, "country")]
                                    .filter(Boolean)
                                    .map(str)
                                    .join(", ") || NA}
                                </div>
                              </td>
                              <td className="py-1.5 pr-2">{fmt(pick(c, "relationship_role", "role"))}</td>
                              <td className="py-1.5 pr-2">{fmtBool(pick(c, "is_primary_company", "is_primary"))}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </Panel>

              {/* Objekti */}
              <Panel title="Objekti" count={objects.length || (legacyContext ? 1 : 0)}>
                {objects.length === 0 && legacyContext ? (
                  <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
                    <div className="mb-2 text-[10px] font-medium uppercase tracking-wide text-primary">
                      Primārais objekts
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="col-span-2">
                        <Field label="Objekts" value={fmt(pick(legacyContext, "objekts"))} />
                      </div>
                      <Field label="Forma zeme" value={fmt(pick(legacyContext, "forma_zeme"))} />
                      <Field label="Forma projekts" value={fmt(pick(legacyContext, "forma_projekts"))} />
                      <div className="col-span-2">
                        <Field label="Plānotā būvniecība" value={fmt(pick(legacyContext, "planota_buvnieciba_text"))} />
                      </div>
                      <Field label="Tagi" value={fmt(pick(legacyContext, "tags"))} />
                      <Field label="Valsts" value={fmt(pick(legacyContext, "valsts"))} />
                    </div>
                  </div>
                ) : objects.length === 0 ? (
                  <Empty />
                ) : (
                  <div className="space-y-2">
                    {objects.map((o, i) => {
                      const objectData = asObject(o.object) ?? o;
                      return (
                        <div
                          key={String(pick(o, "id", "object_id") ?? pick(objectData, "id", "object_id") ?? i)}
                          className="rounded-md border bg-card p-3"
                        >
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <div className="font-medium text-sm truncate">
                              {fmt(pick(objectData, "object_name", "name"))}
                            </div>
                            <StatusBadge status={str(pick(objectData, "sales_status"))} />
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <Field label="Tips" value={fmt(pick(objectData, "object_type"))} />
                            <Field label="Zeme" value={fmt(pick(objectData, "land_status"))} />
                            <Field label="Projekts" value={fmt(pick(objectData, "project_status"))} />
                            <Field label="Budžets" value={fmtMoney(pick(objectData, "budget_amount"))} />
                            <div className="col-span-2">
                              <Field label="Adrese" value={fmt(pick(objectData, "address"))} />
                            </div>
                            <Field label="Aplēstā vērtība" value={fmtMoney(pick(objectData, "estimated_value"))} />
                            <Field label="Primārais" value={fmtBool(pick(o, "is_primary_object", "is_primary"))} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Panel>
            </div>

            {/* RIGHT */}
            <div className="space-y-4 xl:col-span-2">
              {/* Uzdevumi un plānotās darbības (unified future-work block) */}
              {(() => {
                type PlannedItem = {
                  key: string;
                  title: string;
                  subtitle?: string;
                  meta: string;
                  status: string;
                };
                const QUEUE_STATUS_LV: Record<string, string> = {
                  queued: "Plānots",
                  sending: "Sūta",
                  sent: "Nosūtīts",
                  failed: "Kļūda",
                  blocked: "Bloķēts",
                  cancelled: "Atcelts",
                };
                const plannedRows = (plannedActionsQ.data?.rows ?? []) as Row[];
                const tplMap = new Map<string, string>();
                for (const r of (queueTemplatesQ.data?.rows ?? []) as Row[]) {
                  const id = str(r.id);
                  const tk = str(r.template_key);
                  if (id && tk) tplMap.set(id, tk);
                }
                const items: PlannedItem[] = plannedRows.map((r, i) => {
                  const source = str(r.source);
                  const id = str(r.id) || String(i);
                  const rawStatus = str(r.status);
                  const scheduled = fmtDate(r.scheduled_for);
                  if (source === "queue") {
                    const tk = tplMap.get(str(r.id)) || "";
                    const subject = str(r.title);
                    const statusLabel =
                      QUEUE_STATUS_LV[rawStatus.toLowerCase()] || rawStatus;
                    const kind = str(r.kind);
                    return {
                      key: `q:${id}`,
                      title: tk || subject || fmt(kind),
                      subtitle: tk ? subject : undefined,
                      meta: `${scheduled} · ${kind}`,
                      status: statusLabel,
                    };
                  }
                  if (source === "task") {
                    return {
                      key: `t:${id}`,
                      title: fmt(r.title),
                      meta: `${scheduled} · ${fmt(r.kind)}`,
                      status: rawStatus,
                    };
                  }
                  return {
                    key: `${source}:${id}`,
                    title: fmt(r.title) !== NA ? fmt(r.title) : fmt(r.kind),
                    meta: `${scheduled} · ${fmt(r.kind)}`,
                    status: rawStatus,
                  };
                });
                return (
                  <Panel title="Uzdevumi un plānotās darbības" count={items.length}>
                    {plannedActionsQ.isLoading && items.length === 0 ? (
                      <Empty label="Ielādē..." />
                    ) : items.length === 0 ? (
                      <Empty />
                    ) : (
                      <ul className="divide-y">
                        {items.map((it) => (
                          <li
                            key={it.key}
                            className="flex items-center justify-between gap-2 py-2"
                          >
                            <div className="min-w-0">
                              <div className="text-sm truncate">{it.title}</div>
                              {it.subtitle && (
                                <div className="text-xs text-foreground/80 truncate">
                                  {it.subtitle}
                                </div>
                              )}
                              <div className="text-[11px] text-muted-foreground">
                                {it.meta}
                              </div>
                            </div>
                            <StatusBadge status={it.status} />
                          </li>
                        ))}
                      </ul>
                    )}
                  </Panel>
                );
              })()}

              {/* Aktivitātes */}
              <Panel title="Aktivitātes" count={timeline.length}>
                {timeline.length === 0 ? (
                  <Empty />
                ) : (
                  <ol className="relative space-y-2 max-h-[640px] overflow-auto pr-2">
                    {timeline.map((it) => {
                      const r = it.raw;
                      const isNote = it.kind === "note";
                      const ch = str(pick(r, "channel")).toLowerCase();
                      const dir = str(pick(r, "direction")).toLowerCase();
                      const inbound = dir.includes("in");
                      const activityId = !isNote ? str(pick(r, "id", "communication_id")) : "";
                      const rp = !isNote && activityId ? rawPayloadById.get(activityId) : undefined;
                      const isEmail = ch.includes("mail");
                      const provider = !isNote ? str(pick(r, "provider")) : "";
                      const isSmartsheetNote = provider === "smartsheet_note";
                      const rpMeta =
                        rp && typeof rp.metadata === "object" && rp.metadata
                          ? (rp.metadata as Row)
                          : undefined;
                      const subject = isNote
                        ? str(pick(r, "note_type")) || "Piezīme"
                        : isEmail
                          ? (str(pick(r, "subject")) ||
                              (rp && (str(pick(rp, "automation_step")) || str(pick(rp, "template_key")))) ||
                              "Email")
                          : fmt(pick(r, "subject"));
                      const preview = isNote
                        ? str(pick(r, "content", "body"))
                        : isEmail
                          ? (str(pick(r, "body", "preview", "body_preview", "summary")) ||
                              (rpMeta && str(pick(rpMeta, "smartsheet_comment_text"))) ||
                              (rp && str(pick(rp, "text_body", "html_body"))) ||
                              "")
                          : str(pick(r, "preview", "body_preview", "summary"));
                      const dateValue = isNote
                        ? pick(r, "created_at", "updated_at")
                        : isEmail
                          ? ((rp && pick(rp, "sent_at")) ||
                              pick(r, "sent_at", "occurred_at", "created_at"))
                          : pick(r, "created_at", "occurred_at", "sent_at", "updated_at");
                      const statusValue = isNote
                        ? ""
                        : (rp && str(pick(rp, "current_status"))) ||
                            str(pick(r, "status", "current_status"));
                      // Resolve template label. raw_payload.template_key is
                      // often a UUID (template_version_id); prefer the
                      // automation_step text and ignore UUID-shaped values.
                      const rMeta = !isNote && r && typeof r.metadata === "object" && r.metadata
                        ? (r.metadata as Row)
                        : undefined;
                      const tplLabel = !isNote && isEmail
                        ? resolveTemplateLabel(
                            rp && pick(rp, "automation_step"),
                            rpMeta && pick(rpMeta, "automation_step"),
                            rMeta && pick(rMeta, "automation_step"),
                            pick(r, "automation_step"),
                            rp && pick(rp, "template_key"),
                            rpMeta && pick(rpMeta, "template_key"),
                            rMeta && pick(rMeta, "template_key"),
                            pick(r, "template_key"),
                          )
                        : "";
                      // bg by kind/channel
                      let bg = "bg-muted/30";
                      let accent = "border-l-muted-foreground/40";
                      if (isNote) {
                        bg = "bg-amber-50 dark:bg-amber-950/20";
                        accent = "border-l-amber-400";
                      } else if (ch.includes("mail")) {
                        bg = "bg-blue-50 dark:bg-blue-950/20";
                        accent = inbound ? "border-l-emerald-500" : "border-l-blue-500";
                      } else if (ch.includes("phone") || ch.includes("call")) {
                        bg = "bg-emerald-50 dark:bg-emerald-950/20";
                        accent = inbound ? "border-l-emerald-500" : "border-l-blue-500";
                      } else if (ch.includes("whats") || ch.includes("sms") || ch.includes("chat")) {
                        bg = "bg-violet-50 dark:bg-violet-950/20";
                        accent = inbound ? "border-l-emerald-500" : "border-l-blue-500";
                      }
                      return (
                        <li key={it.key}>
                          <button
                            type="button"
                            onClick={() => setOpenItem(it)}
                            className={`group w-full text-left flex gap-3 rounded-md border border-l-4 ${accent} ${bg} px-3 py-2 transition-colors hover:brightness-95 dark:hover:brightness-110`}
                          >
                            <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-background/80 text-muted-foreground">
                              {isNote ? <StickyNote className="h-3.5 w-3.5" /> : channelIcon(ch)}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex items-center gap-1.5 text-xs">
                                  <span className="font-medium capitalize">
                                    {isNote ? "Piezīme" : fmt(ch)}
                                  </span>
                                  {!isNote && dir && (
                                    <span className="inline-flex items-center gap-0.5 rounded-full bg-background/70 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                      {inbound ? (
                                        <>
                                          <ArrowDownLeft className="h-3 w-3" /> Ienākošs
                                        </>
                                      ) : (
                                        <>
                                          <ArrowUpRight className="h-3 w-3" /> Izejošs
                                        </>
                                      )}
                                    </span>
                                  )}
                                  {isEmail && tplLabel && (
                                    <span
                                      title={templateKey}
                                      className="inline-flex items-center rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary"
                                    >
                                      {tplLabel}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2">
                                  {!isNote && (
                                    <StatusBadge status={statusValue} />
                                  )}
                                  <span className="text-[11px] text-muted-foreground tabular-nums">
                                    {fmtDate(dateValue)}
                                  </span>
                                </div>
                              </div>
                              <div className="mt-0.5 text-sm font-medium truncate">{subject}</div>
                              {isSmartsheetNote && (
                                <div className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground/70">
                                  Imported from Smartsheet note
                                </div>
                              )}
                              <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground whitespace-pre-wrap">
                                {cleanPreview(preview) || "Nav teksta priekšskatījuma"}
                              </div>
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </Panel>
            </div>
          </div>

          {/* Technical raw preview — last, collapsed by default */}
          <Card className="shadow-sm">
            <CardHeader className="px-4 py-3 border-b">
              <button
                type="button"
                onClick={() => setShowRaw((v) => !v)}
                className="flex w-full items-center justify-between gap-2 text-left"
              >
                <CardTitle className="text-sm font-medium">Tehniskais skats</CardTitle>
                {showRaw ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )}
              </button>
            </CardHeader>
            {showRaw && (
              <CardContent className="p-4">
                <pre className="max-h-[480px] overflow-auto rounded-md border bg-muted p-3 text-xs">
                  {JSON.stringify(profile, null, 2)}
                </pre>
              </CardContent>
            )}
          </Card>

          {/* Activity detail modal */}
          <Dialog open={!!openItem} onOpenChange={(o) => !o && setOpenItem(null)}>
            <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col p-0">
              {openItem && (() => {
                const r = openItem.raw;
                const isNote = openItem.kind === "note";
                const ch = str(pick(r, "channel"));
                const dir = str(pick(r, "direction"));
                const activityId = str(pick(r, "id", "communication_id"));
                const rp = !isNote && activityId ? rawPayloadById.get(activityId) : undefined;
                const isEmail = ch.toLowerCase().includes("mail");
                const rpMeta =
                  rp && typeof rp.metadata === "object" && rp.metadata
                    ? (rp.metadata as Row)
                    : undefined;
                const subject = isNote
                  ? str(pick(r, "note_type")) || "Piezīme"
                  : isEmail
                    ? (str(pick(r, "subject")) ||
                        (rp && (str(pick(rp, "automation_step")) || str(pick(rp, "template_key")))) ||
                        "Email")
                    : fmt(pick(r, "subject"));
                const dateValue = isNote
                  ? pick(r, "created_at", "updated_at")
                  : isEmail
                    ? ((rp && pick(rp, "sent_at")) || pick(r, "sent_at", "created_at"))
                    : pick(r, "created_at", "occurred_at", "sent_at", "updated_at");
                const statusValue = isNote
                  ? ""
                  : (rp && str(pick(rp, "current_status"))) ||
                      str(pick(r, "status", "current_status"));
                const provider = !isNote ? str(pick(r, "provider")) : "";
                const toAddress = rp ? str(pick(rp, "to_address")) : "";
                const templateKey = rp ? str(pick(rp, "template_key")) : "";
                const automationStep = rp ? str(pick(rp, "automation_step")) : "";
                const importedAt = !isNote ? str(pick(r, "created_at")) : "";
                const payloadHtml = rp
                  ? str(pick(rp, "html_body", "html", "body_html", "content_html"))
                  : "";
                const inlineHtml = str(pick(r, "body_html", "html", "html_body", "content_html"));
                const htmlBody = payloadHtml || inlineHtml;
                const smartsheetText = rpMeta ? str(pick(rpMeta, "smartsheet_comment_text")) : "";
                const payloadText = rp ? str(pick(rp, "text_body")) : "";
                const textBody =
                  (isEmail
                    ? str(pick(r, "body"))
                    : str(pick(r, "body_text", "body", "content", "preview", "body_preview", "summary"))) ||
                  smartsheetText ||
                  payloadText ||
                  (isEmail ? "" : str(pick(r, "body_text", "preview", "body_preview", "summary")));
                const bodyLooksHtml = !!htmlBody || /<[a-z][\s\S]*>/i.test(textBody);
                const rawForRender = htmlBody || textBody || str(pick(r, "subject"));
                const body = rawForRender || "";
                const replyTo =
                  dir.toLowerCase().includes("in")
                    ? str(pick(r, "from_address", "sender", "email")) || (rp ? str(pick(rp, "from_address", "sender", "email")) : "") || primaryEmail
                    : toAddress || primaryEmail;
                const buildMailto = (mode: "reply" | "forward") => {
                  const prefix = mode === "reply" ? "RE: " : "FW: ";
                  const needsPrefix = !new RegExp(`^${prefix.trim()}`, "i").test(subject.trim());
                  const params = new URLSearchParams();
                  params.set("subject", `${needsPrefix ? prefix : ""}${subject || "(bez temata)"}`);
                  if (body) {
                    params.set(
                      "body",
                      `\n\n--- ${mode === "reply" ? "Sākotnējā ziņa" : "Pārsūtītā ziņa"} ---\nDatums: ${fmtDate(dateValue)}\nTēma: ${subject}\n\n${body.replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, "").trim()}`,
                    );
                  }
                  return `mailto:${encodeURIComponent(mode === "reply" ? replyTo : "")}?${params.toString().replace(/\+/g, "%20")}`;
                };
                const handleReply = () => {
                  if (!replyTo) {
                    toast.warning("Nav atrasta saņēmēja e-pasta adrese atbildei.");
                    return;
                  }
                  window.location.href = buildMailto("reply");
                };
                const handleForward = () => {
                  window.location.href = buildMailto("forward");
                };
                if (!isNote && ch.toLowerCase() === "email" && !htmlBody) {
                  console.warn(
                    "No HTML body found for email activity",
                    activityId,
                    rp ? Object.keys(rp) : [],
                    Object.keys(r),
                  );
                }
                const safeHtml = bodyLooksHtml && body
                  ? DOMPurify.sanitize(body, {
                      USE_PROFILES: { html: true },
                      ADD_ATTR: ["target", "rel"],
                    })
                  : "";
                return (
                  <>
                    <div className="sticky top-0 z-20 shrink-0 overflow-visible border-b bg-background p-6 pb-3 pr-16">
                      <DialogHeader className="overflow-visible">
                        <div className="flex items-center justify-between w-full gap-4">
                          <div className="flex items-center gap-2">
                            {!isNote && isEmail && (
                              <>
                                <Button
                                  size="sm"
                                  className="bg-[#95B3D7] text-white border border-[#7a9bc4] hover:bg-[#7a9bc4]"
                                  onClick={handleReply}
                                  disabled={!replyTo}
                                >
                                  <Reply className="h-3.5 w-3.5 mr-1" />
                                  Atbildēt
                                </Button>
                                <Button
                                  size="sm"
                                  className="bg-[#95B3D7] text-white border border-[#7a9bc4] hover:bg-[#7a9bc4]"
                                  onClick={handleForward}
                                >
                                  <Forward className="h-3.5 w-3.5 mr-1" />
                                  Pārsūtīt
                                </Button>
                              </>
                            )}
                          </div>
                          <DialogClose asChild>
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label="Aizvērt"
                              className="h-8 w-8 shrink-0"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </DialogClose>
                        </div>
                        <DialogTitle className="flex min-w-0 items-center gap-2 text-base mt-2">
                          {isNote ? <StickyNote className="h-4 w-4 shrink-0" /> : channelIcon(ch)}
                          <span className="truncate">{subject}</span>
                        </DialogTitle>
                      </DialogHeader>
                      <div className="grid grid-cols-2 gap-3 mt-2 text-xs">
                      {!isNote && <Field label="Kanāls" value={fmt(ch)} />}
                      {!isNote && <Field label="Virziens" value={fmt(dir)} />}
                      {!isNote && (
                        <Field
                          label="Status"
                          value={<StatusBadge status={statusValue} />}
                        />
                      )}
                      {!isNote && <Field label="Sniedzējs" value={fmt(provider)} />}
                      <Field label="Datums" value={fmtDate(dateValue)} />
                      {!isNote && toAddress && <Field label="To" value={toAddress} />}
                      {!isNote && templateKey && <Field label="Template" value={templateKey} />}
                      {!isNote && automationStep && (
                        <Field label="Automation step" value={automationStep} />
                      )}
                      {!isNote && importedAt && (
                        <Field label="Imported at" value={fmtDate(importedAt)} />
                      )}
                      {isNote && (
                        <Field label="Tips" value={fmt(pick(r, "note_type"))} />
                      )}
                      </div>
                    </div>
                    <div className="flex-1 min-h-0 overflow-auto p-6 pt-3">
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                        Saturs
                      </div>
                      {body ? (
                        bodyLooksHtml ? (
                          <div
                            className="prose prose-sm max-w-none rounded-md border bg-muted/20 p-3 text-sm [&_a]:text-primary [&_a]:underline"
                            dangerouslySetInnerHTML={{ __html: safeHtml }}
                          />
                        ) : (
                          <pre className="whitespace-pre-wrap rounded-md border bg-muted/20 p-3 text-sm text-foreground">
                            {body}
                          </pre>
                        )
                      ) : (
                        <div className="text-sm text-muted-foreground">Nav satura.</div>
                      )}
                    </div>
                  </>
                );
              })()}
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}
