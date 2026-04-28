import { useQuery } from "@tanstack/react-query";
import { fetchPublicTable, type PublicTable } from "@/server/analytics";

export function usePublicTable(table: PublicTable, query?: string) {
  return useQuery({
    queryKey: ["public", table, query ?? ""],
    queryFn: () => fetchPublicTable({ data: { table, query } }),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}