import { useQuery } from "@tanstack/react-query";
import { callCrmRpc, type CrmRpc } from "@/server/analytics";

export function useCrmRpc(
  fn: CrmRpc,
  params: Record<string, unknown>,
  enabled = true,
) {
  return useQuery({
    queryKey: ["crm-rpc", fn, params],
    queryFn: () => callCrmRpc({ data: { fn, params } }),
    enabled,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}