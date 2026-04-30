import { createFileRoute, Link } from "@tanstack/react-router";
import { Children, Fragment, isValidElement, useMemo, useState } from "react";
import { ArrowLeft, Mail, MessageSquare, Send, Phone, MessageCircle } from "lucide-react";

import { LoadingState, ErrorState, EmptyState } from "@/components/DataState";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAnalyticsView } from "@/hooks/useAnalyticsView";
import { usePublicTable } from "@/hooks/usePublicTable";

export const Route = createFileRoute("/lead/$leadId")({
  component: LeadProfilePage,
});

/* -------------------------- helpers -------------------------- */

const NA = "Nav datu";

function isEmptyValue(value: unknown): boolean {
  if (value == null) return true;
  if (Array.isArray(value)) {
    return value.every((v) => v == null || String(v).trim() === "");
  }
  if (typeof value === "object") {
    try {
      const s = JSON.stringify(value);
      return s === "{}" || s === "[]" || s === "null";
    } catch {
      return false;
    }
  }
  return String(value).trim() === "";
}

function fmt(value: unknown): string {
  if (value == null) return NA;
  if (Array.isArray(value)) {
    const arr = value
      .map((v) => (v == null ? "" : String(v)))
      .filter((s) => s.trim() !== "");
    return arr.length === 0 ? NA : arr.join(", ");
  }
  if (typeof value === "object") {
    try {
      const s = JSON.stringify(value);
      return s === "{}" || s === "[]" ? NA : s;
    } catch {
      return String(value);
    }
  }
  const s = String(value).trim();
  return s === "" ? NA : s;
}

function fmtDate(value: unknown): string {
  if (value == null || value === "") return "";
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString("lv-LV", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtDateOnly(value: unknown): string {
  if (value == null || value === "") return "";
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString("lv-LV", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function fmtBool(value: unknown): string {
  if (value == null || value === "") return "";
  if (typeof value === "boolean") return value ? "Jā" : "Nē";
  const s = String(value).trim().toLowerCase();
  if (["true", "t", "1", "yes", "ja", "jā"].includes(s)) return "Jā";
  if (["false", "f", "0", "no", "ne", "nē"].includes(s)) return "Nē";
  return String(value);
}

function prettifyText(s: string): string {
  return s.includes("_") ? s.replace(/_/g, " ") : s;
}

/** Look up a field in row OR row.metadata (if metadata is an object). */
function pick(
  row: Record<string, unknown> | null | undefined,
  ...keys: string[]
): unknown {
  if (!row) return undefined;
  const meta =
    row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>)
      : null;
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null && row[k] !== "") return row[k];
    if (meta && meta[k] !== undefined && meta[k] !== null && meta[k] !== "")
      return meta[k];
  }
  return undefined;
}

const NEXT_ACTION_LV: Record<string, string> = {
  "contact immediately": "Sazināties nekavējoties",
  "warm follow-up": "Veikt atkārtotu kontaktu",
  "warm followup": "Veikt atkārtotu kontaktu",
  "start outreach": "Uzsākt komunikāciju",
  "try another channel": "Izmantot citu kanālu",
  "no action": "Nav darbību",
};

const CHANNEL_LV: Record<string, string> = {
  email: "E-pasts",
  sms: "SMS",
  call: "Zvans",
  whatsapp: "WhatsApp",
};

const DIRECTION_LV: Record<string, string> = {
  outbound: "Izejošs",
  inbound: "Ienākošs",
};

const COMM_STATUS_LV: Record<string, string> = {
  sent: "Nosūtīts",
  delivered: "Piegādāts",
  opened: "Atvērts",
  clicked: "Klikšķis",
  replied: "Atbilde",
  reply: "Atbilde",
  inbound_received: "Saņemts",
  bounced: "Atgriezts",
  complained: "Sūdzība",
  failed: "Neizdevās",
};

function tx(map: Record<string, string>, value: unknown): string {
  const raw = value == null ? "" : String(value).trim().toLowerCase();
  if (!raw) return NA;
  return map[raw] ?? String(value);
}

function txOpt(map: Record<string, string>, value: unknown): string {
  const raw = value == null ? "" : String(value).trim().toLowerCase();
  if (!raw) return "";
  return map[raw] ?? String(value);
}

/* -------------------------- page -------------------------- */

function LeadProfilePage() {
  const { leadId } = Route.useParams();
  const [openComm, setOpenComm] = useState<Record<string, unknown> | null>(null);

  // Galvenie lead dati
  const overviewQ = useAnalyticsView(
    "leads_overview",
    `lead_id=eq.${encodeURIComponent(leadId)}&limit=1`,
  );

  // Engagement kopsavilkums (var nebūt pieejams – kļūdu apstrādājam mīksti)
  const engagementQ = useAnalyticsView(
    "lead_engagement_summary",
    `lead_id=eq.${encodeURIComponent(leadId)}&limit=1`,
  );

  // Prioritāte
  const priorityQ = useAnalyticsView(
    "lead_priority_queue",
    `lead_id=eq.${encodeURIComponent(leadId)}&limit=1`,
  );

  const profile = (overviewQ.data?.rows?.[0] ?? null) as Record<
    string,
    unknown
  > | null;

  // currentLead.lead_id MUST come from analytics.leads_overview.lead_id
  // (which equals public.leads.id). No fallbacks.
  const currentLeadId = (profile?.lead_id as string | undefined) ?? null;

  // Komunikācijas — strikti pēc public.leads.id
  const commsQ = usePublicTable(
    "communications",
    currentLeadId
      ? `lead_id=eq.${encodeURIComponent(currentLeadId)}&select=id,lead_id,direction,channel,subject,from_address,to_address,current_status,sent_at,received_at,created_at,html_body,text_body,metadata,attachments_info,automation_step,template_key,reference_code&order=sent_at.desc.nullslast,received_at.desc.nullslast,created_at.desc.nullslast&limit=200`
      : "",
    { fresh: true, enabled: !!currentLeadId },
  );

  const engagement = (engagementQ.data?.rows?.[0] ?? null) as Record<
    string,
    unknown
  > | null;
  const priorityRow = (priorityQ.data?.rows?.[0] ?? null) as Record<
    string,
    unknown
  > | null;

  const profileError =
    (overviewQ.error as Error | null)?.message || overviewQ.data?.error;

  // Tolerant to both shapes: { rows: [...] } (server fn) or [...] (raw array)
  const comms = (
    Array.isArray(commsQ.data)
      ? commsQ.data
      : (commsQ.data?.rows ?? [])
  ) as Array<Record<string, unknown>>;
  const commsError =
    (commsQ.error as Error | null)?.message ||
    (Array.isArray(commsQ.data) ? null : commsQ.data?.error);

  const commIds = useMemo(
    () =>
      comms
        .map((c) => c.id ?? c.communication_id)
        .filter((v): v is string | number => v != null),
    [comms],
  );
  const hasComms = commIds.length > 0;
  const eventsQueryStr = hasComms
    ? `communication_id=in.(${commIds.map((id) => String(id)).join(",")})&order=event_timestamp.asc&limit=2000`
    : "";
  const eventsQ = usePublicTable("communication_events", eventsQueryStr, {
    enabled: hasComms,
    fresh: true,
  });

  const trackingLinksQueryStr = hasComms
    ? `communication_id=in.(${commIds.map((id) => String(id)).join(",")})&select=id,communication_id,link_key,tracking_code,original_url,destination_url,metadata&limit=2000`
    : "";
  const trackingLinksQ = usePublicTable("tracking_links", trackingLinksQueryStr, {
    enabled: hasComms,
    fresh: true,
  });

  const eventsByComm = useMemo(() => {
    const map = new Map<string, Array<Record<string, unknown>>>();
    if (!hasComms) return map;
    const rows = (eventsQ.data?.rows ?? []) as Array<Record<string, unknown>>;
    for (const ev of rows) {
      const k = String(ev.communication_id ?? "");
      if (!k) continue;
      const list = map.get(k) ?? [];
      list.push(ev);
      map.set(k, list);
    }
    return map;
  }, [eventsQ.data, hasComms]);

  const trackingLinksByComm = useMemo(() => {
    const map = new Map<string, Array<Record<string, unknown>>>();
    const rows = (trackingLinksQ.data?.rows ?? []) as Array<Record<string, unknown>>;
    for (const link of rows) {
      const k = String(link.communication_id ?? "");
      if (!k) continue;
      const list = map.get(k) ?? [];
      list.push(link);
      map.set(k, list);
    }
    return map;
  }, [trackingLinksQ.data]);

  /* ------ lauku izvilkšana ------ */

  const fullNameRaw = pick(profile, "full_name", "name");
  const fullName = fullNameRaw ? String(fullNameRaw) : `Lead #${leadId}`;
  const status = pick(profile, "status", "current_status");
  const rating = pick(profile, "rating");
  const priority =
    pick(priorityRow, "priority") ?? pick(profile, "priority");
  const tagsRaw = pick(profile, "tags");
  const tagsStr = isEmptyValue(tagsRaw) ? "" : fmt(tagsRaw);
  const ppv = pick(profile, "ppv_vards", "ppv", "ppv_name");
  const owner = pick(profile, "owner", "owner_name");

  const email = pick(profile, "email");
  const phone = pick(profile, "phone_raw", "phone");
  const country = pick(profile, "country");
  const source = pick(profile, "source");
  const sourceDetailed = pick(profile, "source_detailed");
  const b2bRaw = pick(profile, "is_b2b", "b2b");
  const b2b = b2bRaw == null ? "" : fmtBool(b2bRaw);

  // Objekts / projekts
  const m2 = pick(profile, "platiba_m2");
  const summa = pick(profile, "summa");
  const planotaBuvniecibaText = pick(profile, "planota_buvnieciba_text");
  const formaZeme = pick(profile, "forma_zeme");
  const formaProjekts = pick(profile, "forma_projekts");
  const formaZinaNoLead = pick(profile, "forma_zina_no_lead");

  // Darba info
  const nextActionRaw = pick(profile, "next_action");
  const nextActionTr = nextActionRaw
    ? NEXT_ACTION_LV[String(nextActionRaw).trim().toLowerCase()] ?? String(nextActionRaw)
    : "";
  const termins = fmtDate(pick(profile, "next_action_due_date", "due_date"));
  const lastContact = fmtDate(pick(profile, "last_contact_date", "last_contact_at"));
  const automatizacija = pick(profile, "automation", "automation_name", "automation_status");
  const automatizacijasDatums = fmtDate(pick(profile, "automation_date", "automation_at"));
  const atcelsanasIemesls = pick(
    profile,
    "cancel_reason",
    "atcelšanas_iemesls",
    "cancellation_reason",
  );
  const situacijasPiezimes = pick(profile, "situation_notes", "situācijas_piezīmes", "notes");

  // Engagement / reaction
  const lastEvent = pick(engagement ?? undefined, "last_event_type", "last_event");
  const lastEventAt = fmtDate(
    pick(engagement ?? undefined, "last_event_at", "last_activity_at"),
  );
  const reactionRaw = pick(
    engagement ?? undefined,
    "has_reaction",
    "reacted",
    "positive_reactions",
  );
  const reaction =
    reactionRaw == null
      ? ""
      : typeof reactionRaw === "number"
        ? reactionRaw > 0
          ? "Jā"
          : "Nē"
        : fmtBool(reactionRaw);
  const reactionType = pick(engagement ?? undefined, "last_reaction_type", "reaction_type");

  // Tehniski
  const syncedAt = fmtDate(pick(profile, "synced_at", "updated_at"));
  const metaRaw = profile?.metadata;
  const metaStr =
    metaRaw && typeof metaRaw === "object"
      ? JSON.stringify(metaRaw, null, 2)
      : metaRaw == null
        ? NA
        : String(metaRaw);

  return (
    <>
      <div className="mb-2">
        <Button asChild variant="ghost" size="sm" className="h-8 px-2">
          <Link to="/darba-rinda">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Atpakaļ uz Darba rindu
          </Link>
        </Button>
      </div>

      {profileError && <ErrorState message={profileError} />}
      {!profileError && overviewQ.isLoading && <LoadingState />}
      {!profileError && !overviewQ.isLoading && !profile && (
        <EmptyState label="Profils nav atrasts" />
      )}

      {profile && (
        <div className="space-y-3">
          {/* === Header — kompakta rinda === */}
          <header className="rounded-lg border border-border bg-card px-4 py-3 shadow-sm">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
              <h1 className="text-base font-semibold text-foreground">{fullName}</h1>
              <InlineField label="Statuss" value={status} />
              <InlineField
                label="Reitings · Prioritāte"
                value={
                  isEmptyValue(rating) && isEmptyValue(priority)
                    ? ""
                    : `${isEmptyValue(rating) ? "—" : String(rating)} · ${
                        isEmptyValue(priority) ? "—" : String(priority)
                      }`
                }
              />
              <InlineField label="Tagi" value={tagsStr} />
              <InlineField label="PPV" value={ppv} />
              <span className="ml-auto font-mono text-[11px] text-muted-foreground">
                {leadId}
              </span>
            </div>
            {(!isEmptyValue(email) || !isEmptyValue(phone) || !isEmptyValue(country)) && (
              <div className="mt-1.5 flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-border/60 pt-1.5">
                <InlineField label="Email" value={email} />
                <InlineField label="Telefons" value={phone} />
                <InlineField label="Valsts" value={country} />
              </div>
            )}
          </header>

          {/* === Nākamā darbība === */}
          <section className="rounded-lg border-2 border-primary/40 bg-primary/5 px-4 py-2.5 shadow-sm ring-1 ring-primary/10">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-primary">
                Nākamā darbība
              </span>
              <InlineField label="Darbība" value={nextActionTr} alwaysShow />
              <InlineField label="Atbildīgais" value={owner} alwaysShow />
              <InlineField label="Termiņš" value={termins} alwaysShow />
              <div className="ml-auto flex items-center gap-1">
                <ActionIconButton title="E-pasts" icon={Mail} />
                <ActionIconButton title="SMS" icon={MessageSquare} />
                <ActionIconButton title="Telegram" icon={Send} />
                <ActionIconButton title="Zvans" icon={Phone} />
                <ActionIconButton title="WhatsApp" icon={MessageCircle} />
              </div>
            </div>
          </section>

          {/* === CILNES === */}
          <Tabs defaultValue="parskats" className="w-full">
            <TabsList className="h-8">
              <TabsTrigger value="parskats" className="text-xs">Pārskats</TabsTrigger>
              <TabsTrigger value="projekts" className="text-xs">Projekts</TabsTrigger>
              <TabsTrigger value="tehniski" className="text-xs">Tehniski</TabsTrigger>
            </TabsList>

            <TabsContent value="parskats" className="mt-2">
              <Section title="Pārskats">
                <Grid>
                  <Field label="Avots" value={source} alwaysShow />
                  <Field label="Detalizēts avots" value={sourceDetailed} alwaysShow />
                  <Field label="B2B" value={b2b} alwaysShow />
                  <Field label="Pēdējais notikums" value={lastEvent} alwaysShow />
                  <Field label="Pēdējā aktivitāte" value={lastEventAt} alwaysShow />
                  <Field label="Reakcija" value={reaction} alwaysShow />
                  <Field label="Reakcijas tips" value={reactionType} alwaysShow />
                  <Field label="Pēdējās saziņas datums" value={lastContact} alwaysShow />
                  <Field label="Automatizācija" value={automatizacija} alwaysShow />
                  <Field label="Automatizācijas datums" value={automatizacijasDatums} alwaysShow />
                  <Field label="Atcelšanas iemesls" value={atcelsanasIemesls} alwaysShow />
                  <Field label="Situācijas piezīmes" value={situacijasPiezimes} wide alwaysShow />
                </Grid>
              </Section>
            </TabsContent>

            <TabsContent value="projekts" className="mt-2">
              {(() => {
                const allEmpty =
                  isEmptyValue(m2) &&
                  isEmptyValue(summa) &&
                  isEmptyValue(planotaBuvniecibaText) &&
                  isEmptyValue(formaZeme) &&
                  isEmptyValue(formaProjekts) &&
                  isEmptyValue(formaZinaNoLead);
                return (
                  <section className="rounded-lg border border-border bg-card px-4 py-3 shadow-sm">
                    <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Projekts
                    </h2>
                    {allEmpty ? (
                      <div className="text-xs italic text-muted-foreground">
                        Nav projekta informācijas
                      </div>
                    ) : (
                      <Grid>
                        <Field label="m²" value={m2} alwaysShow />
                        <Field label="Summa" value={summa} alwaysShow />
                        <Field label="Plānota būvniecība" value={planotaBuvniecibaText} alwaysShow />
                        <Field label="Forma · Zeme" value={formaZeme} alwaysShow />
                        <Field label="Forma · Projekts" value={formaProjekts} alwaysShow />
                        <Field label="Forma · Ziņa no Lead" value={formaZinaNoLead} wide alwaysShow />
                      </Grid>
                    )}
                  </section>
                );
              })()}
            </TabsContent>

            <TabsContent value="tehniski" className="mt-2">
              <Section title="Tehniski">
                <Grid>
                  <Field label="lead_id" value={leadId} mono />
                  <Field label="synced_at" value={syncedAt} />
                  <Field label="Komunikāciju skaits" value={String(comms.length)} />
                  <Field
                    label="Notikumu skaits"
                    value={String(
                      Array.from(eventsByComm.values()).reduce(
                        (sum, arr) => sum + arr.length,
                        0,
                      ),
                    )}
                  />
                </Grid>
                <div className="mt-2">
                  <div className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                    metadata
                  </div>
                  <pre className="max-h-72 overflow-auto rounded-md border border-border bg-muted/30 p-2 text-[11px] leading-snug text-foreground">
                    {metaStr}
                  </pre>
                </div>
              </Section>
            </TabsContent>
          </Tabs>

          {/* === Komunikācijas (ārpus cilnēm) === */}
          <section className="rounded-lg border border-border bg-card px-4 py-3 shadow-sm">
            <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Komunikāciju vēsture
            </h2>
            <CommunicationsTimeline
              comms={comms}
              loading={commsQ.isLoading}
              error={commsError}
              eventsByComm={eventsByComm}
              trackingLinksByComm={trackingLinksByComm}
              eventsLoading={hasComms && eventsQ.isLoading}
              onOpenEmail={(c) => setOpenComm(c)}
            />
          </section>
        </div>
      )}

      <EmailPreviewDialog comm={openComm} onClose={() => setOpenComm(null)} />
    </>
  );
}

/* -------------------------- layout primitives -------------------------- */

/** Recursively check whether a React subtree contains any visible Field. */
function hasAnyField(children: React.ReactNode): boolean {
  let found = false;
  Children.forEach(children, (child) => {
    if (found) return;
    if (!isValidElement(child)) return;
    const t = child.type as unknown as { displayName?: string; name?: string };
    const name = t?.displayName || t?.name;
    if (name === "Field") {
      found = true;
      return;
    }
    const sub = (child.props as { children?: React.ReactNode })?.children;
    if (sub && hasAnyField(sub)) found = true;
  });
  return found;
}

function Section({
  title,
  children,
  emptyLabel,
}: {
  title: string;
  children: React.ReactNode;
  emptyLabel?: string;
}) {
  const empty = !hasAnyField(children);
  return (
    <section className="rounded-lg border border-border bg-card px-4 py-3 shadow-sm">
      <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      {empty ? (
        <div className="text-xs italic text-muted-foreground">
          {emptyLabel ?? NA}
        </div>
      ) : (
        children
      )}
    </section>
  );
}

function CompactSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-card px-4 py-2 shadow-sm">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </span>
        {children}
      </div>
    </section>
  );
}

function ActionIconButton({
  title,
  icon: Icon,
  onClick,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid gap-x-5 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
      {children}
    </div>
  );
}

function Field({
  label,
  value,
  mono,
  emphasize,
  wide,
  alwaysShow,
}: {
  label: string;
  value: unknown;
  mono?: boolean;
  emphasize?: boolean;
  wide?: boolean;
  alwaysShow?: boolean;
}) {
  const empty = isEmptyValue(value);
  if (empty && !alwaysShow) return null;
  const display = empty ? "\u00A0" : typeof value === "string" ? value : fmt(value);
  const shown = empty ? "\u00A0" : prettifyText(display);
  return (
    <div
      className={`flex items-baseline gap-2 text-sm ${
        wide ? "sm:col-span-2 lg:col-span-3" : ""
      }`}
    >
      <span className="shrink-0 text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span
        className={[
          "min-w-0 text-foreground",
          mono ? "font-mono text-xs" : "",
          "font-semibold",
          wide ? "whitespace-pre-wrap break-words" : "truncate",
        ]
          .filter(Boolean)
          .join(" ")}
        title={wide ? undefined : shown}
      >
        {shown}
      </span>
    </div>
  );
}
Field.displayName = "Field";

function InlineField({
  label,
  value,
  emphasize,
  alwaysShow,
}: {
  label: string;
  value: unknown;
  emphasize?: boolean;
  alwaysShow?: boolean;
}) {
  const empty = isEmptyValue(value);
  if (empty && !alwaysShow) return null;
  const display = empty ? "\u00A0" : typeof value === "string" ? value : fmt(value);
  const shown = empty ? "\u00A0" : prettifyText(display);
  return (
    <span className="inline-flex items-baseline gap-1.5 text-sm">
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span
        className="font-semibold text-foreground"
      >
        {shown}
      </span>
    </span>
  );
}

/* -------------------------- communications timeline -------------------------- */

const EVENT_DOT_CLS: Record<string, string> = {
  sent: "bg-blue-500",
  delivered: "bg-emerald-500",
  opened: "bg-sky-500",
  clicked: "bg-violet-500",
  replied: "bg-primary",
  reply: "bg-primary",
  inbound_received: "bg-primary",
  bounced: "bg-amber-500",
  complained: "bg-amber-600",
  failed: "bg-destructive",
};

function eventDotCls(eventType: unknown): string {
  const k = String(eventType ?? "").trim().toLowerCase();
  return EVENT_DOT_CLS[k] ?? "bg-muted-foreground/60";
}

const CLICK_TAG_LV: Record<string, string> = {
  cta: "CTA poga",
  ppv_email: "PPV e-pasts",
  ppv_phone: "Telefons",
  phone: "Telefons",
  website: "Mājaslapa",
  homepage: "Mājaslapa",
};

function metaValue(row: Record<string, unknown>, key: string): unknown {
  const meta = row.metadata;
  return meta && typeof meta === "object" && !Array.isArray(meta)
    ? (meta as Record<string, unknown>)[key]
    : undefined;
}

function emailStep(c: Record<string, unknown>): string {
  const value = c.automation_step ?? c.template_key ?? c.content_ref ?? metaValue(c, "automation_step");
  return value == null || String(value).trim() === "" ? "" : String(value);
}

function subjectText(c: Record<string, unknown>): string {
  const value = c.subject ?? metaValue(c, "email_subject");
  return value == null || String(value).trim() === "" ? NA : String(value);
}

function eventLinkKey(ev: Record<string, unknown>): string {
  const raw = ev.raw_payload;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const key = (raw as Record<string, unknown>).link_key;
    if (key != null && String(key).trim() !== "") return String(key);
  }
  return String(ev.tracking_link_id ?? "");
}

function linkTypeLabel(link: Record<string, unknown>): string {
  const type = String(metaValue(link, "link_type") ?? "").trim().toLowerCase();
  if (CLICK_TAG_LV[type]) return CLICK_TAG_LV[type];
  const url = String(link.destination_url ?? link.original_url ?? "").toLowerCase();
  if (url.startsWith("tel:")) return "Telefons";
  if (url.startsWith("mailto:")) return "PPV e-pasts";
  if (url.includes("tivohouses")) return "Mājaslapa";
  return "CTA poga";
}

function clickTagsForEvent(
  ev: Record<string, unknown>,
  links: Array<Record<string, unknown>>,
): string[] {
  if (String(ev.event_type ?? "").trim().toLowerCase() !== "clicked") return [];
  const key = eventLinkKey(ev);
  const matched = links.find(
    (link) =>
      String(link.link_key ?? link.tracking_code ?? link.id ?? "") === key,
  );
  const labels = matched ? [linkTypeLabel(matched)] : links.map(linkTypeLabel);
  return Array.from(new Set(labels)).filter(Boolean);
}

function ClickTag({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
      {children}
    </span>
  );
}

function CommunicationsTimeline({
  comms,
  loading,
  error,
  eventsByComm,
  trackingLinksByComm,
  eventsLoading,
  onOpenEmail,
}: {
  comms: Array<Record<string, unknown>>;
  loading: boolean;
  error?: string | null;
  eventsByComm: Map<string, Array<Record<string, unknown>>>;
  trackingLinksByComm: Map<string, Array<Record<string, unknown>>>;
  eventsLoading: boolean;
  onOpenEmail?: (c: Record<string, unknown>) => void;
}) {
  if (error) return <ErrorState message={error} />;
  if (loading) return <LoadingState />;
  if (!comms || comms.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border bg-muted/20 p-4 text-sm text-muted-foreground">
        Komunikāciju vēl nav
      </div>
    );
  }

  // Sort newest -> oldest by coalesce(sent_at, received_at, created_at)
  const sorted = [...comms].sort((a, b) => {
    const ta =
      new Date(String(a.sent_at ?? a.received_at ?? a.created_at ?? 0)).getTime() ||
      0;
    const tb =
      new Date(String(b.sent_at ?? b.received_at ?? b.created_at ?? 0)).getTime() ||
      0;
    return tb - ta;
  });

  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="min-w-[980px] w-full border-collapse text-left text-xs">
        <thead className="bg-muted/40 text-muted-foreground">
          <tr className="border-b border-border">
            <th className="px-3 py-2 font-medium uppercase">Datums</th>
            <th className="px-3 py-2 font-medium uppercase">Kanāls</th>
            <th className="px-3 py-2 font-medium uppercase">Virziens</th>
            <th className="px-3 py-2 font-medium uppercase">Statuss</th>
            <th className="px-3 py-2 font-medium uppercase">E-pasta solis</th>
            <th className="px-3 py-2 font-medium uppercase">Temats</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((c, i) => {
            const sentAt = c.sent_at ?? c.received_at ?? c.created_at;
            const commId = String(c.id ?? c.communication_id ?? "");
            const events = commId ? eventsByComm.get(commId) ?? [] : [];
            const links = commId ? trackingLinksByComm.get(commId) ?? [] : [];

            return (
              <Fragment key={commId || i}>
                <tr key={`${commId || i}-row`} className="border-b border-border/60 align-top">
                  <td className="whitespace-nowrap px-3 py-2 text-foreground">{fmtDate(sentAt)}</td>
                  <td className="px-3 py-2">
                    {(() => {
                      const ch = String(c.channel ?? "").toLowerCase();
                      const isEmail = ch.includes("email") || ch.includes("mail") || ch.includes("past");
                      const badge = <ChannelBadge value={tx(CHANNEL_LV, c.channel)} />;
                      if (isEmail && onOpenEmail) {
                        return (
                          <button
                            type="button"
                            onClick={() => onOpenEmail(c)}
                            className="cursor-pointer hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-ring rounded"
                            title="Atvērt e-pastu"
                          >
                            {badge}
                          </button>
                        );
                      }
                      return badge;
                    })()}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-foreground">{tx(DIRECTION_LV, c.direction)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-foreground">{tx(COMM_STATUS_LV, c.current_status ?? c.status)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-foreground">{emailStep(c)}</td>
                  <td className="px-3 py-2 text-foreground">{subjectText(c)}</td>
                </tr>
                {(events.length > 0 || eventsLoading) && (
                  <tr key={`${commId || i}-events`} className="border-b border-border/60">
                    <td colSpan={6} className="px-7 pb-3 pt-0">
                      <div className="border-l border-border pl-3">
                        <div className="mb-1 text-[11px] font-medium uppercase text-foreground">
                          Notikumi ({events.length})
                        </div>
                        {eventsLoading && events.length === 0 ? (
                          <div className="text-xs text-muted-foreground">Ielādē notikumus...</div>
                        ) : (
                          <ol className="space-y-1">
                            {events.map((ev, j) => {
                              const tags = clickTagsForEvent(ev, links);
                              return (
                                <li key={j} className="flex flex-wrap items-center gap-2 text-xs">
                                  <span className={`h-1.5 w-1.5 rounded-full ${eventDotCls(ev.event_type)}`} />
                                  <span className="font-semibold text-foreground">{tx(COMM_STATUS_LV, ev.event_type)}</span>
                                  <span className="text-muted-foreground">{fmtDate(ev.event_timestamp)}</span>
                                  {tags.map((tag) => <ClickTag key={tag}>{tag}</ClickTag>)}
                                </li>
                              );
                            })}
                          </ol>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ChannelBadge({ value }: { value: string }) {
  const v = value.toLowerCase();
  let cls = "bg-muted text-muted-foreground";
  if (v.includes("e-past") || v.includes("email") || v.includes("pasts"))
    cls = "bg-blue-500/10 text-blue-700 dark:text-blue-300";
  else if (v.includes("sms"))
    cls = "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  else if (v.includes("zvan") || v.includes("call"))
    cls = "bg-amber-500/10 text-amber-700 dark:text-amber-300";
  else if (v.includes("whats"))
    cls = "bg-green-500/10 text-green-700 dark:text-green-300";
  return (
    <span
      className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${cls}`}
    >
      {value}
    </span>
  );
}

function readHtml(c: Record<string, unknown>): string {
  const direct = c.html_body;
  if (typeof direct === "string" && direct.trim() !== "") return direct;
  const meta = c.metadata as Record<string, unknown> | null | undefined;
  if (meta && typeof meta === "object") {
    const payload = (meta as Record<string, unknown>).resend_payload as
      | Record<string, unknown>
      | undefined;
    if (payload && typeof payload === "object") {
      const h = (payload as Record<string, unknown>).html;
      if (typeof h === "string" && h.trim() !== "") return h;
    }
  }
  return "";
}

function readText(c: Record<string, unknown>): string {
  const direct = c.text_body;
  if (typeof direct === "string" && direct.trim() !== "") return direct;
  const meta = c.metadata as Record<string, unknown> | null | undefined;
  if (meta && typeof meta === "object") {
    const payload = (meta as Record<string, unknown>).resend_payload as
      | Record<string, unknown>
      | undefined;
    if (payload && typeof payload === "object") {
      const t = (payload as Record<string, unknown>).text;
      if (typeof t === "string" && t.trim() !== "") return t;
    }
  }
  return "";
}

/** Render plain-text email with visual separation for quoted replies. */
function renderEmailText(text: string): React.ReactNode {
  // Split on a line of 10+ underscores (common reply separator)
  const parts = text.split(/(_{10,})/);
  const nodes: React.ReactNode[] = [];

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (/^_{10,}$/.test(part)) {
      // separator → visual divider with spacing
      nodes.push(<div key={`sep-${i}`} className="my-6 border-t-2 border-border" />);
    } else if (i > 0 && part.trim()) {
      // everything after the separator = quoted original email
      nodes.push(
        <div
          key={`q-${i}`}
          className="border-l-4 border-muted-foreground/30 pl-4 text-muted-foreground"
        >
          {formatEmailBlock(part.trim())}
        </div>,
      );
    } else if (part.trim()) {
      // reply text (before separator)
      nodes.push(<div key={`r-${i}`}>{part.trim()}</div>);
    }
  }
  return <>{nodes}</>;
}

/** Format an email text block: detect header lines and bullet points. */
function formatEmailBlock(block: string): React.ReactNode {
  // Try to detect email header pattern (Van:, From:, Verzonden:, Sent:, Aan:, To:, Onderwerp:, Subject:)
  const headerPattern = /^(Van|From|Verzonden|Sent|Aan|To|Onderwerp|Subject|Date|Datum|Cc|Bcc):\s*/im;
  const lines = block.split("\n");
  const result: React.ReactNode[] = [];

  // Detect if first line has inline headers like "Van: ... Verzonden: ... Aan: ... Onderwerp: ..."
  const firstLine = lines[0] || "";
  const inlineHeaders = firstLine.match(/(Van|From):\s/i) && firstLine.match(/(Onderwerp|Subject):\s/i);

  if (inlineHeaders) {
    // Split inline headers into separate lines
    const headerStr = lines.shift() || "";
    const headerKeys = ["Van", "From", "Verzonden", "Sent", "Aan", "To", "Onderwerp", "Subject", "Date", "Datum", "Cc", "Bcc"];
    const regex = new RegExp(`\\s*(?=(${headerKeys.join("|")}):\\s)`, "gi");
    const headerLines = headerStr.split(regex).filter((s) => s.trim());

    // Deduplicate: regex split may produce key-only fragments; rejoin them
    const merged: string[] = [];
    for (const h of headerLines) {
      if (headerKeys.some((k) => h.trim().toLowerCase() === k.toLowerCase())) {
        // This is just a key fragment, append next part
        merged.push(h);
      } else if (merged.length > 0 && headerKeys.some((k) => merged[merged.length - 1].trim().toLowerCase() === k.toLowerCase())) {
        merged[merged.length - 1] = merged[merged.length - 1] + h;
      } else {
        merged.push(h);
      }
    }

    result.push(
      <div key="hdrs" className="mb-3 space-y-0.5 text-xs">
        {merged.map((line, j) => {
          const colonIdx = line.indexOf(":");
          if (colonIdx > 0) {
            return (
              <div key={j}>
                <span className="font-semibold">{line.slice(0, colonIdx + 1)}</span>
                {line.slice(colonIdx + 1)}
              </div>
            );
          }
          return <div key={j}>{line}</div>;
        })}
      </div>,
    );

    // Remaining body
    const bodyText = lines.join("\n").trim();
    if (bodyText) {
      result.push(<div key="body">{bodyText}</div>);
    }
  } else {
    result.push(<Fragment key="plain">{block}</Fragment>);
  }

  return <>{result}</>;
}

function formatAttachments(value: unknown): string {
  if (value == null) return "";
  if (Array.isArray(value)) {
    const names = value
      .map((item) => {
        if (item == null) return "";
        if (typeof item === "string") return item;
        if (typeof item === "object") {
          const o = item as Record<string, unknown>;
          const name =
            o.filename ?? o.name ?? o.file_name ?? o.title ?? o.path;
          if (name != null && String(name).trim() !== "") return String(name);
          try {
            return JSON.stringify(o);
          } catch {
            return "";
          }
        }
        return String(item);
      })
      .map((s) => s.trim())
      .filter((s) => s !== "");
    return names.join(", ");
  }
  if (typeof value === "object") {
    try {
      const s = JSON.stringify(value);
      return s === "{}" || s === "[]" || s === "null" ? "" : s;
    } catch {
      return "";
    }
  }
  const s = String(value).trim();
  return s;
}

/* -------------------------- email modal -------------------------- */

function EmailPreviewDialog({
  comm,
  onClose,
}: {
  comm: Record<string, unknown> | null;
  onClose: () => void;
}) {
  const open = !!comm;
  const subject = comm ? fmt(comm.subject) : NA;
  const sentAt = comm ? fmtDate(comm.sent_at ?? comm.received_at) : NA;
  const html = useMemo(() => (comm ? readHtml(comm) : ""), [comm]);
  const text = useMemo(() => (comm ? readText(comm) : ""), [comm]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>E-pasta saturs</DialogTitle>
        </DialogHeader>
        <div className="grid gap-2 rounded-md border border-border bg-muted/30 p-3 text-sm">
          <div className="grid grid-cols-[120px_1fr] gap-2">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">
              Temats
            </span>
            <span className="text-foreground">{subject}</span>
          </div>
          <div className="grid grid-cols-[120px_1fr] gap-2">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">
              Datums
            </span>
            <span className="text-foreground">{sentAt}</span>
          </div>
        </div>

        <div className="mt-2 max-h-[60vh] overflow-hidden rounded-md border border-border bg-background">
          {html ? (
            <iframe
              title="E-pasta saturs"
              sandbox=""
              srcDoc={html}
              className="h-[60vh] w-full"
            />
          ) : text ? (
             <div className="max-h-[60vh] overflow-auto whitespace-pre-wrap p-4 text-sm text-foreground">
               {renderEmailText(text)}
             </div>
          ) : (
            <div className="p-6 text-sm text-muted-foreground">
              E-pasta saturs nav saglabāts.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
