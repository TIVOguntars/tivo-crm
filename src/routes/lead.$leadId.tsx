import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, ChevronDown, ChevronRight } from "lucide-react";

import { LoadingState, ErrorState, EmptyState } from "@/components/DataState";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
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

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="text-sm text-foreground break-words">{value}</span>
    </div>
  );
}

function SectionCard({
  title,
  description,
  count,
  children,
}: {
  title: string;
  description?: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">{title}</CardTitle>
          {typeof count === "number" && (
            <span className="text-xs text-muted-foreground">{count}</span>
          )}
        </div>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function PeopleFields({ person }: { person: Row }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <Field label="Vārds" value={fmt(pick(person, "full_name", "name"))} />
      <Field label="E-pasts" value={fmt(pick(person, "email_normalized", "email"))} />
      <Field label="Telefons" value={fmt(pick(person, "phone_raw", "phone"))} />
      <Field label="E.164" value={fmt(pick(person, "phone_e164"))} />
      <Field label="Comm. status" value={fmt(pick(person, "communication_status"))} />
      <Field label="Loma" value={fmt(pick(person, "role"))} />
      <Field label="Decision maker" value={fmtBool(pick(person, "is_decision_maker"))} />
    </div>
  );
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

  return (
    <div className="container mx-auto max-w-6xl px-4 py-6 space-y-6">
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
      {!q.isLoading && !rpcError && !profile && (
        <EmptyState label="Lead profils nav atrasts." />
      )}

      {!q.isLoading && !rpcError && profile && (
        <>
          {/* 1. Header */}
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-lg">
                    {fmt(pick(header, "lead_name", "name", "title", "summary"))}
                  </CardTitle>
                  <CardDescription>
                    {fmt(pick(header, "source", "lead_source"))}
                  </CardDescription>
                </div>
                <StatusBadge status={str(pick(header, "status", "lead_status"))} />
              </div>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Status" value={fmt(pick(header, "status", "lead_status"))} />
              <Field label="Source" value={fmt(pick(header, "source", "lead_source"))} />
              <Field label="Created" value={fmtDate(pick(header, "created_at"))} />
              <Field label="Updated" value={fmtDate(pick(header, "updated_at"))} />
              <div className="sm:col-span-2 lg:col-span-4">
                <Field
                  label="Summary"
                  value={fmt(pick(header, "summary", "description"))}
                />
              </div>
            </CardContent>
          </Card>

          {/* 2. People */}
          <SectionCard
            title="People"
            count={people.length}
            description="Primary contact un visi saistītie cilvēki."
          >
            {people.length === 0 ? (
              <EmptyState label={NA} />
            ) : (
              <div className="space-y-4">
                {primaryContact && (
                  <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
                    <div className="mb-3 text-xs font-medium uppercase tracking-wide text-primary">
                      Primary contact
                    </div>
                    <PeopleFields person={primaryContact} />
                  </div>
                )}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                        <th className="py-2 pr-3">Vārds</th>
                        <th className="py-2 pr-3">E-pasts</th>
                        <th className="py-2 pr-3">Telefons</th>
                        <th className="py-2 pr-3">E.164</th>
                        <th className="py-2 pr-3">Comm. status</th>
                        <th className="py-2 pr-3">Loma</th>
                        <th className="py-2 pr-3">Decision maker</th>
                      </tr>
                    </thead>
                    <tbody>
                      {people.map((p, i) => (
                        <tr
                          key={String(pick(p, "id", "person_id") ?? i)}
                          className="border-b last:border-0"
                        >
                          <td className="py-2 pr-3">{fmt(pick(p, "full_name", "name"))}</td>
                          <td className="py-2 pr-3">{fmt(pick(p, "email_normalized", "email"))}</td>
                          <td className="py-2 pr-3">{fmt(pick(p, "phone_raw", "phone"))}</td>
                          <td className="py-2 pr-3">{fmt(pick(p, "phone_e164"))}</td>
                          <td className="py-2 pr-3">{fmt(pick(p, "communication_status"))}</td>
                          <td className="py-2 pr-3">{fmt(pick(p, "role"))}</td>
                          <td className="py-2 pr-3">{fmtBool(pick(p, "is_decision_maker"))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </SectionCard>

          {/* 3. Companies */}
          <SectionCard title="Companies" count={companies.length}>
            {companies.length === 0 ? (
              <EmptyState label={NA} />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                      <th className="py-2 pr-3">Uzņēmums</th>
                      <th className="py-2 pr-3">Valsts</th>
                      <th className="py-2 pr-3">Pilsēta</th>
                      <th className="py-2 pr-3">Loma</th>
                      <th className="py-2 pr-3">Primary</th>
                    </tr>
                  </thead>
                  <tbody>
                    {companies.map((c, i) => (
                      <tr
                        key={String(pick(c, "id", "company_id") ?? i)}
                        className="border-b last:border-0"
                      >
                        <td className="py-2 pr-3">{fmt(pick(c, "company_name", "name"))}</td>
                        <td className="py-2 pr-3">{fmt(pick(c, "country"))}</td>
                        <td className="py-2 pr-3">{fmt(pick(c, "city"))}</td>
                        <td className="py-2 pr-3">{fmt(pick(c, "relationship_role", "role"))}</td>
                        <td className="py-2 pr-3">{fmtBool(pick(c, "is_primary_company", "is_primary"))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>

          {/* 4. Objects */}
          <SectionCard title="Objects" count={objects.length}>
            {objects.length === 0 ? (
              <EmptyState label={NA} />
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {objects.map((o, i) => (
                  <div
                    key={String(pick(o, "id", "object_id") ?? i)}
                    className="rounded-lg border bg-card p-4"
                  >
                    <div className="mb-3 flex items-center justify-between">
                      <div className="font-medium">
                        {fmt(pick(o, "object_name", "name"))}
                      </div>
                      <StatusBadge status={str(pick(o, "sales_status"))} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Tips" value={fmt(pick(o, "object_type"))} />
                      <Field label="Sales status" value={fmt(pick(o, "sales_status"))} />
                      <Field label="Land status" value={fmt(pick(o, "land_status"))} />
                      <Field label="Project status" value={fmt(pick(o, "project_status"))} />
                      <div className="col-span-2">
                        <Field label="Adrese" value={fmt(pick(o, "address"))} />
                      </div>
                      <Field label="Budžets" value={fmtMoney(pick(o, "budget_amount"))} />
                      <Field label="Estimated value" value={fmtMoney(pick(o, "estimated_value"))} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          {/* 5. Tasks */}
          <SectionCard title="Tasks" count={tasks.length}>
            {tasks.length === 0 ? (
              <EmptyState label={NA} />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                      <th className="py-2 pr-3">Tituls</th>
                      <th className="py-2 pr-3">Status</th>
                      <th className="py-2 pr-3">Prioritāte</th>
                      <th className="py-2 pr-3">Termiņš</th>
                      <th className="py-2 pr-3">Atbildīgais</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tasks.map((t, i) => (
                      <tr
                        key={String(pick(t, "id", "task_id") ?? i)}
                        className="border-b last:border-0"
                      >
                        <td className="py-2 pr-3">{fmt(pick(t, "title", "name"))}</td>
                        <td className="py-2 pr-3">
                          <StatusBadge status={str(pick(t, "status"))} />
                        </td>
                        <td className="py-2 pr-3">{fmt(pick(t, "priority"))}</td>
                        <td className="py-2 pr-3">{fmtDate(pick(t, "due_at"))}</td>
                        <td className="py-2 pr-3">{fmt(pick(t, "assigned_user_id"))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>

          {/* 6. Notes */}
          <SectionCard title="Notes" count={notes.length}>
            {notes.length === 0 ? (
              <EmptyState label={NA} />
            ) : (
              <div className="space-y-3">
                {notes.map((n, i) => (
                  <div
                    key={String(pick(n, "id", "note_id") ?? i)}
                    className="rounded-lg border bg-card p-3"
                  >
                    <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <span>{fmt(pick(n, "note_type"))}</span>
                        {pick(n, "is_pinned") === true && (
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">
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
          </SectionCard>

          {/* 7. Next Actions */}
          <SectionCard title="Next Actions" count={nextActions.length}>
            {nextActions.length === 0 ? (
              <EmptyState label={NA} />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                      <th className="py-2 pr-3">Darbība</th>
                      <th className="py-2 pr-3">Status</th>
                      <th className="py-2 pr-3">Termiņš</th>
                      <th className="py-2 pr-3">Prioritāte</th>
                      <th className="py-2 pr-3">Avots</th>
                    </tr>
                  </thead>
                  <tbody>
                    {nextActions.map((a, i) => (
                      <tr
                        key={String(pick(a, "id", "action_id") ?? i)}
                        className="border-b last:border-0"
                      >
                        <td className="py-2 pr-3">{fmt(pick(a, "action_type"))}</td>
                        <td className="py-2 pr-3">
                          <StatusBadge status={str(pick(a, "status"))} />
                        </td>
                        <td className="py-2 pr-3">{fmtDate(pick(a, "due_at"))}</td>
                        <td className="py-2 pr-3">{fmt(pick(a, "priority_score", "priority"))}</td>
                        <td className="py-2 pr-3">{fmt(pick(a, "source"))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>

          {/* 8. Communications */}
          <SectionCard title="Communications" count={communications.length}>
            {communications.length === 0 ? (
              <EmptyState label={NA} />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                      <th className="py-2 pr-3">Kanāls</th>
                      <th className="py-2 pr-3">Virziens</th>
                      <th className="py-2 pr-3">Subject</th>
                      <th className="py-2 pr-3">Status</th>
                      <th className="py-2 pr-3">Provider</th>
                      <th className="py-2 pr-3">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {communications.map((c, i) => (
                      <tr
                        key={String(pick(c, "id", "communication_id") ?? i)}
                        className="border-b last:border-0"
                      >
                        <td className="py-2 pr-3">{fmt(pick(c, "channel"))}</td>
                        <td className="py-2 pr-3">{fmt(pick(c, "direction"))}</td>
                        <td className="py-2 pr-3">{fmt(pick(c, "subject"))}</td>
                        <td className="py-2 pr-3">
                          <StatusBadge status={str(pick(c, "status", "current_status"))} />
                        </td>
                        <td className="py-2 pr-3">{fmt(pick(c, "provider"))}</td>
                        <td className="py-2 pr-3">{fmtDate(pick(c, "created_at"))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>

          {/* 9. Technical raw preview */}
          <Card>
            <CardHeader>
              <button
                type="button"
                onClick={() => setShowRaw((v) => !v)}
                className="flex w-full items-center justify-between gap-2 text-left"
              >
                <CardTitle className="text-base">Technical raw preview</CardTitle>
                {showRaw ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )}
              </button>
              <CardDescription>
                get_lead_360_profile RPC neapstrādāta atbilde.
              </CardDescription>
            </CardHeader>
            {showRaw && (
              <CardContent>
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