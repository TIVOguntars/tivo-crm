import { useQuery } from "@tanstack/react-query";
import { fetchAnalyticsView, type AnalyticsView } from "@/server/analytics";

export function useAnalyticsView(
  view: AnalyticsView,
  query?: string,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: ["analytics", view, query ?? ""],
    queryFn: () => fetchAnalyticsView({ data: { view, query } }),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    enabled: options?.enabled ?? true,
  });
}