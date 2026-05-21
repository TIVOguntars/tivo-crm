
# Phase 2.1 — PPV-quota Cleanup + Generator Fix (PREVIEW ONLY)

Two-part preview. **Nothing is executed.** Awaiting approval.

- Part A: cancel the current bad BJ Auto-call backlog (120 → 40).
- Part B: replace `crm.rpc_generate_daily_planned_tasks()` so the cap comes from `crm.settings → outreach.daily_quota` (per-PPV, not per-assignee, not hardcoded).

Source-of-truth settings (verified read-only):

| setting_key | value |
|---|---|
| `outreach.daily_quota` | `{ per_ppv_user: { UC:10, MO:10 }, role: "Mārketings" }` |
| `outreach.eligible_statuses` | `["Jauns","Nesasniedzams"]` |
| `contact.limits` | `{ calls:4, emails:4, sms_whatsapp:2, on_limit_status:"Nesasniedzams", automation_continues:true }` |
| `ppv.auto_reschedule` | `{ no_answer_days:2, business_days_only:true }` |
| `automation.weekend_policy` | `{ human_tasks_weekends_allowed:false, ... }` |
| `human_task.definitions` | 2 active call rules: `outreach_call_jauns` (Jauns, order 100), `outreach_recovery_call_nesasniedzams` (Nesasniedzams, order 200) |

BJ user_id used throughout: `477b82e1-b09a-428d-9f65-32aa2ea5a551`.

================================================================

## PART A — Cleanup of current planned Auto-call tasks for BJ

### Scope guarantee (all five must match)

- `task_type = 'call'`
- `status = 'planned'`
- `is_auto_created = true`
- `assigned_user_id = BJ`
- `metadata->>'source' = 'daily_planned_task_generator'`

Everything else is untouched (manual tasks, non-call tasks, other assignees, non-generator auto tasks, in-progress/completed/already-cancelled rows).

### Keep / cancel rules

A row is a **keeper** only if all of:

1. `leads.ppv_user_id` resolves to a `crm.profiles.user_code` that is a key in `outreach.daily_quota.per_ppv_user` (today: `UC` or `MO`).
2. `contacts.phone_validated = true` AND `contacts.phone_e164 IS NOT NULL`.
3. `contacts.full_name IS NOT NULL AND btrim(contacts.full_name) <> ''`.
4. `leads.status` is in `outreach.eligible_statuses.values`.
5. For `lead.status = 'Nesasniedzams'`, the recovery cooldown must already be satisfied — i.e. there exists a completed call task with `outcome_code = 'no_answer'` AND its `completed_at` is at least `ppv.auto_reschedule.no_answer_days` business days before today (`Europe/Riga`). If no such completed-no-answer row exists, the recovery is considered **not valid** and the task is cancelled with reason `invalid_recovery_state`.
6. Within each `(ppv_user_code, generated_for_date)` partition, ranked by:
   - `lead.status = 'Jauns'` DESC
   - `lead.created_at` DESC
   - `task.created_at` DESC
   
   keep the top `outreach.daily_quota.per_ppv_user[ppv_code]` rows.

Every cancelled row is `UPDATE`-d (no DELETE) with `status='cancelled'`, `cancelled_reason='phase2_1_ppv_quota_cleanup'`, and `metadata.cleanup` merged in:

```json
{
  "cleanup": {
    "batch": "phase2_1_ppv_quota_cleanup",
    "reason": "<no_ppv | ppv_not_in_quota | invalid_phone | blank_name | ineligible_status | invalid_recovery_state | exceeded_ppv_daily_cap>",
    "previous_status": "planned",
    "cancelled_at": "<now()>"
  }
}
```

### Cleanup SQL preview

```sql
-- 1) Snapshot decisions BEFORE any update
CREATE TABLE IF NOT EXISTS crm._backup_tasks_phase2_1_ppv_cleanup_20260521 AS
WITH cfg AS (
  SELECT
    (SELECT value_json FROM crm.settings WHERE setting_key='outreach.daily_quota'      AND is_active) AS quota,
    (SELECT value_json FROM crm.settings WHERE setting_key='outreach.eligible_statuses' AND is_active) AS elig,
    (SELECT value_json FROM crm.settings WHERE setting_key='ppv.auto_reschedule'        AND is_active) AS resch
),
base AS (
  SELECT
    t.id                                       AS task_id,
    t.lead_id,
    t.assigned_user_id,
    t.status                                   AS status_before,
    t.created_at                               AS task_created_at,
    (t.metadata->>'generated_for_date')::date  AS generated_for_date,
    l.status                                   AS lead_status,
    l.created_at                               AS lead_created_at,
    l.ppv_user_id,
    p.user_code                                AS ppv_code,
    c.full_name,
    COALESCE(c.phone_validated, false)         AS phone_validated,
    c.phone_e164
  FROM crm.tasks t
  LEFT JOIN crm.leads    l ON l.id = t.lead_id
  LEFT JOIN crm.contacts c ON c.id = l.contact_id
  LEFT JOIN crm.profiles p ON p.id = l.ppv_user_id
  WHERE t.task_type        = 'call'
    AND t.status           = 'planned'
    AND t.is_auto_created  = true
    AND t.assigned_user_id = '477b82e1-b09a-428d-9f65-32aa2ea5a551'
    AND t.metadata->>'source' = 'daily_planned_task_generator'
),
enriched AS (
  SELECT
    b.*,
    cfg.quota,
    cfg.elig,
    cfg.resch,
    -- recovery cooldown evidence (only relevant for Nesasniedzams)
    (
      SELECT MAX(t2.completed_at)
      FROM crm.tasks t2
      WHERE t2.lead_id      = b.lead_id
        AND t2.task_type    = 'call'
        AND t2.status       = 'completed'
        AND t2.outcome_code = 'no_answer'
    ) AS last_no_answer_at
  FROM base b CROSS JOIN cfg
),
classified AS (
  SELECT
    e.*,
    CASE
      WHEN e.ppv_user_id IS NULL                                              THEN 'no_ppv'
      WHEN NOT (e.quota->'per_ppv_user' ? e.ppv_code)                         THEN 'ppv_not_in_quota'
      WHEN NOT e.phone_validated OR e.phone_e164 IS NULL                      THEN 'invalid_phone'
      WHEN e.full_name IS NULL OR btrim(e.full_name) = ''                     THEN 'blank_name'
      WHEN NOT (e.elig->'values' ? e.lead_status)                             THEN 'ineligible_status'
      WHEN e.lead_status = 'Nesasniedzams'
           AND (
             e.last_no_answer_at IS NULL
             OR e.last_no_answer_at
                > ((now() AT TIME ZONE 'Europe/Riga')::date
                   - ((e.resch->>'no_answer_days')::int) * interval '1 day')
                  AT TIME ZONE 'Europe/Riga'
           )                                                                  THEN 'invalid_recovery_state'
      ELSE NULL
    END AS disqualifier
  FROM enriched e
),
ranked AS (
  SELECT
    c.*,
    CASE WHEN c.disqualifier IS NULL THEN
      ROW_NUMBER() OVER (
        PARTITION BY c.ppv_code, c.generated_for_date
        ORDER BY (c.lead_status = 'Jauns') DESC,
                 c.lead_created_at DESC NULLS LAST,
                 c.task_created_at DESC
      )
    END AS keeper_rank,
    CASE WHEN c.disqualifier IS NULL
         THEN NULLIF((c.quota->'per_ppv_user'->>c.ppv_code),'')::int
    END AS ppv_cap
  FROM classified c
)
SELECT
  r.*,
  CASE
    WHEN r.disqualifier IS NOT NULL                       THEN 'cancel'
    WHEN r.keeper_rank <= r.ppv_cap                       THEN 'keep'
    ELSE                                                       'cancel'
  END AS decision,
  CASE
    WHEN r.disqualifier IS NOT NULL                       THEN r.disqualifier
    WHEN r.keeper_rank <= r.ppv_cap                       THEN NULL
    ELSE                                                       'exceeded_ppv_daily_cap'
  END AS cancel_reason
FROM ranked r;

-- 2) Apply cancellations (re-derives the same ranking; safe to re-run)
WITH cfg AS (
  SELECT
    (SELECT value_json FROM crm.settings WHERE setting_key='outreach.daily_quota'      AND is_active) AS quota,
    (SELECT value_json FROM crm.settings WHERE setting_key='outreach.eligible_statuses' AND is_active) AS elig,
    (SELECT value_json FROM crm.settings WHERE setting_key='ppv.auto_reschedule'        AND is_active) AS resch
),
base AS ( /* identical to backup CTE */
  SELECT t.id AS task_id, t.lead_id, t.created_at AS task_created_at,
         (t.metadata->>'generated_for_date')::date AS generated_for_date,
         l.status AS lead_status, l.created_at AS lead_created_at,
         l.ppv_user_id, p.user_code AS ppv_code,
         c.full_name, COALESCE(c.phone_validated,false) AS phone_validated, c.phone_e164
  FROM crm.tasks t
  LEFT JOIN crm.leads    l ON l.id=t.lead_id
  LEFT JOIN crm.contacts c ON c.id=l.contact_id
  LEFT JOIN crm.profiles p ON p.id=l.ppv_user_id
  WHERE t.task_type='call' AND t.status='planned' AND t.is_auto_created=true
    AND t.assigned_user_id='477b82e1-b09a-428d-9f65-32aa2ea5a551'
    AND t.metadata->>'source'='daily_planned_task_generator'
),
classified AS ( /* same disqualifier logic + last_no_answer_at */
  SELECT b.*,
         (SELECT MAX(t2.completed_at) FROM crm.tasks t2
           WHERE t2.lead_id=b.lead_id AND t2.task_type='call'
             AND t2.status='completed' AND t2.outcome_code='no_answer') AS last_no_answer_at,
         cfg.quota, cfg.elig, cfg.resch
  FROM base b CROSS JOIN cfg
),
with_reason AS (
  SELECT c.*,
    CASE
      WHEN c.ppv_user_id IS NULL                                THEN 'no_ppv'
      WHEN NOT (c.quota->'per_ppv_user' ? c.ppv_code)           THEN 'ppv_not_in_quota'
      WHEN NOT c.phone_validated OR c.phone_e164 IS NULL        THEN 'invalid_phone'
      WHEN c.full_name IS NULL OR btrim(c.full_name)=''         THEN 'blank_name'
      WHEN NOT (c.elig->'values' ? c.lead_status)               THEN 'ineligible_status'
      WHEN c.lead_status='Nesasniedzams'
           AND (c.last_no_answer_at IS NULL
                OR c.last_no_answer_at >
                   ((now() AT TIME ZONE 'Europe/Riga')::date
                    - ((c.resch->>'no_answer_days')::int) * interval '1 day')
                   AT TIME ZONE 'Europe/Riga')                  THEN 'invalid_recovery_state'
      ELSE NULL
    END AS disqualifier
  FROM classified c
),
ranked AS (
  SELECT w.*,
         CASE WHEN w.disqualifier IS NULL THEN
           ROW_NUMBER() OVER (
             PARTITION BY w.ppv_code, w.generated_for_date
             ORDER BY (w.lead_status='Jauns') DESC,
                      w.lead_created_at DESC NULLS LAST,
                      w.task_created_at DESC)
         END AS keeper_rank,
         CASE WHEN w.disqualifier IS NULL
              THEN NULLIF((w.quota->'per_ppv_user'->>w.ppv_code),'')::int
         END AS ppv_cap
  FROM with_reason w
),
cancel_set AS (
  SELECT task_id,
         COALESCE(disqualifier,
                  CASE WHEN keeper_rank <= ppv_cap THEN NULL ELSE 'exceeded_ppv_daily_cap' END
         ) AS reason
  FROM ranked
  WHERE COALESCE(disqualifier,
                 CASE WHEN keeper_rank <= ppv_cap THEN 'keep' ELSE 'cancel' END
        ) <> 'keep'
)
UPDATE crm.tasks t
   SET status           = 'cancelled',
       cancelled_reason = 'phase2_1_ppv_quota_cleanup',
       updated_at       = now(),
       metadata         = COALESCE(t.metadata,'{}'::jsonb)
                          || jsonb_build_object(
                               'cleanup', jsonb_build_object(
                                 'batch',           'phase2_1_ppv_quota_cleanup',
                                 'reason',          cs.reason,
                                 'previous_status', 'planned',
                                 'cancelled_at',    now()
                               ))
  FROM cancel_set cs
 WHERE t.id = cs.task_id
   AND t.task_type='call' AND t.status='planned' AND t.is_auto_created=true
   AND t.assigned_user_id='477b82e1-b09a-428d-9f65-32aa2ea5a551'
   AND t.metadata->>'source'='daily_planned_task_generator';
```

### Expected Part A result

Current planned BJ Auto-call tasks (verified):

| generated_for_date | UC | MO | NULL PPV | total |
|---|---|---|---|---|
| 2026-05-20 (yesterday keepers) | 14 | 10 | 36 | 60 |
| 2026-05-21 (today's cron run)  | 36 | 22 |  2 | 60 |
| **Total now** | **50** | **32** | **38** | **120** |

After Part A:

| Bucket | After |
|---|---|
| gfd=2026-05-20 UC keepers | 10 |
| gfd=2026-05-20 MO keepers | 10 |
| gfd=2026-05-20 NULL PPV   | 0 (cancelled `no_ppv`) |
| gfd=2026-05-21 UC keepers | 10 |
| gfd=2026-05-21 MO keepers | 10 |
| gfd=2026-05-21 NULL PPV   | 0 (cancelled `no_ppv`) |
| **Planned BJ Auto calls** | **40** |
| Cancelled by this batch  | **80** (≈ 38 `no_ppv` + 0 `invalid_phone`/`blank_name`/`ineligible` + ≈42 `exceeded_ppv_daily_cap`; possibly some `invalid_recovery_state` if Nesasniedzams rows lack a completed-no-answer history) |

The exact `invalid_recovery_state` count cannot be predicted without running the recovery-cooldown query, but the backup table will show the per-reason breakdown for verification before any DML reaches `crm.tasks`.

### Rollback

```sql
UPDATE crm.tasks
   SET status='planned', cancelled_reason=NULL, updated_at=now(),
       metadata = (metadata - 'cleanup')
 WHERE cancelled_reason='phase2_1_ppv_quota_cleanup';
```

================================================================

## PART B — Corrected generator (`crm.rpc_generate_daily_planned_tasks`)

### What changes vs. the version deployed in `20260520163103`

| Concern | Before | After |
|---|---|---|
| Daily cap | Hardcoded `c_call_cap_per_assignee_per_day := 60` | Read from `outreach.daily_quota.per_ppv_user[ppv_code]` |
| Cap dimension | per `assigned_user_id` | per `(ppv_code, generated_for_date)` |
| NULL `ppv_user_id` | allowed | **skipped** → `skipped_no_ppv++` |
| PPV not in quota keys | allowed | **skipped** → `skipped_ppv_not_in_quota++` |
| Blank `contacts.full_name` | allowed | **skipped** → `skipped_blank_name++` |
| Eligible statuses | implicit (rule status) | also enforced against `outreach.eligible_statuses.values` |
| Nesasniedzams recovery | cooldown only by completed-no-answer | unchanged logic, but if there is NO completed-no-answer at all, **skipped** → `skipped_invalid_recovery_state++` (no blind recovery) |
| Counter seed | from all today's BJ planned auto-call tasks | from today's planned auto-call tasks **filtered by `metadata->>'source'='daily_planned_task_generator'`**, grouped by `(ppv_code, generated_for_date)` |
| Metadata written | `source, definition, generated_for_date, priority_bucket, phone_gate_passed` | adds `rule_key`, `ppv_code`, `daily_quota_source='outreach.daily_quota'`, `quota_limit`, `quota_dimension='ppv_user'` |
| Return JSON | per-assignee counters | per-PPV counters + new skip keys |
| Skip aggregate persistence | none | one row written to `crm.audit_events` (see §audit) |

### Lead selection (per rule)

```text
candidates :=
  SELECT l.id, l.status, l.created_at, l.ppv_user_id,
         p.user_code AS ppv_code,
         c.full_name, c.phone_e164, c.phone_validated
    FROM crm.leads l
    JOIN crm.profiles p ON p.id = l.ppv_user_id           -- joins exclude no_ppv
    LEFT JOIN crm.contacts c ON c.id = l.contact_id
   WHERE l.status = v_rule.status
     AND (v_eligible_statuses ? l.status)
     AND (v_quota->'per_ppv_user' ? p.user_code)
   ORDER BY (l.status='Jauns') DESC,
            l.created_at DESC;
```

For each candidate:
- skip `no_ppv` (joined out above; counted via separate pre-scan on leads).
- skip `ppv_not_in_quota` (filtered above; counted via pre-scan).
- skip `invalid_phone` if `phone_validated <> true OR phone_e164 IS NULL`.
- skip `blank_name` if `full_name IS NULL OR btrim(full_name)=''`.
- skip `existing` if an open `planned|in_progress|overdue` task with same `metadata->'definition'->>'rule_key'` exists.
- skip `stop_rule`, `contact_limit`, `cooldown` (unchanged from current generator).
- if `lead.status='Nesasniedzams'`, require at least one prior completed `call + outcome_code='no_answer'`; else skip `invalid_recovery_state`.
- if counters[(ppv_code, generated_for_date)] ≥ `outreach.daily_quota.per_ppv_user[ppv_code]`, skip `daily_cap_ppv`.
- create task; increment counter.

### Daily-reset semantics

Counter seed is filtered by `(metadata->>'generated_for_date')::date = v_generated_date AND metadata->>'source'='daily_planned_task_generator'`. **Yesterday's planned rows do not consume today's quota.** Each Riga date is independent.

### Priority bucket

- `Jauns` → `high`
- `Nesasniedzams` → `medium`

Written to `metadata.priority_bucket` and used as the `priority` argument to `rpc_create_task`.

### Metadata written per task

```json
{
  "source": "daily_planned_task_generator",
  "rule_key": "outreach_call_jauns",
  "definition": { /* the full rule jsonb */ },
  "generated_for_date": "2026-05-22",
  "ppv_code": "UC",
  "priority_bucket": "high",
  "daily_quota_source": "outreach.daily_quota",
  "quota_limit": 10,
  "quota_dimension": "ppv_user",
  "phone_gate_passed": true
}
```

### Audit / skip-counter persistence

**Existing `crm.audit_events` is suitable — no new table needed.** Insert exactly one row at the end of each generator run:

```sql
INSERT INTO crm.audit_events (
  entity_type, entity_id, action_type, source_type,
  event_key, event_name, source_system, metadata, created_at
) VALUES (
  'system', NULL, 'run', 'automation',
  'daily_planned_task_generator_run',
  'Daily planned task generator run',
  'rpc_generate_daily_planned_tasks',
  jsonb_build_object(
    'generated_for_date', v_generated_date,
    'started_at', v_started_at, 'finished_at', now(),
    'created', v_created,
    'scanned', v_scanned,
    'skipped_no_ppv', v_skipped_no_ppv,
    'skipped_ppv_not_in_quota', v_skipped_ppv_not_in_quota,
    'skipped_no_valid_phone', v_skipped_no_valid_phone,
    'skipped_blank_name', v_skipped_blank_name,
    'skipped_daily_cap_ppv', v_skipped_daily_cap_ppv,
    'skipped_existing', v_skipped_existing,
    'skipped_invalid_recovery_state', v_skipped_invalid_recovery_state,
    'skipped_cooldown', v_skipped_cooldown,
    'skipped_contact_limit', v_skipped_contact_limit,
    'skipped_stop_rule', v_skipped_stop_rule,
    'cap_per_ppv', v_quota->'per_ppv_user',
    'cap_counts_final', v_cap_counts
  ),
  now()
);
```

Verified columns exist (`entity_type`, `entity_id` nullable use, `action_type`, `source_type`, `event_key`, `event_name`, `source_system`, `metadata`, `created_at`) — schema change not required.

### Skip-counter visibility for admins

Operators in `/uzdevumi` continue to see only the tasks that were created — no per-skip clutter. Admin / diagnostics surface (proposal, not implemented in this phase):

1. New admin page `/admin/diagnostics/generator` (route only, not built here) reading from `crm.audit_events`:
   ```sql
   SELECT (metadata->>'generated_for_date')::date AS gfd,
          created_at AS ran_at,
          (metadata->>'created')::int AS created,
          metadata->'cap_counts_final' AS counters,
          (metadata->>'skipped_no_ppv')::int             AS skipped_no_ppv,
          (metadata->>'skipped_ppv_not_in_quota')::int   AS skipped_ppv_not_in_quota,
          (metadata->>'skipped_no_valid_phone')::int     AS skipped_no_valid_phone,
          (metadata->>'skipped_blank_name')::int         AS skipped_blank_name,
          (metadata->>'skipped_daily_cap_ppv')::int      AS skipped_daily_cap_ppv,
          (metadata->>'skipped_invalid_recovery_state')::int AS skipped_invalid_recovery_state
     FROM crm.audit_events
    WHERE event_key='daily_planned_task_generator_run'
    ORDER BY created_at DESC
    LIMIT 30;
   ```
2. Until that UI exists, the same query can be run ad-hoc by admins.

================================================================

## Expected next cron run (with new generator + after Part A)

Assuming Part A executed first and Part B deployed before next 00:00 Riga tick:

| Check | Expected |
|---|---|
| Planned BJ Auto-call for `gfd=tomorrow` UC | **≤ 10** |
| Planned BJ Auto-call for `gfd=tomorrow` MO | **≤ 10** |
| Planned BJ Auto-call for `gfd=tomorrow` NULL PPV | **0** |
| Tasks with `phone_validated=false` or `phone_e164 IS NULL` | **0** |
| Tasks where `contacts.full_name` blank | **0** |
| Tasks where `lead.status NOT IN ('Jauns','Nesasniedzams')` | **0** |
| Nesasniedzams tasks without prior completed-no-answer | **0** |
| `crm.audit_events` rows with `event_key='daily_planned_task_generator_run'` | **+1 per cron tick** |

================================================================

## Out-of-scope (explicitly NOT changed)

- `crm.rpc_create_task` (signature & body untouched)
- `crm.tasks` schema (no DDL — audit lands in existing `crm.audit_events`)
- cron schedule
- any `crm.settings` row
- views (`crm.next_action_queue*`, `/uzdevumi`, `/darba-rinda`, etc.)
- workflow engine, workflow definitions, workflow start rules
- SMS / email / WhatsApp behaviour
- manual tasks, non-call tasks, non-BJ assignees, non-generator auto tasks

================================================================

## What's still needed before execution

Approval to:
1. Run **Part A** cleanup (backup + UPDATE).
2. Deploy **Part B** generator replacement.
3. Allow the generator to write one row per run to `crm.audit_events` (no schema change, just inserts).

No code, migration, or generator run will happen until you approve. The legacy "Phase 2 MVP cleanup" preview is superseded by this document.

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
