## Goal

Replace the placeholder at `/import-review` with a real, read-only audit view backed by `crm.import_sessions` and `crm.import_changes`. No DB writes, no migrations, no RPC, no approve/reject actions.

## Approach

Reuse the existing `fetchCrmView` server function in `src/server/analytics.ts`. It already speaks PostgREST against the `crm` schema with `Accept-Profile: crm`, supports arbitrary querystrings, and is read-only. We extend its allowlist with two new identifiers — `import_sessions` and `import_changes` — which PostgREST exposes the same way for tables and views.

No new server fn, no new client, no schema changes.

## File changes

1. `src/server/analytics.ts`
   - Add `"import_sessions"` and `"import_changes"` to the `CRM_VIEWS` tuple (allowlist only — no behavior change).

2. `src/routes/import-review.tsx` (full rewrite of the placeholder)
   - Route guarded by `allowedRoles={["admin", "manager"]}` via existing role check pattern (keep parity with current placeholder).
   - URL search state via `validateSearch` (zod): `session` (string id), `approval_status`, `validation_status`, `change_type`, `conflict_type` (string), `has_conflict` ("true" | "false" | undefined).
   - Two stacked sections inside one page:
     - **Section A — Import Sessions**
       - Data: `useCrmView("import_sessions", query)` where `query = "select=id,source_system,import_type,status,total_records,processed_records,warnings_count,conflicts_count,approved_count,rejected_count,started_at,completed_at&order=started_at.desc.nullslast&limit=200"`.
       - Render via shadcn `Table`. Row click sets `?session=<id>` (preserves other params). Selected row highlighted.
       - Show counts as compact numeric cells; `status` via existing `StatusBadge`. Dates formatted (sv-SE locale ok).
     - **Section B — Import Changes** (only mounts when `session` is set)
       - Filter bar: 5 controls (shadcn `Select` for enums, `Switch`/`Select` for `has_conflict`). Options derived from distinct values in the currently loaded changes payload (no extra fetch). "Visi" option clears that filter.
       - Data: `useCrmView("import_changes", query)` where query is built as:
         - `import_session_id=eq.<session>`
         - optional `approval_status=eq.X`, `validation_status=eq.X`, `change_type=eq.X`, `conflict_type=eq.X`
         - optional `has_conflict=is.true` / `is.false`
         - `order=has_conflict.desc.nullslast,created_at.desc`
         - `limit=500`
         - `select=id,import_session_id,entity_type,entity_id,external_id,field_name,old_value,new_value,change_type,validation_status,approval_status,has_conflict,conflict_type,conflict_reason,duplicate_detected,orphan_detected,review_action,review_note,created_at,reviewed_at`
       - Render via shadcn `Table`. `old_value` / `new_value` shown as truncated text with full content in a `Tooltip`. Booleans (`has_conflict`, `duplicate_detected`, `orphan_detected`) rendered as small pill badges. Long-row horizontal scroll via existing `Table` wrapper.
   - Loading: `LoadingState`. Error: `ErrorState`. Empty: `EmptyState`. (All from `src/components/DataState.tsx`.)
   - Header via `PageHeader` ("Importa pārskats", read-only audit hint in description).

## Read-only guarantees

- No mutations, no RPC, no `callCrmRpc` usage.
- Server fn used (`fetchCrmView`) is GET-only and already in the codebase — unchanged.
- No edit to any schema, migrations, or `public.*`.
- No approve/reject UI elements present.

## Technical notes

- PostgREST exposes both tables and views identically; the allowlist constant `CRM_VIEWS` is just a name guard, so adding the two table names is the only required server change.
- All filter params are passed through PostgREST eq/is operators — no SQL constructed in the client.
- `react-query` cache key includes the query string, so changing filters or selected session re-fetches automatically (existing `useCrmView` behavior).

## Out of scope (per request)

- No write paths, no apply pipeline, no reviewer actions, no migrations, no schema changes, no public schema access, no RPC.

## Verification after implementation

- Manually click a session → Changes table populates and is sorted with conflicts first.
- Each filter narrows the result set and clears cleanly.
- Refresh preserves selection and filters via URL.
- Build passes (typecheck on the new route + zod schema).
