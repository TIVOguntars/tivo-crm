# Frontend migration to `crm.leads_list_display_v3`

The v3 backend contract is confirmed live (verified columns include `lead_number`, `external_id`, `ppv_user_code`, `ppv_name`, `task_assigned_user_code`, `task_assigned_name`, `priority_score`, `priority_stars`, `priority_label`, `priority_breakdown`, `queue_bucket`, `queue_bucket_label`, `operational_bucket`, `needs_attention`, `communication_state`, `communication_label`, `has_unread_reply`). The contract does **not** expose `lead_id`, `contact_id`, `object_id`, or any UUIDs.

This is a large multi-file migration (16 files touched). To prevent another regression like the last two loops, I want to phase it. No backend changes.

## Critical open question (must answer before phase 1)

The v3 view has **no UUID at all** — the natural key is `lead_number` (text). But the rest of the app still depends on UUIDs:

- Route `/lead/$leadId` expects a UUID.
- `rpc_update_task`, `rpc_complete_task`, `rpc_create_task`, bulk patch RPCs, manual activity dialog, `LeadEditPanel`, timeline fetches — all take `p_lead_id uuid`.
- Selection state, dedupe keys, optimistic patches all key off `lead_id`.

We cannot remove UUIDs from the wire while RPCs still require them, and you said do not change backend. So the realistic interpretation is:

- **UI surface** never shows UUIDs and never derives display from them.
- **Internal identifiers** keep using `lead_number` as the public key for navigation/selection where possible; UUIDs stay only inside RPC payloads, fetched on demand (e.g. by `lead_number` → `leads` lookup) and never rendered.

If instead you want me to also switch routes to `/lead/$leadNumber` and rewrite every `rpc_*` call to take `p_lead_number`, that is a backend change (RPC signature) and falls outside this loop.

I'll proceed assuming the first interpretation. Stop me here if you meant the second.

## Phase 1 — `/leadi` list (highest visibility)

`src/routes/leadi.tsx`:
- Drop `useCrmView("v_next_action_queue", …)` and `useCrmView("profiles", …)` (responsible/ppv mapping). Read everything from `leads_list_display_v3`.
- Drop `useUserMap` usage. Render `ppv_user_code` as the PPV chip (initials) with `ppv_name` in tooltip. Render `task_assigned_user_code` for Atbildīgais; `"-"` when null.
- Replace `Lead.lead_id` with `Lead.lead_number` as the row key, selection key, navigation target (still passes lead UUID to the lead detail route via a one-shot lookup — see open question above).
- Remove `responsible`, `ppv_user_id`, `ppv` (mapped name) — keep only what v3 returns.
- Remove `isAutoActionType` / `responsibleResolver` import.
- Wire Uzdevums column to `action_label` + `next_action`; "-" when absent.
- Wire Komunikācija to `communication_state` / `communication_label` / `has_unread_reply` directly (already present, just stop the local recompute).
- Keep priority OUT of /leadi (per previous loop) unless you confirm now you want stars rendered here too — earlier you removed them; v3 exposes them but rendering is your call.

`src/lib/responsibleResolver.ts` → delete (no other consumers after phase 1 ships).

## Phase 2 — `/uzdevumi`, `/queue`, `/darba-rinda`

`src/routes/uzdevumi.tsx`, `src/routes/queue.tsx`, `src/routes/darba-rinda.tsx`:
- Switch row source to `leads_list_display_v3` joined per task by `lead_number`, OR keep task source but enrich via the same view.
- Render `task_assigned_user_code` as initials, `task_assigned_name` in tooltip — drop `useUserMap`.
- Render queue chips from `queue_bucket_label` / `operational_bucket`; sort/group by `queue_bucket`. Frontend does zero bucket math.
- `needs_attention` drives the attention badge.
- Task priority chip continues to come from `crm.tasks.priority` (`task_priority`) — unchanged.

## Phase 3 — Lead detail + modals

`src/routes/lead.$leadId.tsx`, `src/components/lead/LeadEditPanel.tsx`, `CompleteTaskModal`, `CompleteActionModal`, `TaskFormDialog`, `WorkflowPlanCard`, `WorkflowChainStrip`, `BulkActionsBar`, `ienakosas-zinas.tsx`, `ReachabilityBreakdown`, `UnreachableBreakdown`:
- Replace any display of `ppv_user_id` / `task_assigned_user_id` / responsible UUID with `*_user_code` (initials) + `*_name` (tooltip) from v3.
- Header card: pull PPV, owner, communication, priority block (`priority_stars`, `priority_label`, `priority_breakdown` tooltip), queue badge directly from v3.
- Stop importing `useUserMap` in display paths. The hook stays only for `UserPicker` (assignment editor) because that *writes* `assigned_user_id` and needs the id↔name list.
- `src/server/analytics.ts`: remove any leftover `lead_priority_scoring_v2` reference; leave RPC plumbing intact.

## Phase 4 — Cleanup pass

- Delete unused helpers: `isAutoActionType`, `resolveResponsible`, `lib/responsibleResolver.ts`, any `priorityColors` left dead.
- Remove `useUserMap` import sites that no longer use it.
- `rg "ppv_user_id|task_assigned_user_id|next_task_id|contact_id|object_id|v_next_action_queue|useUserMap" src` must return only `UserPicker`-adjacent matches (assignment editing) and RPC payload sites.

## Verification per phase

- Build succeeds (`npm run build`).
- Grep contract: phase N file set free of forbidden symbols.
- Visual smoke on `/leadi`, `/uzdevumi`, `/queue`, `/lead/:id` in preview.

## Ask

1. Confirm the UUID interpretation above (keep UUIDs internal for RPC calls; never display them).
2. Confirm you want me to start with **Phase 1 only** in this loop, then stop and let you sanity-check `/leadi` before phases 2–4.
