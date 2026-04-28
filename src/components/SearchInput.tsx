import { useNavigate, useSearch } from "@tanstack/react-router";
import { Search } from "lucide-react";

import type { FiltersSearch } from "@/lib/filters";

interface SearchInputProps {
  placeholder?: string;
  className?: string;
}

export function SearchInput({
  placeholder = "Meklēt pēc vārda, e-pasta vai telefona...",
  className,
}: SearchInputProps) {
  const search = useSearch({ strict: false }) as FiltersSearch;
  const navigate = useNavigate();

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

  return (
    <div className={`relative w-full sm:w-80 ${className ?? ""}`}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      <input
        value={search.q ?? ""}
        onChange={(e) => setQ(e.target.value)}
        placeholder={placeholder}
        className="h-8 w-full rounded-md border border-input bg-background pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
      />
    </div>
  );
}