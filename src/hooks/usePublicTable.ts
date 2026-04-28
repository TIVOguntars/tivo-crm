import { useQuery } from "@tanstack/react-query";
import { fetchPublicTable, type PublicTable } from "@/server/analytics";

export function usePublicTable(
  table: PublicTable,
  query?: string,
  options?: { enabled?: boolean; fresh?: boolean },
) {
  const fresh = options?.fresh ?? false;
  return useQuery({
    queryKey: ["public", table, query ?? ""],
    queryFn: () => fetchPublicTable({ data: { table, query } }),
    enabled: options?.enabled ?? true,
    staleTime: fresh ? 0 : 60_000,
    gcTime: fresh ? 0 : 5 * 60_000,
    refetchOnMount: fresh ? "always" : true,
    refetchOnWindowFocus: fresh,
  });
}