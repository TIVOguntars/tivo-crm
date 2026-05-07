import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, ArrowRight } from "lucide-react";
import { fetchCrmView } from "@/server/analytics";
import { LoadingState, ErrorState, EmptyState } from "@/components/DataState";

type Row = Record<string, unknown>;

function s(v: unknown): string {
  if (v == null) return "";
  return String(v);
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

function fmtDate(value: unknown): string {
  const str = s(value);
  if (!str) return "—";
  const d = new Date(str);
  if (Number.isNaN(d.getTime())) return str;
  return new Intl.DateTimeFormat("lv-LV", {
    timeZone: "Europe/Riga",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export function LeadActionHistory({ leadId }: { leadId: string | null }) {
  const q = useQuery({
    queryKey: ["crm", "action_history", leadId ?? ""],
    queryFn: () =>
      fetchCrmView({
        data: {
          view: "action_history",
          query: `lead_id=eq.${encodeURIComponent(leadId ?? "")}&order=completed_at.desc&limit=200`,
        },
      }),
    enabled: !!leadId,
    staleTime: 30_000,
  });

  // TEMP debug logging
  if (typeof window !== "undefined") {
    // eslint-disable-next-line no-console
    console.log("[action_history] leadId:", leadId, "rows:", q.data?.rows?.length ?? 0, "error:", q.data?.error);
  }

  if (!leadId) return null;
  if (q.isLoading) return <LoadingState />;
  if (q.data?.error) return <ErrorState message={q.data.error} />;

  const rows: Row[] = q.data?.rows ?? [];
  if (rows.length === 0) {
    return <EmptyState label="Vēstures ierakstu vēl nav." />;
  }

  return (
    <ol className="relative space-y-3 border-l border-border pl-4">
      {rows.map((r, i) => {
        const prevAction = s(r.previous_action);
        const prevOwner = s(r.previous_owner);
        const prevDue = s(r.previous_due_date);
        const note = s(r.completion_note);
        const nextAction = s(r.next_action);
        const nextOwner = s(r.next_owner);
        const nextDue = s(r.next_due_date);
        const completedBy = s(r.completed_by);

        return (
          <li key={i} className="relative">
            <span className="absolute -left-[22px] top-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-primary/10 ring-2 ring-background">
              <CheckCircle2 className="h-3 w-3 text-primary" />
            </span>
            <div className="rounded-lg border border-border bg-card p-3 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-foreground">
                  {fmtDateTime(r.completed_at)}
                </span>
                {completedBy && (
                  <span className="text-[11px] text-muted-foreground">
                    {completedBy}
                  </span>
                )}
              </div>

              <div className="mt-2">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground/70">
                  Pabeigtā darbība
                </div>
                <div className="text-sm font-medium text-foreground">
                  {prevAction || "—"}
                </div>
                <div className="mt-0.5 flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
                  {prevOwner && <span>Atbildīgais: {prevOwner}</span>}
                  {prevDue && <span>Termiņš: {fmtDate(prevDue)}</span>}
                </div>
              </div>

              {note && (
                <div className="mt-2 rounded border-l-2 border-primary/40 bg-muted/40 px-2 py-1.5 text-[12px] text-foreground/80">
                  {note}
                </div>
              )}

              {nextAction && (
                <div className="mt-2 border-t border-border/60 pt-2">
                  <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground/70">
                    <ArrowRight className="h-3 w-3" /> Nākamā darbība
                  </div>
                  <div className="text-sm font-medium text-foreground">
                    {nextAction}
                  </div>
                  <div className="mt-0.5 flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
                    {nextOwner && <span>Atbildīgais: {nextOwner}</span>}
                    {nextDue && <span>Termiņš: {fmtDate(nextDue)}</span>}
                  </div>
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}