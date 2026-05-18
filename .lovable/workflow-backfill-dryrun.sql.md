# Historical Workflow Backfill — DRY RUN (read-only preview)

No inserts. No queue rows. No workflow_instances. No planner changes. Pure `SELECT`.

## Source columns (corrected)

`crm.v_lead_workflow_progress` exposes only:

- `lead_id`
- `last_completed_template_key`
- `last_sent_at`

It does NOT expose `template_key`, `step_order`, `workflow_key`, `status`, or `completed_at`.
The query below derives `workflow_key` from `crm.lead_tags` and `last_completed_step_order` by
joining `crm.workflow_steps` on `template_key`.

## Assumptions about workflow shape

Two workflows, identified by `crm.workflow_definitions.workflow_key`:

- `getestimate` — templates in order: `email_getestimate_1`, `email_getestimate_2`, `email_getestimate_3`, `email_getestimate_4`, `email_transition_to_sketch`, `email_sketch_1`, `email_sketch_2`, `email_sketch_3`, `email_sketch_4`
- `sketch` — templates in order: `email_sketch_1`, `email_sketch_2`, `email_sketch_3`, `email_sketch_4`

Continuation = every template whose `step_order` is strictly greater than the lead's last completed template's `step_order`, within the resolved workflow. `getestimate_1`, `getestimate_4`, `transition_to_sketch`, `sketch_2`, etc. all fall out of this single rule, so the cases listed in the request are covered without hard-coding each branch.

`delay_minutes` is taken from `crm.workflow_steps.delay_minutes` of the next step (cumulative cadence stays the planner's job — this preview only reports per-step values).

## Preview query

```sql
WITH
-- 1. Resolve each lead's active workflow from tags.
lead_workflow AS (
    SELECT DISTINCT ON (lt.lead_id)
           lt.lead_id,
           CASE t.slug
                WHEN 'getestimate' THEN 'getestimate'
                WHEN 'sketch'      THEN 'sketch'
           END AS workflow_key
    FROM crm.lead_tags lt
    JOIN crm.tags t ON t.id = lt.tag_id
    WHERE t.slug IN ('getestimate', 'sketch')
    ORDER BY lt.lead_id,
             -- prefer getestimate over sketch when both present
             CASE t.slug WHEN 'getestimate' THEN 0 ELSE 1 END
),

-- 2. Exclude leads tagged 'hot'.
hot_leads AS (
    SELECT lt.lead_id
    FROM crm.lead_tags lt
    JOIN crm.tags t ON t.id = lt.tag_id
    WHERE t.slug = 'hot'
),

-- 3. Exclude leads with an active workflow_instance.
active_instances AS (
    SELECT DISTINCT wi.lead_id
    FROM crm.workflow_instances wi
    WHERE wi.status IN ('active', 'pending', 'running')
),

-- 4. Exclude leads with anything queued / sending in the email queue.
busy_queue AS (
    SELECT DISTINCT q.lead_id
    FROM crm.communication_queue q
    WHERE q.channel = 'email'
      AND q.status IN ('queued', 'sending')
),

-- 5. Progress per lead from the (limited) progress view.
progress AS (
    SELECT p.lead_id,
           p.last_completed_template_key,
           p.last_sent_at
    FROM crm.v_lead_workflow_progress p
),

-- 6. Eligible leads = has workflow, not hot, no active instance, no busy queue,
--    and last completed template is NOT email_sketch_4 (fully completed).
--    Resolve last_completed_step_order by joining workflow_steps on template_key
--    inside the lead's workflow_definition.
eligible AS (
    SELECT lw.lead_id,
           lw.workflow_key,
           wd.id                              AS workflow_id,
           pr.last_completed_template_key,
           pr.last_sent_at,
           last_ws.step_order                 AS last_completed_step_order
    FROM lead_workflow lw
    JOIN crm.workflow_definitions wd
      ON wd.workflow_key = lw.workflow_key
    LEFT JOIN progress         pr ON pr.lead_id = lw.lead_id
    LEFT JOIN crm.workflow_steps last_ws
      ON last_ws.workflow_id  = wd.id
     AND last_ws.template_key = pr.last_completed_template_key
    LEFT JOIN hot_leads        h  ON h.lead_id  = lw.lead_id
    LEFT JOIN active_instances ai ON ai.lead_id = lw.lead_id
    LEFT JOIN busy_queue       bq ON bq.lead_id = lw.lead_id
    WHERE h.lead_id  IS NULL
      AND ai.lead_id IS NULL
      AND bq.lead_id IS NULL
      AND COALESCE(pr.last_completed_template_key, '') <> 'email_sketch_4'
),

-- 7. Future steps = every workflow_step strictly after the last completed step,
--    in the lead's resolved workflow. Leads that have not started yet
--    (last_completed_step_order IS NULL) get the whole workflow from step 1.
future_steps AS (
    SELECT e.lead_id,
           e.workflow_key,
           e.last_completed_template_key,
           e.last_sent_at,
           e.last_completed_step_order,
           ws.template_key  AS next_template_key,
           ws.step_order,
           ws.delay_minutes
    FROM eligible e
    JOIN crm.workflow_steps ws
      ON ws.workflow_id = e.workflow_id
     AND ws.step_order  > COALESCE(e.last_completed_step_order, 0)
)

-- Main preview output
SELECT *
FROM future_steps
ORDER BY lead_id, step_order;
```

## Summary counts (run separately, same CTE chain)

```sql
WITH future_steps AS ( /* same as above */ )
-- total eligible leads
SELECT 'total_eligible_leads' AS metric,
       COUNT(DISTINCT lead_id)::text AS value
FROM future_steps
UNION ALL
SELECT 'total_future_queue_rows',
       COUNT(*)::text
FROM future_steps
UNION ALL
SELECT 'by_next_template_key:' || next_template_key,
       COUNT(*)::text
FROM future_steps
GROUP BY next_template_key
ORDER BY metric;
```

## Output columns

| column | source |
|---|---|
| `lead_id` | eligible lead |
| `workflow_key` | `getestimate` or `sketch` |
| `last_completed_template_key` | from `crm.v_lead_workflow_progress` (NULL if none) |
| `last_sent_at` | from `crm.v_lead_workflow_progress` (NULL if none) |
| `last_completed_step_order` | from `crm.workflow_steps` joined on `last_completed_template_key` |
| `next_template_key` | from `crm.workflow_steps.template_key` |
| `step_order` | from `crm.workflow_steps.step_order` |
| `delay_minutes` | from `crm.workflow_steps.delay_minutes` |

## Continuation rules — coverage check

The single rule "`ws.step_order > last_completed.step_order` within the resolved workflow" yields:

- `getestimate_1` done → `getestimate_2,3,4`, `transition_to_sketch`, `sketch_1..4` ✓
- `getestimate_4` done → `transition_to_sketch`, `sketch_1..4` ✓
- `transition_to_sketch` done → `sketch_1..4` ✓
- `sketch_2` done → `sketch_3`, `sketch_4` ✓
- `sketch_4` done → excluded as fully completed ✓
- no progress yet → entire resolved workflow from step 1 ✓

## Explicitly NOT done

- No `INSERT` into `crm.communication_queue`.
- No rows added to `crm.workflow_instances`.
- No call to `crm.generate_email_plan_for_lead` or any planner RPC.
- No changes to dispatcher, reconciler, cron, retry, Resend, pg_net.
- No schema changes; no new view created (snippet is a one-shot SELECT — wrap as `CREATE OR REPLACE VIEW crm.v_workflow_backfill_dryrun AS ...` only on explicit approval).
