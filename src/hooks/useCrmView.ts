import { useQuery } from "@tanstack/react-query";
import { fetchCrmView, type CrmView } from "@/server/analytics";

export function useCrmView(view: CrmView, query?: string) {
  return useQuery({
    queryKey: ["crm", view, query ?? ""],
    queryFn: () => fetchCrmView({ data: { view, query } }),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}
