import { createFileRoute, useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Eye,
  Mail,
  MessageSquare,
  Phone,
  MessageCircle,
  Send,
  Search,
} from "lucide-react";

import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { LoadingState, ErrorState, EmptyState } from "@/components/DataState";
import { Button } from "@/components/ui/button";
import { useAnalyticsView } from "@/hooks/useAnalyticsView";

export const Route = createFileRoute("/darba-rinda")({
  component: DarbaRindaPage,
});

const COLUMNS: { key: string; label: string; widthClass?: string; wrap?: boolean; align?: "left" | "right" | "center" }[] = [
  { key: "full_name", label: "Vārds", widthClass: "w-[16%] min-w-[140px]", wrap: true },
  { key: "email", label: "Email", widthClass: "w-[20%] min-w-[180px]", wrap: true },
  { key: "phone_raw", label: "Telefons", widthClass: "w-[11%] min-w-[120px]" },
  { key: "current_status", label: "Statuss", widthClass: "w-[10%] min-w-[110px]" },
  { key: "suggested_status", label: "Ieteiktais", widthClass: "w-[11%] min-w-[110px]" },
  { key: "priority_score", label: "Prior.", widthClass: "w-[6%] min-w-[60px]", align: "right" },
  { key: "time_since_last_activity", label: "Aktivitāte", widthClass: "w-[10%] min-w-[100px]" },
  { key: "__actions", label: "Darbības", widthClass: "w-[16%] min-w-[180px]" },
];

const SEARCH_KEYS = ["full_name", "email", "phone_raw"] as const;

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
  const navigate = useNavigate();
  const comingSoon = () => toast("Drīzumā");

  const handleViewProfile = () => {
    if (leadId == null) {
      toast("Lead ID nav pieejams");
      return;
    }
    navigate({ to: "/lead/$leadId", params: { leadId: String(leadId) } });
  };

  return (
    <div className="flex flex-nowrap items-center gap-0.5">
      <Button
        size="sm"
        variant="outline"
        className="h-6 px-1.5"
        onClick={handleViewProfile}
        title="Skatīt profilu"
      >
        <Eye className="h-3 w-3" />
      </Button>
      <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={comingSoon} title="E-pasts">
        <Mail className="h-3 w-3" />
      </Button>
      <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={comingSoon} title="SMS">
        <MessageSquare className="h-3 w-3" />
      </Button>
      <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={comingSoon} title="WhatsApp">
        <Send className="h-3 w-3" />
      </Button>
      <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={comingSoon} title="Zvans">
        <Phone className="h-3 w-3" />
      </Button>
      <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={comingSoon} title="Messenger">
        <MessageCircle className="h-3 w-3" />
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

  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    if (!q.trim()) return rows;
    const needle = q.trim().toLowerCase();
    return rows.filter((r) =>
      SEARCH_KEYS.some((k) => {
        const v = r[k];
        return v == null ? false : String(v).toLowerCase().includes(needle);
      }),
    );
  }, [rows, q]);

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
      >
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Meklēt pēc vārda, e-pasta vai telefona..."
            className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring sm:w-72"
          />
        </div>
      </PageHeader>

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
              <table className="w-full table-fixed text-sm">
                <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                  <tr>
                    {COLUMNS.map((c) => (
                      <th
                        key={c.key}
                        className={`px-2 py-2 font-medium tracking-wide ${
                          c.align === "right" ? "text-right" : "text-left"
                        } ${c.wrap ? "" : "whitespace-nowrap"} ${c.widthClass ?? ""}`}
                      >
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row, i) => {
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
                          let content: ReactNode;
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
                              className={`px-2 py-2 text-foreground ${
                                c.align === "right" ? "text-right" : "text-left"
                              } ${
                                c.wrap
                                  ? "whitespace-normal break-words"
                                  : "truncate"
                              } ${c.widthClass ?? ""} ${
                                isScore ? "font-semibold tabular-nums" : ""
                              }`}
                              title={
                                c.key !== "__actions" && !c.wrap
                                  ? formatCell(row[c.key])
                                  : undefined
                              }
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
              Rāda {filtered.length} no {rows.length} ierakstiem, sakārtotus pēc prioritātes
            </div>
          </div>
        )
      )}
    </>
  );
}