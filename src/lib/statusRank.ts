/**
 * Shared lead-status rank for detecting "backwards" funnel transitions.
 * Lower rank = earlier in the funnel. 0 = unknown.
 * Kept in one place so BulkActionsBar and LeadEditPanel stay in sync.
 */
export const STATUS_ORDER: { match: RegExp; rank: number }[] = [
  { match: /jauns/i, rank: 1 },
  { match: /sarun|aktīv|aktiv/i, rank: 2 },
  { match: /piedāvāj|piedavaj|pieprasīj|pieprasij/i, rank: 3 },
  { match: /līgum|ligum|won|contract/i, rank: 4 },
  { match: /zaud|nesasn|bounce|nederīg/i, rank: 5 },
];

export function statusRank(s: string): number {
  if (!s) return 0;
  for (const r of STATUS_ORDER) if (r.match.test(s)) return r.rank;
  return 0;
}