import { createFileRoute, Link } from "@tanstack/react-router";
import { Children, isValidElement, useMemo, useState } from "react";
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

  // Komunikācijas
  const commsQ = usePublicTable(
    "communications",
    `lead_id=eq.${encodeURIComponent(leadId)}&order=sent_at.desc.nullslast&limit=200`,
    { fresh: true },
  );

  const profile = (overviewQ.data?.rows?.[0] ?? null) as Record<
    string,
    unknown
  > | null;
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

  const commsFetched = !commsQ.isLoading && commsQ.isFetched;
  const comms = commsFetched
    ? ((commsQ.data?.rows ?? []) as Array<Record<string, unknown>>)
    : [];
  const commsError =
    (commsQ.error as Error | null)?.message || commsQ.data?.error;

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

  /* ------ lauku izvilkšana ------ */

  const fullNameRaw = pick(profile, "full_name", "name");
  const fullName = fullNameRaw ? String(fullNameRaw) : `Lead #${leadId}`;
  const status = pick(profile, "status", "current_status");
  const rating = pick(profile, "rating");
  const priority =
    pick(priorityRow, "priority_score") ?? pick(profile, "priority_score");
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
          <Section title="Komunikācijas">
            <CommunicationsTimeline
              comms={comms}
              loading={commsQ.isLoading}
              error={commsError}
              eventsByComm={eventsByComm}
              eventsLoading={hasComms && eventsQ.isLoading}
              onOpenEmail={(c) => setOpenComm(c)}
            />
          </Section>
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

function CommunicationsTimeline({
  comms,
  loading,
  error,
  eventsByComm,
  eventsLoading,
  onOpenEmail,
}: {
  comms: Array<Record<string, unknown>>;
  loading: boolean;
  error?: string | null;
  eventsByComm: Map<string, Array<Record<string, unknown>>>;
  eventsLoading: boolean;
  onOpenEmail: (c: Record<string, unknown>) => void;
}) {
  if (error) return <ErrorState message={error} />;
  if (loading) return <LoadingState />;
  if (!comms || comms.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border bg-muted/20 p-4 text-sm text-muted-foreground">
        Nav komunikāciju ierakstu.
      </div>
    );
  }

  // Sort newest -> oldest by sent_at / received_at for timeline ordering.
  const sorted = [...comms].sort((a, b) => {
    const ta = new Date(String(a.sent_at ?? a.received_at ?? 0)).getTime() || 0;
    const tb = new Date(String(b.sent_at ?? b.received_at ?? 0)).getTime() || 0;
    return tb - ta;
  });

  return (
    <ol className="relative space-y-4 border-l-2 border-border pl-6">
      {sorted.map((c, i) => {
        const sentAt = c.sent_at ?? c.received_at;
        const directionRaw = String(c.direction ?? "").trim().toLowerCase();
        const isInbound = directionRaw === "inbound";
        const channel = tx(CHANNEL_LV, c.channel);
        const direction = tx(DIRECTION_LV, c.direction);
        const status = tx(COMM_STATUS_LV, c.current_status ?? c.status);
        const subject = c.subject;
        const fromAddr = c.from_address;
        const toAddr = c.to_address;
        const html = readHtml(c);
        const text = readText(c);
        const hasBody = !!html || !!text;
        const commId = String(c.id ?? c.communication_id ?? "");
        const events = commId ? eventsByComm.get(commId) ?? [] : [];

        return (
          <li key={i} className="relative">
            <span
              className={`absolute -left-[31px] top-2 flex h-4 w-4 items-center justify-center rounded-full border-2 border-card ${
                isInbound ? "bg-primary" : "bg-blue-500"
              }`}
            />
            <div className="rounded-md border border-border bg-card/50 p-3 hover:bg-secondary/30">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <ChannelBadge value={channel} />
                <span
                  className={`inline-flex items-center rounded px-2 py-0.5 font-medium ${
                    isInbound
                      ? "bg-primary/10 text-primary"
                      : "bg-blue-500/10 text-blue-700 dark:text-blue-300"
                  }`}
                >
                  {direction}
                </span>
                <span className="rounded bg-muted px-2 py-0.5 text-muted-foreground">
                  {status}
                </span>
                <span className="ml-auto text-muted-foreground">
                  {fmtDate(sentAt)}
                </span>
              </div>

              <div className="mt-2 text-sm font-medium text-foreground">
                {fmt(subject)}
              </div>

              <div className="mt-1 grid gap-x-4 gap-y-0.5 text-xs sm:grid-cols-2">
                <div>
                  <span className="text-muted-foreground">No: </span>
                  <span className="font-mono text-foreground">
                    {fmt(fromAddr)}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Uz: </span>
                  <span className="font-mono text-foreground">
                    {fmt(toAddr)}
                  </span>
                </div>
              </div>

              {hasBody && (
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={() => onOpenEmail(c)}
                    className="inline-flex h-7 items-center rounded-md border border-border bg-background px-2 text-xs font-medium text-foreground hover:bg-secondary"
                  >
                    Atvērt e-pastu
                  </button>
                </div>
              )}

              {(events.length > 0 || eventsLoading) && (
                <div className="mt-3 border-t border-border pt-2">
                  <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Notikumi ({events.length})
                  </div>
                  {eventsLoading && events.length === 0 ? (
                    <div className="text-xs text-muted-foreground">
                      Ielādē notikumus...
                    </div>
                  ) : (
                    <ol className="relative space-y-1.5 border-l border-border pl-4">
                      {events.map((ev, j) => (
                        <li
                          key={j}
                          className="relative flex flex-wrap items-center gap-2 text-xs"
                        >
                          <span
                            className={`absolute -left-[19px] top-1.5 h-2 w-2 rounded-full ${eventDotCls(
                              ev.event_type,
                            )}`}
                          />
                          <span className="font-medium text-foreground">
                            {tx(COMM_STATUS_LV, ev.event_type)}
                          </span>
                          <span className="text-muted-foreground">
                            {fmtDate(ev.event_timestamp)}
                          </span>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
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
            <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap p-4 text-sm text-foreground">
              {text}
            </pre>
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
