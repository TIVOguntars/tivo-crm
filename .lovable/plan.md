## Change

In `src/routes/leadi.tsx` (lines 564–568), replace the mixed `or=(id.in.(...),external_id.in.(...))` lookup with an id-only PostgREST query, since `crm.next_action_queue_display_enriched.lead_id` now returns canonical `crm.leads.id`.

### Replace

```ts
const leadIdentityQuery = useMemo(() => {
  if (overviewLeadIds.length === 0) return "select=id,external_id&limit=0";
  const ids = overviewLeadIds.map((id) => `"${id.replace(/"/g, "")}"`).join(",");
  return `select=id,external_id,status,owner_user_id,ppv_user_id,contact_id,updated_at&or=(id.in.(${ids}),external_id.in.(${ids}))&limit=${overviewLeadIds.length}`;
}, [overviewLeadIds]);
```

### With

```ts
const leadIdentityQuery = useMemo(() => {
  if (overviewLeadIds.length === 0) {
    return "select=id,external_id,status,owner_user_id,ppv_user_id,contact_id,updated_at&limit=0";
  }
  const ids = overviewLeadIds
    .map((id) => `"${id.replace(/"/g, "")}"`)
    .join(",");
  return `select=id,external_id,status,owner_user_id,ppv_user_id,contact_id,updated_at&id=in.(${ids})&limit=${overviewLeadIds.length}`;
}, [overviewLeadIds]);
```

## Out of scope

- No DB changes.
- `crmLeadIdByKnownId` keeps the `external_id → crm.leads.id` mapping entry (harmless; rows fetched now match by `id` so the external_id key is just an extra safety alias). No other code modified.
- Row navigation stays `openLead(l.lead_id)`.
