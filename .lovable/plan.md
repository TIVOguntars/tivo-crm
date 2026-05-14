
## Change

Wire Leadi rows to the new backend view `crm.lead_row_communication_counts`. Drop all frontend counter aggregation.

### File: `src/routes/leadi.tsx`

1. Replace the `commsEvents = useCrmView("communication_events", …)` query (line ~640) with:

```ts
const rowCountsQuery = useMemo(() => {
  if (overviewLeadIds.length === 0) {
    return "select=lead_id,email_outbound_count,email_inbound_count,call_outbound_count,call_inbound_count,chat_outbound_count,chat_inbound_count&limit=0";
  }
  const ids = overviewLeadIds.map((id) => `"${id.replace(/"/g, "")}"`).join(",");
  return `select=lead_id,email_outbound_count,email_inbound_count,call_outbound_count,call_inbound_count,chat_outbound_count,chat_inbound_count&lead_id=in.(${ids})&limit=${overviewLeadIds.length}`;
}, [overviewLeadIds]);

const rowCounts = useCrmView("lead_row_communication_counts", rowCountsQuery);
```

2. Replace the entire `commCounts` memo (lines ~644–736) with a thin mapper:

```ts
const commCounts = useMemo(() => {
  const map = new Map<
    string,
    { call: [number, number]; email: [number, number]; chat: [number, number] }
  >();
  const rows = (rowCounts.data?.rows ?? []) as Row[];
  for (const r of rows) {
    const lid = s(r.lead_id);
    if (!lid) continue;
    map.set(lid, {
      email: [Number(r.email_outbound_count) || 0, Number(r.email_inbound_count) || 0],
      call:  [Number(r.call_outbound_count)  || 0, Number(r.call_inbound_count)  || 0],
      chat:  [Number(r.chat_outbound_count)  || 0, Number(r.chat_inbound_count)  || 0],
    });
  }
  return map;
}, [rowCounts.data]);
```

3. Add `lead_row_communication_counts` to the `CRM_VIEWS` allowlist in `src/server/analytics.ts` (the `useCrmView` hook ultimately calls `fetchCrmView`, which rejects unknown views).

4. No changes to the row mapping or `<CommStats counts={commCounts.get(l.lead_id)} />` call site — the shape stays `[outbound, inbound]` per channel.

### Removed

- `commsEvents` query, `channelBucket`, `inboundEmailEvents`, `outboundEvents`, `inboundEvents`, the `unmapped` warning logic — gone.
- The `crmLeadIdByKnownId` map keeps its other uses (lead identity facts) and is no longer referenced from counters.

## Out of scope

- No DB changes. View `crm.lead_row_communication_counts` is assumed to already exist.
- No change to `next_action_queue_display_enriched` reads or row navigation.
- No changes to the 360 profile.

## Expected result

Lars-Magnus Gustafsson row: ✉️ 10/6, populated directly from the backend view.
