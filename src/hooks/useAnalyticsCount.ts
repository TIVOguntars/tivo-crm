import { useQuery } from "@tanstack/react-query";
import { fetchAnalyticsView, type AnalyticsView } from "@/server/analytics";

/**
 * Fetch the exact total row count for an analytics view with a given filter
 * query (PostgREST syntax, no `limit`/`offset`). Uses `Prefer: count=exact`
 * via fetchAnalyticsView with `limit=1` so payload is minimal.
 * Returns `null` while loading / on error so callers can render skeletons.
 */
export function useAnalyticsCount(
  view: AnalyticsView,
  filterQuery: string,
  enabled: boolean = true,
) {
  const query = [filterQuery, "limit=1"].filter(Boolean).join("&");
  return useQuery({
    queryKey: ["analytics-count", view, query],
    enabled,
    queryFn: async () => {
      const res = await fetchAnalyticsView({
        data: { view, query, withCount: true },
      });
      if (res.error) throw new Error(res.error);
      return res.total ?? 0;
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}