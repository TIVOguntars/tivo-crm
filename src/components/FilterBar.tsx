import { useMemo } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { Calendar as CalendarIcon, ChevronDown, X, Search } from "lucide-react";

// touch: re-resolve module

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useAnalyticsView } from "@/hooks/useAnalyticsView";
import {
  resolveDateRange,
  type DateRangePreset,
  type FiltersSearch,
} from "@/lib/filters";

const RANGE_LABELS: Record<DateRangePreset, string> = {
  today: "Šodien",
  "7d": "Pēdējās 7 dienas",
  "30d": "Pēdējās 30 dienas",
  custom: "Pielāgots",
};

function formatDate(d: string | null): string {
  if (!d) return "—";
  return d;
}

export function FilterBar() {
  const search = useSearch({ strict: false }) as FiltersSearch;
  const navigate = useNavigate();

  const options = useAnalyticsView("filter_options");
  const optRow = (options.data?.rows ?? [])[0] as
    | {
        countries?: string[];
        sources?: string[];
        owners?: string[];
        ppvs?: string[];
      }
    | undefined;

  const countriesList = optRow?.countries ?? [];
  const sourcesList = optRow?.sources ?? [];
  const ownersList = optRow?.owners ?? [];
  const ppvsList = optRow?.ppvs ?? [];

  // Tags come from analytics.lead_priority_queue.tags — no DB schema change.
  const tagsView = useAnalyticsView(
    "lead_priority_queue",
    "select=tags&limit=2000",
  );
  const tagsList = useMemo(() => {
    const rows = (tagsView.data?.rows ?? []) as Array<{ tags?: unknown }>;
    const set = new Set<string>();
    for (const r of rows) {
      const v = r.tags;
      if (v == null) continue;
      if (Array.isArray(v)) {
        for (const t of v) {
          const s = String(t).trim();
          if (s) set.add(s);
        }
      } else {
        for (const t of String(v).split(",")) {
          const s = t.trim();
          if (s) set.add(s);
        }
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "lv"));
  }, [tagsView.data]);

  const { from, to } = useMemo(() => resolveDateRange(search), [search]);

  const setRange = (range: DateRangePreset) => {
    navigate({
      to: ".",
      search: ((prev: FiltersSearch) => ({
        ...(prev as FiltersSearch),
        range,
        // clear custom dates when leaving custom
        from: range === "custom" ? (prev as FiltersSearch).from : undefined,
        to: range === "custom" ? (prev as FiltersSearch).to : undefined,
      })) as never,
      replace: true,
    });
  };

  const setCustomDates = (next: { from?: string; to?: string }) => {
    navigate({
      to: ".",
      search: ((prev: FiltersSearch) => ({
        ...(prev as FiltersSearch),
        range: "custom",
        from: next.from,
        to: next.to,
      })) as never,
      replace: true,
    });
  };

  const toggleMulti = (
    key: "countries" | "sources" | "owners" | "ppvs" | "tags",
    value: string,
  ) => {
    navigate({
      to: ".",
      search: ((prev: FiltersSearch) => {
        const p = prev as FiltersSearch;
        const cur = p[key] ?? [];
        const next = cur.includes(value)
          ? cur.filter((v) => v !== value)
          : [...cur, value];
        return { ...p, [key]: next };
      }) as never,
      replace: true,
    });
  };

  const clearMulti = (
    key: "countries" | "sources" | "owners" | "ppvs" | "tags",
  ) => {
    navigate({
      to: ".",
      search: ((prev: FiltersSearch) => ({ ...(prev as FiltersSearch), [key]: [] })) as never,
      replace: true,
    });
  };

  const resetAll = () => {
    navigate({
      to: ".",
      search: () => ({
        range: "30d" as const,
        from: undefined,
        to: undefined,
        countries: [],
        sources: [],
        owners: [],
        ppvs: [],
        tags: [],
        q: undefined,
      }),
      replace: true,
    });
  };

  const setQ = (value: string) => {
    navigate({
      to: ".",
      search: ((prev: FiltersSearch) => ({
        ...(prev as FiltersSearch),
        q: value ? value : undefined,
      })) as never,
      replace: true,
    });
  };

  const hasActiveFilters =
    search.range !== "30d" ||
    (search.countries?.length ?? 0) > 0 ||
    (search.sources?.length ?? 0) > 0 ||
    (search.owners?.length ?? 0) > 0 ||
    (search.ppvs?.length ?? 0) > 0 ||
    (search.tags?.length ?? 0) > 0;

  return (
    <TooltipProvider delayDuration={200}>
    <div className="sticky top-14 z-20 border-b border-border bg-card/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-4 py-3 sm:px-6">
        <MultiSelectFilter
          label="PPV"
          tooltip="Pārdošanas pārstāvis / PPV"
          values={search.ppvs ?? []}
          options={ppvsList}
          loading={options.isLoading}
          onToggle={(v) => toggleMulti("ppvs", v)}
          onClear={() => clearMulti("ppvs")}
        />

        <MultiSelectFilter
          label="Tagi"
          values={search.tags ?? []}
          options={tagsList}
          loading={tagsView.isLoading}
          onToggle={(v) => toggleMulti("tags", v)}
          onClear={() => clearMulti("tags")}
        />

        <MultiSelectFilter
          label="Valsts"
          values={search.countries ?? []}
          options={countriesList}
          loading={options.isLoading}
          onToggle={(v) => toggleMulti("countries", v)}
          onClear={() => clearMulti("countries")}
        />

        <MultiSelectFilter
          label="Avots"
          values={search.sources ?? []}
          options={sourcesList}
          loading={options.isLoading}
          onToggle={(v) => toggleMulti("sources", v)}
          onClear={() => clearMulti("sources")}
        />

        <DateRangeFilter
          search={search}
          onPreset={setRange}
          onCustomChange={setCustomDates}
          fromResolved={from}
          toResolved={to}
        />

        <MultiSelectFilter
          label="Atbildīgais"
          values={search.owners ?? []}
          options={ownersList}
          loading={options.isLoading}
          onToggle={(v) => toggleMulti("owners", v)}
          onClear={() => clearMulti("owners")}
        />

        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={resetAll}
            className="h-8 text-xs text-muted-foreground"
          >
            <X className="mr-1 h-3 w-3" />
            Notīrīt filtrus
          </Button>
        )}

        <div className="relative ml-auto">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search.q ?? ""}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Meklēt pēc vārda, e-pasta vai telefona..."
            className="h-8 w-full rounded-md border border-input bg-background pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring sm:w-72"
          />
        </div>
      </div>
    </div>
    </TooltipProvider>
  );
}

/* -------------------------------------------------------------------------- */

function DateRangeFilter({
  search,
  onPreset,
  onCustomChange,
  fromResolved,
  toResolved,
}: {
  search: FiltersSearch;
  onPreset: (r: DateRangePreset) => void;
  onCustomChange: (n: { from?: string; to?: string }) => void;
  fromResolved: string | null;
  toResolved: string | null;
}) {
  const label =
    search.range === "custom"
      ? `${formatDate(fromResolved)} → ${formatDate(toResolved)}`
      : RANGE_LABELS[search.range];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-2 text-xs font-medium"
        >
          <CalendarIcon className="h-3.5 w-3.5" />
          <span className="text-muted-foreground">Datums:</span>
          <span className="text-foreground">{label}</span>
          <ChevronDown className="h-3 w-3 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-auto p-0"
      >
        <div className="flex">
          <div className="flex w-40 flex-col border-r border-border p-2">
            {(Object.keys(RANGE_LABELS) as DateRangePreset[]).map((r) => (
              <button
                key={r}
                onClick={() => onPreset(r)}
                className={cn(
                  "rounded-md px-3 py-2 text-left text-sm transition-colors",
                  search.range === r
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:bg-secondary/60",
                )}
              >
                {RANGE_LABELS[r]}
              </button>
            ))}
          </div>
          {search.range === "custom" && (
            <div className="p-2">
              <Calendar
                mode="range"
                selected={{
                  from: search.from ? new Date(search.from) : undefined,
                  to: search.to ? new Date(search.to) : undefined,
                }}
                onSelect={(r) => {
                  onCustomChange({
                    from: r?.from ? toIso(r.from) : undefined,
                    to: r?.to ? toIso(r.to) : undefined,
                  });
                }}
                numberOfMonths={2}
                className={cn("p-3 pointer-events-auto")}
              />
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function toIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/* -------------------------------------------------------------------------- */

function MultiSelectFilter({
  label,
  tooltip,
  values,
  options,
  loading,
  onToggle,
  onClear,
}: {
  label: string;
  tooltip?: string;
  values: string[];
  options: string[];
  loading: boolean;
  onToggle: (v: string) => void;
  onClear: () => void;
}) {
  const trigger = (
    <PopoverTrigger asChild>
      <Button
        variant="outline"
        size="sm"
        className="h-8 gap-2 text-xs font-medium"
      >
        <span className="text-muted-foreground">{label}:</span>
        {values.length === 0 ? (
          <span className="text-foreground">Visi</span>
        ) : (
          <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
            {values.length}
          </Badge>
        )}
        <ChevronDown className="h-3 w-3 opacity-50" />
      </Button>
    </PopoverTrigger>
  );

  return (
    <Popover>
      {tooltip ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex">{trigger}</span>
          </TooltipTrigger>
          <TooltipContent>{tooltip}</TooltipContent>
        </Tooltip>
      ) : (
        trigger
      )}
      <PopoverContent align="start" className="w-64 p-0">
        <div className="border-b border-border px-3 py-2 text-xs font-medium text-muted-foreground">
          {label}
          {values.length > 0 && (
            <button
              onClick={onClear}
              className="float-right text-xs font-normal text-primary hover:underline"
            >
              Notīrīt
            </button>
          )}
        </div>
        <div className="max-h-72 overflow-y-auto p-2">
          {loading ? (
            <div className="space-y-2 p-2">
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-5 w-full" />
            </div>
          ) : options.length === 0 ? (
            <div className="p-3 text-center text-xs text-muted-foreground">
              Nav opciju
            </div>
          ) : (
            options.map((opt) => {
              const checked = values.includes(opt);
              return (
                <label
                  key={opt}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-secondary/60"
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => onToggle(opt)}
                  />
                  <span className="truncate text-foreground">{opt}</span>
                </label>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}