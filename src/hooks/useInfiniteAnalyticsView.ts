import { useInfiniteQuery } from "@tanstack/react-query";
import { fetchAnalyticsView, type AnalyticsView } from "@/server/analytics";

const PAGE_SIZE = 100;

/**
 * Server-side paginated infinite query against an analytics view.
 * `baseQuery` should contain `select`, `order`, and any filter params,
 * but MUST NOT include `limit` or `offset` — the hook manages those.
 */
export function useInfiniteAnalyticsView(
  view: AnalyticsView,
  baseQuery: string,
  pageSize: number = PAGE_SIZE,
) {
  return useInfiniteQuery({
    queryKey: ["analytics-infinite", view, baseQuery, pageSize],
    queryFn: async ({ pageParam = 0 }) => {
      const offset = pageParam as number;
      const parts = [baseQuery, `limit=${pageSize}`, `offset=${offset}`].filter(
        Boolean,
      );
      const query = parts.join("&");
      const res = await fetchAnalyticsView({
        data: { view, query, withCount: offset === 0 },
      });
      return {
        rows: res.rows ?? [],
        total: res.total ?? null,
        error: res.error ?? null,
        offset,
      };
    },
    initialPageParam: 0,
    getNextPageParam: (last, allPages) => {
      const fetched = allPages.reduce((n, p) => n + p.rows.length, 0);
      // First page carries the authoritative total; fall back to "more if full page".
      const total = allPages[0]?.total ?? null;
      if (total != null) return fetched < total ? fetched : undefined;
      return last.rows.length === pageSize ? fetched : undefined;
    },
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}
