import { createFileRoute, Link } from "@tanstack/react-router";
import { Fragment, useMemo } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  Mail,
  MessageSquare,
  Phone,
  Send,
  Sparkles,
  Flame,
  Activity,
  ThumbsUp,
  Clock,
} from "lucide-react";

import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { LoadingState, ErrorState, EmptyState } from "@/components/DataState";
import { Button } from "@/components/ui/button";
import { useAnalyticsView } from "@/hooks/useAnalyticsView";
import { usePublicTable } from "@/hooks/usePublicTable";

export const Route = createFileRoute("/lead/$leadId")({
  component: LeadProfilePage,
});

function fmt(value: unknown): string {
  if (value == null) return "—";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  const s = String(value);
  return s === "" ? "—" : s;
}

function fmtDate(value: unknown): string {
  if (value == null || value === "") return "—";
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
};

const DIRECTION_LV: Record<string, string> = {
  outbound: "Nosūtīts",
  inbound: "Saņemts",
};

const COMM_STATUS_LV: Record<string, string> = {
  sent: "Nosūtīts",
  delivered: "Piegādāts",
  opened: "Atvērts",
  clicked: "Klikšķis",
  replied: "Atbilde",
  reply: "Atbilde",
};

const LINK_TYPE_LV: Record<string, string> = {
  cta: "CTA poga",
  ppv_email: "PPV e-pasts",
  ppv_phone: "Telefons",
  website: "Mājaslapa",
};

function translateLinkType(value: unknown): string {
  const raw = fmt(value);
  if (raw === "—") return raw;
  return LINK_TYPE_LV[raw.trim().toLowerCase()] ?? raw;
}

function translateNextAction(value: unknown): string {
  const raw = fmt(value);
  if (raw === "—") return raw;
  return NEXT_ACTION_LV[raw.trim().toLowerCase()] ?? raw;
}

function translateChannel(value: unknown): string {
  const raw = fmt(value);
  if (raw === "—") return raw;
  return CHANNEL_LV[raw.trim().toLowerCase()] ?? raw;
}

function translateDirection(value: unknown): string {
  const raw = fmt(value);
  if (raw === "—") return raw;
  return DIRECTION_LV[raw.trim().toLowerCase()] ?? raw;
}

function translateCommStatus(value: unknown): string {
  const raw = fmt(value);
  if (raw === "—") return raw;
  return COMM_STATUS_LV[raw.trim().toLowerCase()] ?? raw;
}

function LeadProfilePage() {
  const { leadId } = Route.useParams();

  // 1. Pamatprofils no lead_status_auto_preview
  const profileQ = useAnalyticsView(
    "lead_status_auto_preview",
    `lead_id=eq.${encodeURIComponent(leadId)}&limit=1`,
  );

  // 1b. Nākamā darbība no atsevišķa skata
  const nextActionQ = useAnalyticsView(
    "lead_next_action",
    `lead_id=eq.${encodeURIComponent(leadId)}&limit=1`,
  );

  // 1c. Prioritāte no lead_priority_queue
  const priorityQ = useAnalyticsView(
    "lead_priority_queue",
    `lead_id=eq.${encodeURIComponent(leadId)}&limit=1`,
  );

  // 2. Komunikācijas no public.communications tabulas
  const commsQ = usePublicTable(
    "communications",
    `lead_id=eq.${encodeURIComponent(leadId)}&order=sent_at.desc&limit=200`,
  );

  const profile = (profileQ.data?.rows?.[0] ?? null) as Record<
    string,
    unknown
  > | null;

  const comms = (commsQ.data?.rows ?? []) as Array<Record<string, unknown>>;
  const commsError =
    (commsQ.error as Error | null)?.message || commsQ.data?.error;

  // 2b. Visi communication_events priekš šī lead komunikācijām
  const commIds = useMemo(
    () =>
      comms
        .map((c) => c.id ?? c.communication_id)
        .filter((v): v is string | number => v != null),
    [comms],
  );

  const eventsQuery = useMemo(() => {
    if (commIds.length === 0) return null;
    const list = commIds.map((id) => String(id)).join(",");
    return `communication_id=in.(${list})&order=event_timestamp.asc&limit=2000`;
  }, [commIds]);

  const eventsQ = usePublicTable(
    "communication_events",
    eventsQuery ?? "communication_id=eq.__none__&limit=1",
  );

  const eventsByComm = useMemo(() => {
    const map = new Map<string, Array<Record<string, unknown>>>();
    if (!eventsQuery) return map;
    const rows = (eventsQ.data?.rows ?? []) as Array<Record<string, unknown>>;
    for (const ev of rows) {
      const k = String(ev.communication_id ?? "");
      if (!k) continue;
      const list = map.get(k) ?? [];
      list.push(ev);
      map.set(k, list);
    }
    return map;
  }, [eventsQ.data, eventsQuery]);

  // 2c. Tracking links priekš komunikācijām, kur ir clicked notikumi
  const linksQuery = useMemo(() => {
    if (commIds.length === 0) return null;
    const list = commIds.map((id) => String(id)).join(",");
    return `communication_id=in.(${list})&limit=2000`;
  }, [commIds]);

  const linksQ = usePublicTable(
    "tracking_links",
    linksQuery ?? "communication_id=eq.__none__&limit=1",
  );

  const linkTypesByComm = useMemo(() => {
    const map = new Map<string, string[]>();
    if (!linksQuery) return map;
    const rows = (linksQ.data?.rows ?? []) as Array<Record<string, unknown>>;
    for (const link of rows) {
      const k = String(link.communication_id ?? "");
      if (!k) continue;
      const meta = link.metadata as Record<string, unknown> | null | undefined;
      const linkType =
        meta && typeof meta === "object"
          ? (meta as Record<string, unknown>).link_type
          : null;
      if (linkType == null) continue;
      const list = map.get(k) ?? [];
      list.push(String(linkType));
      map.set(k, list);
    }
    return map;
  }, [linksQ.data, linksQuery]);

  const profileError =
    (profileQ.error as Error | null)?.message || profileQ.data?.error;

  const comingSoon = () => toast("Drīzumā");

  const fullName = fmt(profile?.full_name);
  const email = fmt(profile?.email);
  const phone = fmt(profile?.phone_raw ?? profile?.phone);
  const currentStatus = fmt(profile?.current_status);
  const suggestedStatus = fmt(profile?.suggested_status);
  const priorityRow = (priorityQ.data?.rows?.[0] ?? null) as Record<
    string,
    unknown
  > | null;
  const priorityScore =
    priorityRow?.priority_score ?? profile?.priority_score;
  const nextActionRow = (nextActionQ.data?.rows?.[0] ?? null) as Record<
    string,
    unknown
  > | null;
  const nextAction = translateNextAction(
    nextActionRow?.next_action ?? profile?.next_action,
  );
  const nextActionError =
    (nextActionQ.error as Error | null)?.message || nextActionQ.data?.error;
  const engagementEvents = profile?.engagement_events;
  const positiveReactions = profile?.positive_reactions;
  const lastEventAt = profile?.last_event_at;

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
      {!profileError && profileQ.isLoading && <LoadingState />}
      {!profileError && !profileQ.isLoading && !profile && (
        <EmptyState label="Profils nav atrasts" />
      )}

      {profile && (
        <>
          {/* Augšējā info kartiņa */}
          <div className="mb-6 rounded-lg border border-border bg-card p-4 shadow-sm">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <InfoRow label="Vārds" value={fullName} />
              <InfoRow label="Email" value={email} mono />
              <InfoRow label="Telefons" value={phone} mono />
              <InfoRow label="Pašreizējais statuss" value={currentStatus} />
              <InfoRow label="Ieteiktais statuss" value={suggestedStatus} />
              <InfoRow
                label="Prioritāte"
                value={
                  priorityScore != null && priorityScore !== ""
                    ? String(priorityScore)
                    : "—"
                }
                emphasize
              />
            </div>
          </div>

          {/* 1. Nākamā darbība */}
          <section className="mb-6">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Nākamā darbība
            </h2>
            {nextActionError ? (
              <ErrorState message={nextActionError} />
            ) : nextActionQ.isLoading ? (
              <LoadingState />
            ) : (() => {
              const urgent =
                nextAction.trim().toLowerCase() ===
                "sazināties nekavējoties";
              return (
                <div
                  className={
                    urgent
                      ? "rounded-lg border-2 border-destructive/60 bg-destructive/10 p-6 shadow-[0_0_0_4px_color-mix(in_oklab,var(--destructive)_10%,transparent)]"
                      : "rounded-lg border border-primary/30 bg-primary/5 p-6"
                  }
                >
                  <div className="flex items-start gap-3">
                    {urgent ? (
                      <Flame className="mt-1 h-8 w-8 flex-shrink-0 animate-pulse text-destructive" />
                    ) : (
                      <Sparkles className="mt-1 h-7 w-7 flex-shrink-0 text-primary" />
                    )}
                    <div
                      className={
                        urgent
                          ? "text-3xl font-bold uppercase leading-snug tracking-wide text-destructive"
                          : "text-3xl font-semibold leading-snug text-foreground"
                      }
                    >
                      {nextAction}
                    </div>
                  </div>
                </div>
              );
            })()}
          </section>

          {/* 2. Darbības */}
          <section className="mb-6">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Darbības
            </h2>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={comingSoon}>
                <Mail className="mr-2 h-4 w-4" />
                Sūtīt e-pastu
              </Button>
              <Button variant="outline" onClick={comingSoon}>
                <MessageSquare className="mr-2 h-4 w-4" />
                SMS
              </Button>
              <Button variant="outline" onClick={comingSoon}>
                <Send className="mr-2 h-4 w-4" />
                WhatsApp
              </Button>
              <Button variant="outline" onClick={comingSoon}>
                <Phone className="mr-2 h-4 w-4" />
                Zvanīt
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Šobrīd pogas ir tikai UI — komunikāciju sūtīšana drīzumā.
            </p>
          </section>

          {/* 3. Aktivitāte */}
          <section className="mb-6">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Aktivitāte
            </h2>
            <div className="grid gap-3 sm:grid-cols-3">
              <StatCard
                label="Engagement events"
                value={
                  engagementEvents != null ? Number(engagementEvents) || 0 : 0
                }
                hint="Aktivitāšu skaits"
              />
              <StatCard
                label="Pozitīvas reakcijas"
                value={
                  positiveReactions != null
                    ? Number(positiveReactions) || 0
                    : 0
                }
                hint="Atvēršanas, klikšķi u.c."
              />
              <StatCard
                label="Pēdējais notikums"
                value={fmtDate(lastEventAt)}
                hint="last_event_at"
              />
            </div>

            <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Activity className="h-3.5 w-3.5" /> Engagement
              </span>
              <span className="inline-flex items-center gap-1">
                <ThumbsUp className="h-3.5 w-3.5" /> Pozitīvas
              </span>
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" /> Pēdējais
              </span>
            </div>
          </section>

          {/* 4. Komunikāciju vēsture */}
          <section className="mb-6">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Komunikāciju vēsture
            </h2>
            <CommunicationsTable
              comms={comms}
              loading={commsQ.isLoading}
              error={commsError}
              eventsByComm={eventsByComm}
              eventsLoading={eventsQ.isLoading && commIds.length > 0}
            />
          </section>
        </>
      )}
    </>
  );
}

function InfoRow({
  label,
  value,
  mono,
  emphasize,
}: {
  label: string;
  value: string;
  mono?: boolean;
  emphasize?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span
        className={[
          "text-foreground",
          mono ? "font-mono text-sm" : "text-base",
          emphasize ? "text-xl font-semibold tabular-nums" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {value}
      </span>
    </div>
  );
}

function CommunicationsTable({
  comms,
  loading,
  error,
  eventsByComm,
  eventsLoading,
}: {
  comms: Array<Record<string, unknown>>;
  loading: boolean;
  error?: string | null;
  eventsByComm: Map<string, Array<Record<string, unknown>>>;
  eventsLoading: boolean;
}) {
  if (error) return <ErrorState message={error} />;
  if (loading) return <LoadingState />;
  if (!comms || comms.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
        Nav komunikācijas
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Datums</th>
              <th className="px-3 py-2 text-left font-medium">Kanāls</th>
              <th className="px-3 py-2 text-left font-medium">Virziens</th>
              <th className="px-3 py-2 text-left font-medium">Statuss</th>
              <th className="px-3 py-2 text-left font-medium">Tēma</th>
            </tr>
          </thead>
          <tbody>
            {comms.map((c, i) => {
              const date = c.sent_at;
              const channel = translateChannel(c.channel);
              const direction = translateDirection(c.direction);
              const status = translateCommStatus(c.current_status ?? c.status);
              const subject = c.subject;
              const commId = String(c.id ?? c.communication_id ?? "");
              const events = commId ? eventsByComm.get(commId) ?? [] : [];
              return (
                <Fragment key={i}>
                  <tr className="border-t border-border hover:bg-secondary/30">
                    <td className="whitespace-nowrap px-3 py-2 text-foreground">
                      {fmtDate(date)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      <ChannelBadge value={fmt(channel)} />
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-foreground">
                      {direction}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-foreground">
                      {status}
                    </td>
                    <td className="px-3 py-2 text-foreground">{fmt(subject)}</td>
                  </tr>
                  {(events.length > 0 || eventsLoading) && (
                    <tr className="bg-muted/20">
                      <td colSpan={5} className="px-3 pb-3 pt-1">
                        {eventsLoading && events.length === 0 ? (
                          <div className="text-xs text-muted-foreground">
                            Ielādē notikumus...
                          </div>
                        ) : (
                          <div className="ml-4 border-l-2 border-border pl-3">
                            <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                              Notikumi ({events.length})
                            </div>
                            <ul className="space-y-1">
                              {events.map((ev, j) => (
                                <li
                                  key={j}
                                  className="flex items-center gap-2 text-xs"
                                >
                                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary/60" />
                                  <span className="font-medium text-foreground">
                                    {translateCommStatus(ev.event_type)}
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
    </div>
  );
}

function ChannelBadge({ value }: { value: string }) {
  const v = value.toLowerCase();
  let cls = "bg-muted text-muted-foreground";
  if (v.includes("email") || v.includes("e-past") || v.includes("pasts"))
    cls = "bg-blue-500/10 text-blue-700 dark:text-blue-300";
  else if (v.includes("sms"))
    cls = "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  else if (v.includes("call") || v.includes("zvan"))
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