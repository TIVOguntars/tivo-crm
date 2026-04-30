/**
 * Detect whether an analytics error message indicates a missing or
 * incompatible endpoint (RPC/view), as opposed to a transient failure.
 *
 * When true, the UI must show a friendly Latvian placeholder instead of
 * the raw database error.
 *
 * Matched signals:
 * - HTTP 404 / 406 wrappers from our analytics fetcher
 * - PostgREST codes:
 *     PGRST202 — no matching function (RPC missing / signature mismatch)
 *     PGRST205 — relation does not exist
 * - Postgres SQLSTATEs:
 *     42P01 — undefined_table
 *     42883 — undefined_function
 *     42703 — undefined_column (schema drift)
 * - Common English error phrases used by PostgREST/Postgres
 */
export function isEndpointMissing(message: string | null | undefined): boolean {
  if (!message) return false;
  const m = message.toLowerCase();
  return (
    m.includes("(404)") ||
    m.includes(" 404 ") ||
    m.includes("pgrst202") ||
    m.includes("pgrst205") ||
    m.includes("42p01") ||
    m.includes("42883") ||
    m.includes("42703") ||
    m.includes("does not exist") ||
    m.includes("could not find the function") ||
    m.includes("undefined_table") ||
    m.includes("undefined_function") ||
    m.includes("undefined_column")
  );
}