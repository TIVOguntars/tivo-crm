import { useQuery } from "@tanstack/react-query";
import { fetchCrmView, type CrmView } from "@/server/analytics";

export function useCrmView(view: CrmView, query?: string, options?: { all?: boolean }) {
  const all = !!options?.all;
  return useQuery({
    queryKey: ["crm", view, query ?? "", all ? "all" : "page"],
    queryFn: () => fetchCrmView({ data: { view, query, all } }),
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });
}
