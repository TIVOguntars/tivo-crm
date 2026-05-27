import { createServerFn } from "@tanstack/react-start";
import { getSupabaseEnvDiagnostics } from "@/lib/supabase-secret";

export const getSupabaseDiagnostics = createServerFn({ method: "GET" }).handler(() => {
  const diagnostics = getSupabaseEnvDiagnostics();
  console.log("[auth-debug] Supabase env diagnostics", diagnostics);
  return diagnostics;
});
