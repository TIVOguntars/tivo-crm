import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { toast } from "sonner";
import { Eye, Mail, MessageSquare, Phone, MessageCircle, Send } from "lucide-react";

import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { LoadingState, ErrorState, EmptyState } from "@/components/DataState";
import { Button } from "@/components/ui/button";
import { useAnalyticsView } from "@/hooks/useAnalyticsView";

export const Route = createFileRoute("/darba-rinda")({
  component: DarbaRindaPage,
});

const COLUMNS: { key: string; label: string; widthClass?: string; wrap?: boolean }[] = [
  { key: "full_name", label: "Vārds", widthClass: "w-[220px] max-w-[220px]", wrap: true },
  { key: "email", label: "Email", widthClass: "w-[240px] max-w-[240px]", wrap: true },
  { key: "phone_raw", label: "Telefons", widthClass: "w-[160px]" },
  { key: "current_status", label: "Statuss" },
  { key: "suggested_status", label: "Ieteiktais statuss" },
  { key: "priority_score", label: "Prioritāte" },
  { key: "time_since_last_activity", label: "Laiks kopš aktivitātes" },
  { key: "__actions", label: "Darbības", widthClass: "w-[280px]" },
];

function formatCell(value: unknown): string {
  if (value == null) return "";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function formatActivityInterval(value: unknown): string {
  if (value == null) return "—";
  // Postgres interval may come as ISO string "P1DT02:30:00" or "1 day 02:30:00" or "02:30:00"
  // Or as object { days, hours, minutes, seconds }
  let days = 0;
  let hours = 0;
  let minutes = 0;

  if (typeof value === "object") {
    const v = value as Record<string, unknown>;
    days = Number(v.days ?? 0) || 0;
    hours = Number(v.hours ?? 0) || 0;
    minutes = Number(v.minutes ?? 0) || 0;
  } else {
    const s = String(value).trim();
    if (!s) return "—";
    // Match e.g. "1 day 02:30:00", "2 days 14:05:09", "00:42:11"
    const dayMatch = s.match(/(\d+)\s*days?/i);
    if (dayMatch) days = Number(dayMatch[1]);
    const timeMatch = s.match(/(\d{1,3}):(\d{2})(?::(\d{2}))?/);
    if (timeMatch) {
      hours = Number(timeMatch[1]);
      minutes = Number(timeMatch[2]);
    }
  }

  const hh = String(hours).padStart(2, "0");
  const mm = String(minutes).padStart(2, "0");
  if (days > 0) return `${days} days ${hh}:${mm}`;
  return `${hh}:${mm}`;
}

function ActionButtons({ row }: { row: Record<string, unknown> }) {
  const leadId = row.lead_id ?? row.id;
  const comingSoon = () => toast("Drīzumā");

  const handleViewProfile = () => {
    if (leadId == null) {
      toast("Drīzumā");
      return;
    }
    // TODO: navigate to lead profile route once it exists
    toast(`Drīzumā: Lead profils #${leadId}`);
  };

  return (
    <div className="flex flex-wrap items-center gap-1">
      <Button
        size="sm"
        variant="outline"
        className="h-7 px-2"
        onClick={handleViewProfile}
        title="Skatīt profilu"
      >
        <Eye className="h-3.5 w-3.5" />
        <span className="ml-1 hidden xl:inline">Profils</span>
      </Button>
      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={comingSoon} title="E-pasts">
        <Mail className="h-3.5 w-3.5" />
      </Button>
      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={comingSoon} title="SMS">
        <MessageSquare className="h-3.5 w-3.5" />
      </Button>
      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={comingSoon} title="WhatsApp">
        <Send className="h-3.5 w-3.5" />
      </Button>
      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={comingSoon} title="Zvans">
        <Phone className="h-3.5 w-3.5" />
      </Button>
      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={comingSoon} title="Messenger">
        <MessageCircle className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function DarbaRindaPage() {
  const query = useMemo(
    () => "order=priority_score.desc.nullslast&limit=1000",
    [],
  );

  const { data, isLoading, error } = useAnalyticsView(
    "lead_priority_queue",
    query,
  );

  const rows = (data?.rows ?? []) as Array<Record<string, unknown>>;

  const { p100, p80, pGte80 } = useMemo(() => {
    let p100 = 0;
    let p80 = 0;
    let pGte80 = 0;
    for (const r of rows) {
      const score = Number(r.priority_score);
      if (!Number.isFinite(score)) continue;
      if (score === 100) p100 += 1;
      if (score === 80) p80 += 1;
      if (score >= 80) pGte80 += 1;
    }
    return { p100, p80, pGte80 };
  }, [rows]);

  const errorMsg = (error as Error | null)?.message || data?.error;

  return (
    <>
      <PageHeader
        title="Darba rinda"
        description="Prioritārie leadi no analytics.lead_priority_queue"
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Prioritāte = 100"
          value={p100}
          hint="Augstākā steidzamība"
        />
        <StatCard
          label="Prioritāte = 80"
          value={p80}
          hint="Augsta steidzamība"
        />
        <StatCard
          label="Prioritāte ≥ 80"
          value={pGte80}
          hint="Visi prioritārie kopā"
        />
      </div>

      {errorMsg && <ErrorState message={errorMsg} />}
      {!errorMsg && isLoading && <LoadingState />}

      {!errorMsg && !isLoading && (
        rows.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                  <tr>
                    {COLUMNS.map((c) => (
                      <th
                        key={c.key}
                        className={`px-4 py-2 text-left font-medium tracking-wide ${
                          c.wrap ? "" : "whitespace-nowrap"
                        } ${c.widthClass ?? ""}`}
                      >
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => {
                    const score = Number(row.priority_score);
                    const highlight =
                      score === 100
                        ? "bg-destructive/5"
                        : score >= 80
                          ? "bg-amber-500/5"
                          : "";
                    return (
                      <tr
                        key={i}
                        className={`border-t border-border hover:bg-secondary/30 ${highlight}`}
                      >
                        {COLUMNS.map((c) => {
                          const isScore = c.key === "priority_score";
                          let content: React.ReactNode;
                          if (c.key === "__actions") {
                            content = <ActionButtons row={row} />;
                          } else if (c.key === "time_since_last_activity") {
                            content = formatActivityInterval(row[c.key]);
                          } else {
                            const text = formatCell(row[c.key]);
                            content =
                              text === "" ? (
                                <span className="text-muted-foreground">—</span>
                              ) : (
                                text
                              );
                          }
                          return (
                            <td
                              key={c.key}
                              className={`px-4 py-2 text-foreground ${
                                c.wrap
                                  ? "whitespace-normal break-words"
                                  : "whitespace-nowrap"
                              } ${c.widthClass ?? ""} ${
                                isScore ? "font-semibold tabular-nums" : ""
                              }`}
                            >
                              {content}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="border-t border-border bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
              Rāda {rows.length} ierakstus, sakārtotus pēc prioritātes
            </div>
          </div>
        )
      )}
    </>
  );
}