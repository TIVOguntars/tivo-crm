import { useQuery } from "@tanstack/react-query";
import {
  fetchAnalyticsRpc,
  fetchDashboardSummary,
  fetchDashboardKpis,
  type AnalyticsRpc,
  type AnalyticsFilters,
} from "@/server/analytics";

export function useAnalyticsRpc(fn: AnalyticsRpc, filters: AnalyticsFilters) {
  return useQuery({
    queryKey: ["analytics-rpc", fn, filters],
    queryFn: () => fetchAnalyticsRpc({ data: { fn, filters } }),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}

export function useDashboardSummary() {
  return useQuery({
    queryKey: ["dashboard-summary"],
    queryFn: () => fetchDashboardSummary(),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}

export function useDashboardKpis() {
  return useQuery({
    queryKey: ["dashboard-kpis"],
    queryFn: () => fetchDashboardKpis(),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}