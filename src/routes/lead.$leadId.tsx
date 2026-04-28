import { createFileRoute, Link } from "@tanstack/react-router";
import { Fragment, useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";

import { PageHeader } from "@/components/PageHeader";
import { LoadingState, ErrorState, EmptyState } from "@/components/DataState";
import { Button } from "@/components/ui/button";
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
  if (value == null || value === "") return NA;
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
  if (value == null || value === "") return NA;
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString("lv-LV", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function fmtBool(value: unknown): string {
  if (value == null || value === "") return NA;
  if (typeof value === "boolean") return value ? "Jā" : "Nē";
  const s = String(value).trim().toLowerCase();
  if (["true", "t", "1", "yes", "ja", "jā"].includes(s)) return "Jā";
  if (["false", "f", "0", "no", "ne", "nē"].includes(s)) return "Nē";
  return String(value);
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

  const fullName = fmt(pick(profile, "full_name", "name"));
  const status = fmt(pick(profile, "status", "current_status"));
  const rating = fmt(pick(profile, "rating"));
  const priority =
    pick(priorityRow, "priority_score") ?? pick(profile, "priority_score");
  const tags = pick(profile, "tags");
  const ppv = fmt(pick(profile, "ppv_vards", "ppv", "ppv_name"));
  const owner = fmt(pick(profile, "owner", "owner_name"));

  const email = fmt(pick(profile, "email"));
  const phone = fmt(pick(profile, "phone_raw", "phone"));
  const country = fmt(pick(profile, "country"));
  const source = fmt(pick(profile, "source"));
  const sourceDetailed = pick(profile, "source_detailed");
  const b2b = fmtBool(pick(profile, "is_b2b", "b2b"));

  // Objekts / projekts (lielākoties no metadata vai Smartsheet)
  const objekts = fmt(pick(profile, "object", "objekts", "object_name"));
  const m2 = fmt(pick(profile, "m2", "square_meters", "area_m2", "area"));
  const summa = fmt(pick(profile, "amount", "summa", "price", "value"));
  const planotaBuvnieciba = fmtDateOnly(
    pick(
      profile,
      "construction_date",
      "planned_construction",
      "planota_buvnieciba",
    ),
  );
  const formaZeme = fmt(
    pick(profile, "form_land", "forma_zeme", "land_form"),
  );
  const formaProjekts = fmt(
    pick(profile, "form_project", "forma_projekts", "project_form"),
  );
  const formaZinaNoLead = fmt(
    pick(
      profile,
      "form_message",
      "forma_zina",
      "forma_message",
      "lead_message",
      "message",
    ),
  );

  // Darba info
  const nextAction = fmt(pick(profile, "next_action"));
  const nextActionTr =
    nextAction === NA
      ? NA
      : NEXT_ACTION_LV[nextAction.trim().toLowerCase()] ?? nextAction;
  const termins = fmtDate(pick(profile, "next_action_due_date", "due_date"));
  const lastContact = fmtDate(
    pick(profile, "last_contact_date", "last_contact_at"),
  );
  const automatizacija = fmt(
    pick(profile, "automation", "automation_name", "automation_status"),
  );
  const automatizacijasDatums = fmtDate(
    pick(profile, "automation_date", "automation_at"),
  );
  const atcelsanasIemesls = fmt(
    pick(profile, "cancel_reason", "atcelšanas_iemesls", "cancellation_reason"),
  );
  const situacijasPiezimes = fmt(
    pick(profile, "situation_notes", "situācijas_piezīmes", "notes"),
  );

  return (
    <>
      <div className="mb-4">
        <Button asChild variant="ghost" size="sm" className="h-8 px-2">
          <Link to="/darba-rinda">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Atpakaļ uz Darba rindu
          </Link>
        </Button>
      </div>

      <PageHeader
        title={profile ? fullName : `Lead #${leadId}`}
        description={`Lead ID: ${leadId}`}
      />

      {profileError && <ErrorState message={profileError} />}
      {!profileError && overviewQ.isLoading && <LoadingState />}
      {!profileError && !overviewQ.isLoading && !profile && (
        <EmptyState label="Profils nav atrasts" />
      )}

      {profile && (
        <div className="space-y-4">
          {/* 1. Augšējā josla */}
          <Section title="Pārskats">
            <Grid>
              <Field label="Vārds Uzvārds" value={fullName} emphasize />
              <Field label="Statuss" value={status} />
              <Field
                label="Reitings · Prioritāte"
                value={`${rating} · ${priority != null && priority !== "" ? String(priority) : NA}`}
                emphasize
              />
              <Field label="Tagi" value={fmt(tags)} />
              <Field label="PPV" value={ppv} />
              <Field label="Atbildīgais" value={owner} />
            </Grid>
          </Section>

          {/* 2. Kontakti */}
          <Section title="Kontakti">
            <Grid>
              <Field label="Email" value={email} mono />
              <Field label="Telefons" value={phone} mono />
              <Field label="Valsts" value={country} />
              <Field label="Avots" value={source} />
              <Field label="Detalizēts avots" value={fmt(sourceDetailed)} />
              <Field label="B2B" value={b2b} />
            </Grid>
          </Section>

          {/* 3. Objekts / projekts */}
          <Section title="Objekts / projekts">
            <Grid>
              <Field label="Objekts" value={objekts} />
              <Field label="m²" value={m2} />
              <Field label="Summa" value={summa} />
              <Field label="Plānota būvniecība" value={planotaBuvnieciba} />
              <Field label="Forma · Zeme" value={formaZeme} />
              <Field label="Forma · Projekts" value={formaProjekts} />
              <Field
                label="Forma · Ziņa no Lead"
                value={formaZinaNoLead}
                wide
              />
            </Grid>
          </Section>

          {/* 4. Darba informācija */}
          <Section title="Darba informācija">
            <Grid>
              <Field label="Nākamā darbība" value={nextActionTr} />
              <Field label="Termiņš" value={termins} />
              <Field label="Pēdējās saziņas datums" value={lastContact} />
              <Field label="Automatizācija" value={automatizacija} />
              <Field
                label="Automatizācijas datums"
                value={automatizacijasDatums}
              />
              <Field label="Atcelšanas iemesls" value={atcelsanasIemesls} />
              <Field
                label="Situācijas piezīmes"
                value={situacijasPiezimes}
                wide
              />
            </Grid>
            {engagementQ.data?.error && (
              <p className="mt-2 text-xs text-muted-foreground">
                Engagement dati nav pieejami: {engagementQ.data.error}
              </p>
            )}
            {engagement && (
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <MiniStat
                  label="Engagement events"
                  value={fmt(
                    pick(
                      engagement,
                      "engagement_events",
                      "events_count",
                      "total_events",
                    ),
                  )}
                />
                <MiniStat
                  label="Pozitīvas reakcijas"
                  value={fmt(
                    pick(
                      engagement,
                      "positive_reactions",
                      "positive_count",
                    ),
                  )}
                />
                <MiniStat
                  label="Pēdējais notikums"
                  value={fmtDate(
                    pick(engagement, "last_event_at", "last_activity_at"),
                  )}
                />
              </div>
            )}
          </Section>

          {/* 5. Komunikāciju vēsture */}
          <Section title="Komunikāciju vēsture">
            <CommunicationsList
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

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
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
}: {
  label: string;
  value: string;
  mono?: boolean;
  emphasize?: boolean;
  wide?: boolean;
}) {
  const isEmpty = value === NA;
  return (
    <div className={`flex flex-col gap-0.5 ${wide ? "sm:col-span-2 lg:col-span-3" : ""}`}>
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span
        className={[
          isEmpty ? "text-muted-foreground italic" : "text-foreground",
          mono ? "font-mono text-sm" : "text-sm",
          emphasize ? "text-base font-semibold" : "",
          wide ? "whitespace-pre-wrap break-words" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {value}
      </span>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="text-sm font-medium text-foreground">{value}</div>
    </div>
  );
}

/* -------------------------- communications -------------------------- */

function CommunicationsList({
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

  return (
    <div className="overflow-hidden rounded-md border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-[11px] uppercase text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Datums</th>
            <th className="px-3 py-2 text-left font-medium">Kanāls</th>
            <th className="px-3 py-2 text-left font-medium">Virziens</th>
            <th className="px-3 py-2 text-left font-medium">Statuss</th>
            <th className="px-3 py-2 text-left font-medium">No</th>
            <th className="px-3 py-2 text-left font-medium">Uz</th>
            <th className="px-3 py-2 text-left font-medium">Temats / saturs</th>
          </tr>
        </thead>
        <tbody>
          {comms.map((c, i) => {
            const sentAt = c.sent_at ?? c.received_at;
            const channel = tx(CHANNEL_LV, c.channel);
            const direction = tx(DIRECTION_LV, c.direction);
            const status = tx(
              COMM_STATUS_LV,
              c.current_status ?? c.status,
            );
            const subject = c.subject;
            const fromAddr = c.from_address;
            const toAddr = c.to_address;
            const html = readHtml(c);
            const text = readText(c);
            const hasBody = !!html || !!text;
            const commId = String(c.id ?? c.communication_id ?? "");
            const events = commId ? eventsByComm.get(commId) ?? [] : [];
            const attachmentsInfo = c.attachments_info;
            return (
              <Fragment key={i}>
                <tr className="border-t border-border align-top hover:bg-secondary/30">
                  <td className="whitespace-nowrap px-3 py-2 text-foreground">
                    {fmtDate(sentAt)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    <ChannelBadge value={channel} />
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-foreground">
                    {direction}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-foreground">
                    {status}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-foreground">
                    {fmt(fromAddr)}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-foreground">
                    {fmt(toAddr)}
                  </td>
                  <td className="px-3 py-2 text-foreground">
                    <div className="flex flex-col gap-1">
                      <span>{fmt(subject)}</span>
                      {hasBody && (
                        <button
                          type="button"
                          onClick={() => onOpenEmail(c)}
                          className="self-start text-xs text-primary underline-offset-2 hover:underline"
                        >
                          Atvērt e-pastu
                        </button>
                      )}
                      {attachmentsInfo != null && attachmentsInfo !== "" && (
                        <span className="text-xs text-muted-foreground">
                          Pielikumi: {fmt(attachmentsInfo)}
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
                {(events.length > 0 || eventsLoading) && (
                  <tr className="bg-muted/20">
                    <td colSpan={7} className="px-3 pb-3 pt-1">
                      {eventsLoading && events.length === 0 ? (
                        <div className="text-xs text-muted-foreground">
                          Ielādē notikumus...
                        </div>
                      ) : (
                        <div className="ml-2 border-l-2 border-border pl-3">
                          <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                            Notikumi ({events.length})
                          </div>
                          <ul className="flex flex-wrap gap-x-4 gap-y-1">
                            {events.map((ev, j) => (
                              <li
                                key={j}
                                className="flex items-center gap-2 text-xs"
                              >
                                <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary/60" />
                                <span className="font-medium text-foreground">
                                  {tx(COMM_STATUS_LV, ev.event_type)}
                                </span>
                                <span className="text-muted-foreground">
                                  {fmtDate(ev.event_timestamp)}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
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
