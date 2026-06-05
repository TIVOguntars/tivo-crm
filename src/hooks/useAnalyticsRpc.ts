import { useQuery } from "@tanstack/react-query";
import {
  fetchAnalyticsRpc,
  type AnalyticsRpc,
  type AnalyticsFilters,
} from "@/lib/analytics";

export function useAnalyticsRpc(fn: AnalyticsRpc, filters: AnalyticsFilters) {
  return useQuery({
    queryKey: ["analytics-rpc", fn, filters],
    queryFn: () => fetchAnalyticsRpc({ data: { fn, filters } }),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}