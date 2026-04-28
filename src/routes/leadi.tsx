import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";

import { PageHeader } from "@/components/PageHeader";
import { LoadingState, ErrorState, EmptyState } from "@/components/DataState";
import { useAnalyticsView } from "@/hooks/useAnalyticsView";
import { resolveDateRange } from "@/lib/filters";

export const Route = createFileRoute("/leadi")({
  component: LeadiPage,
});

const VISIBLE_COLUMNS: {
  key: string;
  label: string;
  widthClass?: string;
  wrap?: boolean;
}[] = [
  {
    key: "full_name",
    label: "Vārds / Uzvārds",
    widthClass: "w-[250px] max-w-[250px]",
    wrap: true,
  },
  {
    key: "email",
    label: "Email",
    widthClass: "w-[250px] max-w-[250px]",
    wrap: true,
  },
  { key: "phone_raw", label: "Telefons" },
  { key: "country", label: "Valsts" },
  { key: "source", label: "Avots" },
  { key: "source_detailed", label: "Detalizēts avots" },
  { key: "status", label: "Statuss" },
  { key: "owner", label: "Atbildīgais" },
  { key: "next_action", label: "Nākamā darbība" },
  { key: "next_action_due_date", label: "Termiņš" },
  { key: "last_contact_date", label: "Pēdējā saziņa" },
  { key: "rating", label: "Reitings" },
  { key: "tags", label: "Tags" },
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

function LeadiPage() {
  const search = Route.useSearch();
  const { from, to } = useMemo(() => resolveDateRange(search), [search]);

  const query = useMemo(() => {
    const parts: string[] = [
      "order=lead_created_at.desc.nullslast",
      "limit=500",
    ];
    if (from) parts.push(`lead_created_date=gte.${from}`);
    if (to) parts.push(`lead_created_date=lte.${to}`);
    if (search.countries.length > 0)
      parts.push(`country=in.(${search.countries.map(encodeURIComponent).join(",")})`);
    if (search.sources.length > 0)
      parts.push(`source=in.(${search.sources.map(encodeURIComponent).join(",")})`);
    if (search.owners.length > 0)
      parts.push(`owner=in.(${search.owners.map(encodeURIComponent).join(",")})`);
    if (search.ppvs.length > 0)
      parts.push(`ppv_vards=in.(${search.ppvs.map(encodeURIComponent).join(",")})`);
    return parts.join("&");
  }, [from, to, search.countries, search.sources, search.owners, search.ppvs]);

  const { data, isLoading, error } = useAnalyticsView("leads_overview", query);
  const q = search.q ?? "";

  const rows = (data?.rows ?? []) as Array<Record<string, unknown>>;

  const filtered = useMemo(() => {
    const selectedTags = search.tags ?? [];
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (selectedTags.length > 0) {
        const v = r.tags;
        const rowTags: string[] = Array.isArray(v)
          ? v.map((t) => String(t).trim()).filter(Boolean)
          : v == null
            ? []
            : String(v)
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean);
        const lower = rowTags.map((t) => t.toLowerCase());
        const hit = selectedTags.some((t) => lower.includes(t.toLowerCase()));
        if (!hit) return false;
      }
      if (needle) {
        return SEARCH_KEYS.some((k) => {
          const v = r[k];
          return v == null ? false : String(v).toLowerCase().includes(needle);
        });
      }
      return true;
    });
  }, [rows, q, search.tags]);

  const errorMsg = (error as Error | null)?.message || data?.error;

  return (
    <>
      <PageHeader
        title="Leadi"
        description={`Pēdējie ${rows.length} leadi no analytics.leads_overview`}
      />

      {errorMsg && <ErrorState message={errorMsg} />}
      {!errorMsg && isLoading && <LoadingState />}

      {!errorMsg && !isLoading && (
        rows.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="flex flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm" style={{ maxHeight: "calc(100vh - 260px)" }}>
            <div className="flex-1 overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-muted text-xs uppercase text-muted-foreground shadow-sm">
                  <tr>
                    {VISIBLE_COLUMNS.map((c) => (
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
                  {filtered.map((row, i) => (
                    <tr
                      key={i}
                      className="border-t border-border hover:bg-secondary/30"
                    >
                      {VISIBLE_COLUMNS.map((c) => {
                        const text = formatCell(row[c.key]);
                        return (
                          <td
                            key={c.key}
                            className={`px-4 py-2 text-foreground ${
                              c.wrap
                                ? "whitespace-normal break-words"
                                : "whitespace-nowrap"
                            } ${c.widthClass ?? ""}`}
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
                  ))}
                </tbody>
              </table>
            </div>
            <div className="border-t border-border bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
              Rāda {filtered.length} no {rows.length} ierakstiem
            </div>
          </div>
        )
      )}
    </>
  );
}