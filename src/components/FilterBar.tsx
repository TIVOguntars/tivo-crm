import { useMemo } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { Calendar as CalendarIcon, ChevronDown, X } from "lucide-react";

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
    | { countries?: string[]; sources?: string[]; owners?: string[] }
    | undefined;

  const countriesList = optRow?.countries ?? [];
  const sourcesList = optRow?.sources ?? [];
  const ownersList = optRow?.owners ?? [];

  const { from, to } = useMemo(() => resolveDateRange(search), [search]);

  const setRange = (range: DateRangePreset) => {
    navigate({
      to: ".",
      search: (prev: FiltersSearch) => ({
        ...(prev as FiltersSearch),
        range,
        // clear custom dates when leaving custom
        from: range === "custom" ? (prev as FiltersSearch).from : undefined,
        to: range === "custom" ? (prev as FiltersSearch).to : undefined,
      }),
      replace: true,
    });
  };

  const setCustomDates = (next: { from?: string; to?: string }) => {
    navigate({
      to: ".",
      search: (prev: FiltersSearch) => ({
        ...(prev as FiltersSearch),
        range: "custom",
        from: next.from,
        to: next.to,
      }),
      replace: true,
    });
  };

  const toggleMulti = (
    key: "countries" | "sources" | "owners",
    value: string,
  ) => {
    navigate({
      to: ".",
      search: (prev: FiltersSearch) => {
        const p = prev as FiltersSearch;
        const cur = p[key] ?? [];
        const next = cur.includes(value)
          ? cur.filter((v) => v !== value)
          : [...cur, value];
        return { ...p, [key]: next };
      },
      replace: true,
    });
  };

  const clearMulti = (key: "countries" | "sources" | "owners") => {
    navigate({
      to: ".",
      search: (prev: FiltersSearch) => ({ ...(prev as FiltersSearch), [key]: [] }),
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
      }),
      replace: true,
    });
  };

  const hasActiveFilters =
    search.range !== "30d" ||
    (search.countries?.length ?? 0) > 0 ||
    (search.sources?.length ?? 0) > 0 ||
    (search.owners?.length ?? 0) > 0;

  return (
    <div className="border-b border-border bg-card/50">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-4 py-3 sm:px-6">
        <DateRangeFilter
          search={search}
          onPreset={setRange}
          onCustomChange={setCustomDates}
          fromResolved={from}
          toResolved={to}
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
            className="ml-auto h-8 text-xs text-muted-foreground"
          >
            <X className="mr-1 h-3 w-3" />
            Notīrīt filtrus
          </Button>
        )}
      </div>
    </div>
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
  values,
  options,
  loading,
  onToggle,
  onClear,
}: {
  label: string;
  values: string[];
  options: string[];
  loading: boolean;
  onToggle: (v: string) => void;
  onClear: () => void;
}) {
  return (
    <Popover>
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