import { useQuery } from "@tanstack/react-query";
import { callCrmRpc, type CrmRpc } from "@/lib/analytics";

export function useCrmRpc(
  fn: CrmRpc,
  params: Record<string, unknown>,
  enabled = true,
) {
  return useQuery({
    queryKey: ["crm-rpc", fn, params],
    queryFn: async () => {
      try {
        const res = await callCrmRpc({ data: { fn, params } });
        // Server fn always returns { rows, error }, but guard against
        // unexpected undefined (e.g. transport-level failure) so React
        // Query never throws "data is undefined".
        return res ?? { rows: [], error: "Tukša atbilde no servera" };
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Nezināma kļūda";
        return { rows: [], error: message };
      }
    },
    enabled,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}