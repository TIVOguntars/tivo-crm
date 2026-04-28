import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";

import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { LoadingState, ErrorState, EmptyState } from "@/components/DataState";
import { useAnalyticsView } from "@/hooks/useAnalyticsView";

export const Route = createFileRoute("/darba-rinda")({
  component: DarbaRindaPage,
});

const COLUMNS: { key: string; label: string; widthClass?: string; wrap?: boolean }[] = [
  { key: "full_name", label: "Vārds", widthClass: "w-[220px] max-w-[220px]", wrap: true },
  { key: "email", label: "Email", widthClass: "w-[240px] max-w-[240px]", wrap: true },
  { key: "current_status", label: "Statuss" },
  { key: "suggested_status", label: "Ieteiktais statuss" },
  { key: "priority_score", label: "Prioritāte" },
  { key: "time_since_last_activity", label: "Laiks kopš aktivitātes" },
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
                          const text = formatCell(row[c.key]);
                          const isScore = c.key === "priority_score";
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
                              {text === "" ? (
                                <span className="text-muted-foreground">—</span>
                              ) : (
                                text
                              )}
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