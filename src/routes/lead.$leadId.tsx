import { createFileRoute, Link } from "@tanstack/react-router";
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
} from "lucide-react";

import { LoadingState, ErrorState } from "@/components/DataState";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useCrmRpc } from "@/hooks/useCrmRpc";

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
  return <div className="text-sm text-muted-foreground py-4">{label}</div>;
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
  const { leadId } = Route.useParams();
  const q = useCrmRpc("get_lead_360_profile", { p_lead_id: leadId }, !!leadId);
  const [showRaw, setShowRaw] = useState(false);

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
  const tasks = section(profile, "tasks");
  const notes = section(profile, "notes");
  const nextActions = section(profile, "next_actions", "actions");
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

  const ownerLabel = fmt(
    pick(header, "owner_name", "owner", "assigned_user_name", "assigned_user_id"),
  );

  const rawData = asObject(pick(header, "raw_data")) ?? null;
  const leadTitle =
    str(pick(primaryData, "full_name")) ||
    str(pick(legacyContext, "full_name")) ||
    str(pick(rawData, "full_name")) ||
    str(pick(header, "summary")) ||
    str(pick(header, "id", "lead_id")) ||
    NA;
  const leadSource =
    str(pick(header, "source", "lead_source")) ||
    str(pick(legacyContext, "source", "avots_detalizets")) ||
    NA;

  const lastActivityAt = useMemo(() => {
    const candidates: number[] = [];
    for (const c of communications) {
      const v = pick(c, "created_at");
      if (v) {
        const t = new Date(str(v)).getTime();
        if (!Number.isNaN(t)) candidates.push(t);
      }
    }
    const upd = pick(header, "updated_at");
    if (upd) {
      const t = new Date(str(upd)).getTime();
      if (!Number.isNaN(t)) candidates.push(t);
    }
    if (!candidates.length) return null;
    return new Date(Math.max(...candidates)).toISOString();
  }, [communications, header]);

  const timeline = useMemo(() => {
    return [...communications].sort((a, b) => {
      const ta = new Date(str(pick(a, "created_at"))).getTime() || 0;
      const tb = new Date(str(pick(b, "created_at"))).getTime() || 0;
      return tb - ta;
    });
  }, [communications]);

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-4 space-y-4">
      <div className="flex items-center justify-between">
        <Button asChild variant="ghost" size="sm">
          <Link to="/leadi">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Atpakaļ uz sarakstu
          </Link>
        </Button>
        <span className="text-xs text-muted-foreground">Lead ID: {leadId}</span>
      </div>

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
                    <StatusBadge status={str(pick(header, "status", "lead_status"))} />
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {leadSource}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="hidden md:flex items-center gap-4 text-xs text-muted-foreground">
                  <div className="flex flex-col">
                    <span className="text-[10px] uppercase tracking-wide">Last activity</span>
                    <span className="text-foreground">{fmtDate(lastActivityAt)}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] uppercase tracking-wide">Owner</span>
                    <span className="text-foreground">{ownerLabel}</span>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <Button
                    asChild={!!primaryPhone}
                    size="sm"
                    variant="outline"
                    disabled={!primaryPhone}
                    title={primaryPhone || "Nav telefona"}
                  >
                    {primaryPhone ? (
                      <a href={`tel:${primaryPhone}`}>
                        <Phone className="h-3.5 w-3.5 mr-1" />
                        Call
                      </a>
                    ) : (
                      <span>
                        <Phone className="h-3.5 w-3.5 mr-1" />
                        Call
                      </span>
                    )}
                  </Button>
                  <Button
                    asChild={!!primaryEmail}
                    size="sm"
                    variant="outline"
                    disabled={!primaryEmail}
                    title={primaryEmail || "Nav e-pasta"}
                  >
                    {primaryEmail ? (
                      <a href={`mailto:${primaryEmail}`}>
                        <Mail className="h-3.5 w-3.5 mr-1" />
                        Email
                      </a>
                    ) : (
                      <span>
                        <Mail className="h-3.5 w-3.5 mr-1" />
                        Email
                      </span>
                    )}
                  </Button>
                  <Button
                    asChild={!!waNumber}
                    size="sm"
                    variant="outline"
                    disabled={!waNumber}
                    title={waNumber ? `+${waNumber}` : "Nav E.164 numura"}
                  >
                    {waNumber ? (
                      <a
                        href={`https://wa.me/${waNumber}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <MessageCircle className="h-3.5 w-3.5 mr-1" />
                        WhatsApp
                      </a>
                    ) : (
                      <span>
                        <MessageCircle className="h-3.5 w-3.5 mr-1" />
                        WhatsApp
                      </span>
                    )}
                  </Button>
                  <Button size="sm" disabled title="Drīzumā">
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Add Task
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Two-column workspace */}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            {/* LEFT */}
            <div className="space-y-4 xl:col-span-1">
              {/* Contact */}
              <Panel title="Contact" count={people.length}>
                {people.length === 0 ? (
                  <Empty />
                ) : (
                  <div className="space-y-3">
                    {primaryContact && (
                      <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
                        <div className="mb-2 text-[10px] font-medium uppercase tracking-wide text-primary">
                          Primary
                        </div>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          <Field label="Vārds" value={fmt(pick(primaryData, "full_name", "name"))} />
                          <Field label="E-pasts" value={fmt(primaryEmail)} />
                          <Field label="Telefons" value={fmt(primaryPhoneRaw)} />
                          <Field label="E.164" value={fmt(primaryPhoneE164)} />
                          <Field label="Comm. status" value={fmt(pick(primaryContact, "communication_status"))} />
                          <Field label="Decision maker" value={fmtBool(pick(primaryContact, "is_decision_maker"))} />
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

              {/* Legacy / Import Context */}
              <Panel title="Legacy / Import Context">
                {!legacyContext ? (
                  <Empty />
                ) : (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <Field label="Full name" value={fmt(pick(legacyContext, "full_name"))} />
                    <Field label="E-pasts" value={fmt(pick(legacyContext, "email_normalized"))} />
                    <Field label="Telefons" value={fmt(pick(legacyContext, "telefons_neapstradats"))} />
                    <Field label="E.164" value={fmt(pick(legacyContext, "telefons_e164"))} />
                    <Field label="Valsts" value={fmt(pick(legacyContext, "valsts"))} />
                    <Field label="Tags" value={fmt(pick(legacyContext, "tags"))} />
                    <Field label="Objekts" value={fmt(pick(legacyContext, "objekts"))} />
                    <Field label="Forma zeme" value={fmt(pick(legacyContext, "forma_zeme"))} />
                    <Field label="Forma projekts" value={fmt(pick(legacyContext, "forma_projekts"))} />
                    <Field label="Plānota būvniecība" value={fmt(pick(legacyContext, "planota_buvnieciba_text"))} />
                    <Field label="Automatizācija" value={fmt(pick(legacyContext, "automatizacija"))} />
                    <Field label="Autom. datums" value={fmtDate(pick(legacyContext, "automatizacijas_datums"))} />
                    <Field label="PPV vārds" value={fmt(pick(legacyContext, "ppv_vards"))} />
                    <Field label="Avots detalizēts" value={fmt(pick(legacyContext, "avots_detalizets"))} />
                    <Field label="Smartsheet created" value={fmtDate(pick(legacyContext, "smartsheet_created_at"))} />
                    <Field label="Last SS change" value={fmtDate(pick(legacyContext, "last_smartsheet_change_at"))} />
                  </div>
                )}
              </Panel>

              {/* Companies */}
              <Panel title="Companies" count={companies.length}>
                {companies.length === 0 ? (
                  <Empty />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b text-left text-[10px] uppercase text-muted-foreground">
                          <th className="py-1.5 pr-2">Uzņēmums</th>
                          <th className="py-1.5 pr-2">Loma</th>
                          <th className="py-1.5 pr-2">Primary</th>
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

              {/* Objects */}
              <Panel title="Objects" count={objects.length}>
                {objects.length === 0 ? (
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
                            <Field label="Land" value={fmt(pick(objectData, "land_status"))} />
                            <Field label="Project" value={fmt(pick(objectData, "project_status"))} />
                            <Field label="Budžets" value={fmtMoney(pick(objectData, "budget_amount"))} />
                            <div className="col-span-2">
                              <Field label="Adrese" value={fmt(pick(objectData, "address"))} />
                            </div>
                            <Field label="Est. value" value={fmtMoney(pick(objectData, "estimated_value"))} />
                            <Field label="Primary" value={fmtBool(pick(o, "is_primary_object", "is_primary"))} />
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
              {/* Activity timeline */}
              <Panel title="Activity Timeline" count={timeline.length}>
                {timeline.length === 0 ? (
                  <Empty />
                ) : (
                  <ol className="relative space-y-3 max-h-[420px] overflow-auto pr-2">
                    {timeline.map((c, i) => {
                      const ch = str(pick(c, "channel"));
                      return (
                        <li
                          key={String(pick(c, "id", "communication_id") ?? i)}
                          className="flex gap-3 border-b pb-3 last:border-0"
                        >
                          <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                            {channelIcon(ch)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex items-center gap-2 text-xs">
                                <span className="font-medium">{fmt(ch)}</span>
                                <span className="text-muted-foreground">
                                  {fmt(pick(c, "direction"))}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <StatusBadge status={str(pick(c, "status", "current_status"))} />
                                <span className="text-[11px] text-muted-foreground">
                                  {fmtDate(pick(c, "created_at"))}
                                </span>
                              </div>
                            </div>
                            <div className="mt-0.5 text-sm truncate">
                              {fmt(pick(c, "subject"))}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </Panel>

              {/* Communications table */}
              <Panel title="Communications" count={communications.length}>
                {communications.length === 0 ? (
                  <Empty />
                ) : (
                  <div className="max-h-[420px] overflow-auto">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-card">
                        <tr className="border-b text-left text-[10px] uppercase text-muted-foreground">
                          <th className="py-1.5 pr-2">Kanāls</th>
                          <th className="py-1.5 pr-2">Virziens</th>
                          <th className="py-1.5 pr-2">Subject</th>
                          <th className="py-1.5 pr-2">Status</th>
                          <th className="py-1.5 pr-2">Provider</th>
                          <th className="py-1.5 pr-2">Created</th>
                        </tr>
                      </thead>
                      <tbody>
                        {communications.map((c, i) => (
                          <tr
                            key={String(pick(c, "id", "communication_id") ?? i)}
                            className="border-b last:border-0"
                          >
                            <td className="py-1.5 pr-2">{fmt(pick(c, "channel"))}</td>
                            <td className="py-1.5 pr-2">{fmt(pick(c, "direction"))}</td>
                            <td className="py-1.5 pr-2 truncate max-w-[280px]">{fmt(pick(c, "subject"))}</td>
                            <td className="py-1.5 pr-2">
                              <StatusBadge status={str(pick(c, "status", "current_status"))} />
                            </td>
                            <td className="py-1.5 pr-2">{fmt(pick(c, "provider"))}</td>
                            <td className="py-1.5 pr-2 whitespace-nowrap">{fmtDate(pick(c, "created_at"))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Panel>

              {/* Tasks + Next Actions side by side on wide */}
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Panel title="Tasks" count={tasks.length}>
                  {tasks.length === 0 ? (
                    <Empty />
                  ) : (
                    <ul className="divide-y">
                      {tasks.map((t, i) => (
                        <li
                          key={String(pick(t, "id", "task_id") ?? i)}
                          className="flex items-center justify-between gap-2 py-2"
                        >
                          <div className="min-w-0">
                            <div className="text-sm truncate">{fmt(pick(t, "title", "name"))}</div>
                            <div className="text-[11px] text-muted-foreground">
                              {fmtDate(pick(t, "due_at"))} · {fmt(pick(t, "priority"))} · {fmt(pick(t, "assigned_user_id"))}
                            </div>
                          </div>
                          <StatusBadge status={str(pick(t, "status"))} />
                        </li>
                      ))}
                    </ul>
                  )}
                </Panel>

                <Panel title="Next Actions" count={nextActions.length}>
                  {nextActions.length === 0 ? (
                    <Empty />
                  ) : (
                    <ul className="divide-y">
                      {nextActions.map((a, i) => (
                        <li
                          key={String(pick(a, "id", "action_id") ?? i)}
                          className="flex items-center justify-between gap-2 py-2"
                        >
                          <div className="min-w-0">
                            <div className="text-sm truncate">{fmt(pick(a, "action_type"))}</div>
                            <div className="text-[11px] text-muted-foreground">
                              {fmtDate(pick(a, "due_at"))} · prio {fmt(pick(a, "priority_score", "priority"))} · {fmt(pick(a, "source"))}
                            </div>
                          </div>
                          <StatusBadge status={str(pick(a, "status"))} />
                        </li>
                      ))}
                    </ul>
                  )}
                </Panel>
              </div>

              {/* Notes */}
              <Panel title="Notes" count={notes.length}>
                {notes.length === 0 ? (
                  <Empty />
                ) : (
                  <div className="space-y-2">
                    {notes.map((n, i) => (
                      <div
                        key={String(pick(n, "id", "note_id") ?? i)}
                        className="rounded-md border bg-card p-2.5"
                      >
                        <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
                          <div className="flex items-center gap-2">
                            <span>{fmt(pick(n, "note_type"))}</span>
                            {pick(n, "is_pinned") === true && (
                              <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-primary">
                                Piespraust
                              </span>
                            )}
                          </div>
                          <span>{fmtDate(pick(n, "created_at"))}</span>
                        </div>
                        <div className="whitespace-pre-wrap text-sm text-foreground">
                          {fmt(pick(n, "content", "body"))}
                        </div>
                      </div>
                    ))}
                  </div>
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
                <CardTitle className="text-sm font-medium">Technical raw preview</CardTitle>
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
        </>
      )}
    </div>
  );
}
