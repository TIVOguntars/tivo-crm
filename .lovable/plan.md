
# Phase 2 MVP — Operational Cleanup Preview (READ-ONLY)

Bring the existing Auto-call backlog down to the new 60/day cap before activating the generator's enforcement.

## Scope guarantee

The cleanup touches ONLY rows matching **all** of:

- `task_type = 'call'`
- `status = 'planned'`
- `is_auto_created = true`
- `assigned_user_id = '477b82e1-b09a-428d-9f65-32aa2ea5a551'` (BJ — the only assignee in the current pool)

Everything else (manual tasks, non-call tasks, in-progress, completed, cancelled, other assignees) is untouched.

## How the first 60 are selected (the "keepers")

Ordering inside the **callable** pool (389 rows):

1. `l.status = 'Jauns'` → DESC (Jauns first)
2. `l.created_at` → DESC (newest leads first)
3. `t.created_at` → DESC (deterministic tiebreak)

`phone_validated = true` is a hard precondition, not a sort tier — the requested "valid phones" priority is already absorbed by restricting the keeper pool to callable rows.

Given current data:
- 69 callable Jauns leads exist → **all 60 keepers will be Jauns + callable**, picking the 60 newest by `l.created_at`.
- The remaining 9 callable Jauns + 320 callable Nesasniedzams + 114 non-callable rows get cancelled.

## Counts (preview)

| Bucket | Count |
|---|---|
| Total planned Auto-call for BJ (before) | 503 |
| Keepers (first 60 callable, Jauns first, newest first) | **60** |
| Cancelled by this cleanup | **443** |
| Of those cancelled: callable but over cap | 329 |
| Of those cancelled: non-callable | 114 |

## Audit trail preserved

Each cancelled row gets:
- `status = 'cancelled'`
- `cancelled_reason = 'phase2_mvp_cap_cleanup_20260520'`
- `updated_at = now()`
- `metadata` merged with:
  ```json
  {
    "cleanup": {
      "batch": "phase2_mvp_cap_cleanup_20260520",
      "reason": "exceeded_daily_cap_60_or_non_callable",
      "previous_status": "planned",
      "cancelled_at": "<now()>"
    }
  }
  ```

Row identity (`id`), lineage (`workflow_instance_id`, `parent_task_id`, `lead_id`), original `created_at`, original `metadata.definition`, and the rule lineage all remain — only `status`, `cancelled_reason`, `updated_at`, and the additive `metadata.cleanup` sub-object change.

No DELETEs. No row drops.

## Exact SQL preview

```sql
-- ============================================================
-- 1) Snapshot the cleanup decision into a backup table.
--    Captures the keepers/cancellations BEFORE any UPDATE.
-- ============================================================
CREATE TABLE IF NOT EXISTS crm._backup_tasks_cleanup_20260520 AS
WITH base AS (
  SELECT
    t.id                AS task_id,
    t.lead_id,
    t.assigned_user_id,
    t.status            AS status_before,
    t.created_at        AS task_created_at,
    l.status            AS lead_status,
    l.created_at        AS lead_created_at,
    COALESCE(ct.phone_validated, false) AS has_valid_phone
  FROM crm.tasks t
  LEFT JOIN crm.leads    l  ON l.id  = t.lead_id
  LEFT JOIN crm.contacts ct ON ct.id = l.contact_id
  WHERE t.task_type        = 'call'
    AND t.status           = 'planned'
    AND t.is_auto_created  = true
    AND t.assigned_user_id = '477b82e1-b09a-428d-9f65-32aa2ea5a551'
),
ranked_callable AS (
  SELECT
    task_id,
    ROW_NUMBER() OVER (
      ORDER BY
        (lead_status = 'Jauns')  DESC,
        lead_created_at          DESC NULLS LAST,
        task_created_at          DESC
    ) AS keeper_rank
  FROM base
  WHERE has_valid_phone = true
)
SELECT
  b.*,
  CASE
    WHEN rc.keeper_rank IS NOT NULL AND rc.keeper_rank <= 60 THEN 'keep'
    ELSE 'cancel'
  END AS decision,
  rc.keeper_rank
FROM base b
LEFT JOIN ranked_callable rc ON rc.task_id = b.task_id;

-- ============================================================
-- 2) Cancel the non-keepers (443 rows expected).
--    Re-derives the same ranking — does NOT depend on the
--    backup table for the WHERE clause, so it is safe to
--    re-run independently. The WHERE re-applies the full
--    scope filter as a belt-and-braces guard.
-- ============================================================
WITH base AS (
  SELECT
    t.id                AS task_id,
    l.status            AS lead_status,
    l.created_at        AS lead_created_at,
    t.created_at        AS task_created_at,
    COALESCE(ct.phone_validated, false) AS has_valid_phone
  FROM crm.tasks t
  LEFT JOIN crm.leads    l  ON l.id  = t.lead_id
  LEFT JOIN crm.contacts ct ON ct.id = l.contact_id
  WHERE t.task_type        = 'call'
    AND t.status           = 'planned'
    AND t.is_auto_created  = true
    AND t.assigned_user_id = '477b82e1-b09a-428d-9f65-32aa2ea5a551'
),
keepers AS (
  SELECT task_id
  FROM (
    SELECT
      task_id,
      ROW_NUMBER() OVER (
        ORDER BY
          (lead_status = 'Jauns') DESC,
          lead_created_at         DESC NULLS LAST,
          task_created_at         DESC
      ) AS keeper_rank
    FROM base
    WHERE has_valid_phone = true
  ) r
  WHERE keeper_rank <= 60
)
UPDATE crm.tasks t
   SET status           = 'cancelled',
       cancelled_reason = 'phase2_mvp_cap_cleanup_20260520',
       updated_at       = now(),
       metadata         = COALESCE(t.metadata, '{}'::jsonb)
                          || jsonb_build_object(
                               'cleanup', jsonb_build_object(
                                 'batch',           'phase2_mvp_cap_cleanup_20260520',
                                 'reason',          'exceeded_daily_cap_60_or_non_callable',
                                 'previous_status', 'planned',
                                 'cancelled_at',    now()
                               )
                             )
 WHERE t.task_type        = 'call'
   AND t.status           = 'planned'
   AND t.is_auto_created  = true
   AND t.assigned_user_id = '477b82e1-b09a-428d-9f65-32aa2ea5a551'
   AND t.id NOT IN (SELECT task_id FROM keepers);
```

## Verification queries (run after execution)

```sql
-- A) Keepers vs cancellations from this batch
SELECT
  (SELECT COUNT(*) FROM crm.tasks
    WHERE task_type='call' AND is_auto_created=true
      AND assigned_user_id='477b82e1-b09a-428d-9f65-32aa2ea5a551'
      AND status='planned')                                   AS planned_after,
  (SELECT COUNT(*) FROM crm.tasks
    WHERE task_type='call' AND is_auto_created=true
      AND assigned_user_id='477b82e1-b09a-428d-9f65-32aa2ea5a551'
      AND status='cancelled'
      AND cancelled_reason='phase2_mvp_cap_cleanup_20260520') AS cancelled_by_cleanup;
-- expect: planned_after=60, cancelled_by_cleanup=443

-- B) Every keeper must be callable and (where possible) Jauns
SELECT
  COUNT(*) FILTER (WHERE ct.phone_validated IS TRUE)        AS keepers_callable,
  COUNT(*) FILTER (WHERE l.status='Jauns')                  AS keepers_jauns,
  COUNT(*)                                                  AS keepers_total
FROM crm.tasks t
LEFT JOIN crm.leads    l  ON l.id  = t.lead_id
LEFT JOIN crm.contacts ct ON ct.id = l.contact_id
WHERE t.task_type='call' AND t.is_auto_created=true
  AND t.assigned_user_id='477b82e1-b09a-428d-9f65-32aa2ea5a551'
  AND t.status='planned';
-- expect: keepers_callable=60, keepers_jauns=60, keepers_total=60

-- C) Scope guard: nothing outside the filter changed
SELECT COUNT(*) AS out_of_scope_touched
FROM crm.tasks
WHERE cancelled_reason='phase2_mvp_cap_cleanup_20260520'
  AND (task_type <> 'call'
       OR is_auto_created <> true
       OR assigned_user_id <> '477b82e1-b09a-428d-9f65-32aa2ea5a551');
-- expect: 0

-- D) Reconcile against the snapshot
SELECT decision, COUNT(*) FROM crm._backup_tasks_cleanup_20260520 GROUP BY 1;
-- expect: keep=60, cancel=443
```

## What this preview does NOT do

- No DELETE.
- No change to `crm.tasks` schema.
- No change to `rpc_create_task`, `rpc_generate_daily_planned_tasks`, cron, settings, or workflow engine.
- No effect on manual tasks, non-call tasks, other assignees, in-progress/completed/already-cancelled rows.
- No external API calls. No notifications.

## Rollback

```sql
UPDATE crm.tasks t
   SET status     = 'planned',
       cancelled_reason = NULL,
       updated_at = now(),
       metadata   = (t.metadata - 'cleanup')
 WHERE t.cancelled_reason = 'phase2_mvp_cap_cleanup_20260520';
```

Awaiting approval to execute (backup + cancellation UPDATE) in a single migration.
