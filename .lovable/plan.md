## Root cause

`crm.audit_events.actor_user_id` FK → **`crm.profiles(id)`** (not `public.profiles`), `ON DELETE SET NULL`, column already nullable.

`crm.rpc_create_task` calls `crm.create_audit_event(..., p_actor_user_id := v_actor, ...)` where `v_actor := auth.uid()`. The current authenticated Supabase user has no row in `crm.profiles` (`crm.profiles` contains only 1 record — `1d894781-b27d-43a9-b3e9-9da187e9eeda` / guntars), so the insert violates `audit_events_actor_user_id_fkey`.

## How sibling RPCs handle it

`rpc_cancel_task`, `rpc_skip_task`, `rpc_reschedule_task`, `rpc_complete_task` all pass `auth.uid()` straight into `audit_events.actor_user_id` (some via direct INSERT, some via `create_audit_event`). They work today only because the single existing caller happens to have a matching `crm.profiles` row. **The same latent bug exists in every audit insert path.** Fixing only `rpc_create_task` would leave the others fragile.

## Safest MVP — patch `crm.create_audit_event`

One centralized change: resolve `p_actor_user_id` to `NULL` when no matching active profile exists, and preserve the original auth uid inside `metadata.actor_user_id_unresolved` for traceability. FK stays intact. Audit logging stays intact. No frontend change. No fake profiles. No schema change (column already nullable, FK already `ON DELETE SET NULL`).

### Exact SQL

```sql
CREATE OR REPLACE FUNCTION crm.create_audit_event(
  p_entity_type text, p_entity_id uuid, p_action_type text, p_source_type text,
  p_event_key text, p_event_name text DEFAULT NULL, p_event_description text DEFAULT NULL,
  p_before_data jsonb DEFAULT NULL, p_after_data jsonb DEFAULT NULL,
  p_changed_fields jsonb DEFAULT NULL, p_actor_user_id uuid DEFAULT NULL,
  p_actor_role text DEFAULT NULL, p_approval_state text DEFAULT NULL,
  p_reason text DEFAULT NULL, p_source_system text DEFAULT NULL,
  p_request_id text DEFAULT NULL, p_session_id text DEFAULT NULL,
  p_ip_address inet DEFAULT NULL, p_user_agent text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'crm'
AS $$
DECLARE
  v_audit_event_id uuid;
  v_resolved_actor uuid;
  v_metadata       jsonb := COALESCE(p_metadata, '{}'::jsonb);
BEGIN
  -- Resolve actor against crm.profiles to avoid FK violations.
  -- Preserve the original auth uid in metadata for traceability.
  IF p_actor_user_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM crm.profiles WHERE id = p_actor_user_id) THEN
    v_resolved_actor := p_actor_user_id;
  ELSE
    v_resolved_actor := NULL;
    IF p_actor_user_id IS NOT NULL THEN
      v_metadata := v_metadata
        || jsonb_build_object('actor_user_id_unresolved', p_actor_user_id);
    END IF;
  END IF;

  INSERT INTO crm.audit_events (
    entity_type, entity_id, action_type, source_type,
    event_key, event_name, event_description,
    before_data, after_data, changed_fields,
    actor_user_id, actor_role, approval_state, reason,
    source_system, request_id, session_id, ip_address, user_agent, metadata
  )
  VALUES (
    p_entity_type, p_entity_id, p_action_type, p_source_type,
    p_event_key, p_event_name, p_event_description,
    p_before_data, p_after_data, p_changed_fields,
    v_resolved_actor, p_actor_role, p_approval_state, p_reason,
    p_source_system, p_request_id, p_session_id, p_ip_address, p_user_agent, v_metadata
  )
  RETURNING id INTO v_audit_event_id;

  RETURN v_audit_event_id;
END;
$$;
```

Plus the same guard in the **direct** `INSERT INTO crm.audit_events` blocks inside `rpc_cancel_task`, `rpc_skip_task`, `rpc_reschedule_task` (and any other RPC that bypasses `create_audit_event`). For each, wrap the actor with:

```sql
CASE WHEN EXISTS (SELECT 1 FROM crm.profiles WHERE id = <actor>)
     THEN <actor> ELSE NULL END
```

I'll enumerate the exact list during the build (need a second pass over `rpc_skip_task` body to confirm whether it goes through `create_audit_event` or inline).

## Why this is the safest fix

1. **FK preserved** — referential integrity intact, no constraint drop.
2. **No fake data** — never inserts placeholder `crm.profiles` rows.
3. **Audit not lost** — event still recorded, just with `actor_user_id = NULL` and original uid stashed in `metadata.actor_user_id_unresolved`.
4. **Frontend unchanged** — all changes are inside `SECURITY DEFINER` DB functions.
5. **Systemic** — centralizing the guard in `create_audit_event` (the canonical helper) immediately protects future RPCs from the same failure mode, not just `rpc_create_task`.
6. **Reversible** — once `crm.profiles` is backfilled from `auth.users`, behaviour returns to recording the real actor with zero further change.

## Out of scope (deferred)

- Backfilling `crm.profiles` from `auth.users` (proper long-term fix for actor traceability).
- Adding `assigned_user_id` picker to `TaskFormDialog`.

## Exact next Build prompt

```
Fix audit_events actor_user_id FK violation. DB only. Do not change frontend.
Do not drop or alter FK. Do not change column nullability (already nullable).
Do not insert profile rows. Do not remove audit logging.

1. Replace crm.create_audit_event with the version that resolves
   p_actor_user_id to NULL when no matching crm.profiles row exists,
   and copies the original uid into metadata.actor_user_id_unresolved.

2. In every other crm.rpc_* function that INSERTs into crm.audit_events
   directly (rpc_cancel_task, rpc_skip_task, rpc_reschedule_task, and any
   other found via: SELECT proname FROM pg_proc p JOIN pg_namespace n
   ON n.oid=p.pronamespace WHERE n.nspname='crm' AND prosrc ILIKE
   '%insert into crm.audit_events%'), wrap actor_user_id with:
     CASE WHEN EXISTS (SELECT 1 FROM crm.profiles WHERE id = <actor>)
          THEN <actor> ELSE NULL END
   Preserve all other behaviour.

Verify:
- rpc_create_task succeeds for an authenticated user with no crm.profiles row.
- audit_events row is created with actor_user_id = NULL and
  metadata->>'actor_user_id_unresolved' = the auth uid.
- rpc_complete_task / rpc_cancel_task / rpc_skip_task / rpc_reschedule_task
  still succeed for users that DO exist in crm.profiles, with actor_user_id
  populated normally.
- No FK constraint dropped.

Return:
- exact list of functions modified
- SQL applied (migration body)
- test result: successful task creation + matching audit row
```
