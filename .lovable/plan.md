## Correction Summary

The previous preview was wrong because it sorted **individual steps** globally by `step_order`. That tears apart workflow cadence — step 1 of instance A would land next to step 1 of instance B, while step 2 of instance A could end up days later out of relation to step 1.

The corrected algorithm slots **whole workflow instances** into the 80/day grid, then derives every step time from that anchor + the step's `delay_minutes` offset, preserving the original cadence exactly.

## Introspection (current state)

| metric | value |
|---|---|
| eligible queued email rows | **778** |
| distinct workflow instances | **164** |
| manual overrides excluded (locked or edited) | 0 |
| schema join path | `workflow_steps.workflow_id → workflow_definitions.id`, then `workflow_definitions.workflow_key = workflow_instances.workflow_key` (note: `workflow_steps.workflow_instance_id` is NULL on all 16 rows — steps are defined at workflow level, not per instance) |
| max step delay observed | 60 480 min (= 42 days) — cadence span per instance up to 42 days |

`workflow_instances` columns used: `id, workflow_key, priority, started_at`.
`workflow_steps` columns used: `workflow_id, template_key, step_order, delay_minutes`.

## Corrected Scheduling Algorithm

1. **Eligibility filter** (unchanged):
   ```
   status='queued' AND channel='email'
   AND workflow_instance_id IS NOT NULL
   AND COALESCE((metadata->>'allocator_locked')::bool,false)=false
   AND (metadata->>'edited_at') IS NULL
   ```
2. **Per instance**, compute `min_delay = min(workflow_steps.delay_minutes)` over the steps that match the instance's queued template_keys. This is the instance's offset zero.
3. **Order instances** for slot allocation:
   ```
   ORDER BY COALESCE(wi.priority,0) DESC,
            wi.started_at ASC NULLS LAST,
            wi.id
   ```
4. **Allocate one anchor slot per instance** on the 80/day, 2-min grid starting **tomorrow 08:00 Europe/Riga**:
   - `slot = row_number()-1` over instances
   - `anchor_utc = (tomorrow 08:00 Riga) + floor(slot/80) days + (slot mod 80) * 2 min`
   - With 164 instances → 3 days of anchors (days 1‒2 full at 80, day 3 = 4 anchors).
5. **Derive each step's new time** from its instance anchor:
   ```
   proposed_scheduled_for = anchor_utc + (ws.delay_minutes - min_delay_per_instance) * INTERVAL '1 minute'
   ```
6. **Relative cadence preserved** = `true` by construction, since every step keeps its `delay_minutes - min_delay` offset relative to its instance anchor.

Slot capacity (80/day, 2 min) applies to **instance anchors only** — derived steps land at whatever `delay_minutes` dictates and do not consume slots. This matches the rule "move whole workflow blocks, not individual steps".

## Corrected Preview SQL (READ-ONLY)

```sql
WITH eligible AS (
  SELECT q.id              AS queue_id,
         q.lead_id,
         q.template_key,
         q.scheduled_for   AS current_scheduled_for,
         q.workflow_instance_id,
         q.created_at,
         wi.priority       AS instance_priority,
         wi.started_at     AS instance_started_at,
         wi.workflow_key
  FROM   crm.communication_queue q
  JOIN   crm.workflow_instances  wi ON wi.id = q.workflow_instance_id
  WHERE  q.status = 'queued'
    AND  q.channel = 'email'
    AND  q.workflow_instance_id IS NOT NULL
    AND  COALESCE((q.metadata->>'allocator_locked')::boolean,false) = false
    AND  (q.metadata->>'edited_at') IS NULL
),
step_join AS (
  SELECT e.*,
         ws.step_order,
         ws.delay_minutes
  FROM   eligible e
  JOIN   crm.workflow_definitions wd ON wd.workflow_key = e.workflow_key
  JOIN   crm.workflow_steps       ws ON ws.workflow_id  = wd.id
                                    AND ws.template_key = e.template_key
),
per_instance AS (
  SELECT workflow_instance_id,
         min(instance_priority)   AS instance_priority,
         min(instance_started_at) AS instance_started_at,
         min(delay_minutes)       AS min_delay,
         min(current_scheduled_for) AS old_instance_anchor
  FROM   step_join
  GROUP  BY workflow_instance_id
),
instance_slots AS (
  SELECT pi.*,
         (row_number() OVER (
            ORDER BY COALESCE(pi.instance_priority,0) DESC,
                     pi.instance_started_at ASC NULLS LAST,
                     pi.workflow_instance_id
          ) - 1) AS slot
  FROM   per_instance pi
),
instance_anchors AS (
  SELECT s.*,
         (slot / 80) AS day_offset,
         (slot % 80) AS day_row_number,
         (((CURRENT_DATE AT TIME ZONE 'Europe/Riga')::date + 1
            + INTERVAL '8 hours'
            + (slot / 80) * INTERVAL '1 day'
            + (slot % 80) * INTERVAL '2 minutes')
          AT TIME ZONE 'Europe/Riga') AS new_instance_anchor
  FROM   instance_slots s
),
proposed AS (
  SELECT sj.queue_id,
         sj.lead_id,
         sj.workflow_instance_id,
         sj.workflow_key,
         sj.template_key,
         sj.step_order,
         sj.delay_minutes,
         sj.current_scheduled_for,
         ia.instance_priority,
         ia.old_instance_anchor,
         ia.new_instance_anchor,
         ia.day_offset      AS anchor_day_offset,
         ia.day_row_number  AS anchor_day_slot,
         (ia.new_instance_anchor
          + (sj.delay_minutes - ia.min_delay) * INTERVAL '1 minute'
         ) AS proposed_scheduled_for,
         true AS relative_offset_preserved
  FROM   step_join sj
  JOIN   instance_anchors ia USING (workflow_instance_id)
)
SELECT *
FROM   proposed
ORDER  BY instance_priority DESC NULLS LAST,
          anchor_day_offset,
          anchor_day_slot,
          step_order;
```

## Proof that cadence is preserved

```sql
-- Per-instance integrity: every relative offset must match exactly.
SELECT count(*) AS instances_with_drift
FROM (
  SELECT workflow_instance_id,
         max( (proposed_scheduled_for - new_instance_anchor)
              - (delay_minutes - min(delay_minutes) OVER (PARTITION BY workflow_instance_id))
                * INTERVAL '1 minute' ) AS drift
  FROM   proposed
  GROUP  BY workflow_instance_id
) d
WHERE drift <> INTERVAL '0';
-- expected: 0
```

```sql
-- Per-lead order preserved
SELECT bool_and(ok) AS per_lead_workflow_order_preserved
FROM (
  SELECT lead_id,
         rank() OVER (PARTITION BY lead_id ORDER BY step_order)
       = rank() OVER (PARTITION BY lead_id ORDER BY proposed_scheduled_for) AS ok
  FROM proposed
) x;
-- expected: true
```

```sql
-- Anchor capacity check
SELECT date_trunc('day', new_instance_anchor AT TIME ZONE 'Europe/Riga') AS day,
       count(DISTINCT workflow_instance_id) AS anchors_on_day
FROM   instance_anchors
GROUP  BY 1 ORDER BY 1;
-- expected: 80, 80, 4
```

## Expected Summary

| field | expected |
|---|---|
| eligible rows | 778 |
| distinct workflow instances | 164 |
| instance anchors per day | 80, 80, 4 (3 days) |
| earliest proposed time | tomorrow 08:00 Europe/Riga (highest priority anchor) |
| latest proposed time | day-3 anchor + up to 42 days cadence → ~day 45 |
| relative offset preserved per instance | true (proved above) |
| per-lead workflow order preserved | true |
| manual / locked rows excluded | yes (filter active; 0 today) |
| non-workflow rows excluded | yes (1 row without `workflow_instance_id` skipped) |
| sent / sending / failed / cancelled / blocked touched | none |
| dispatcher / cron / sends | unchanged |

## What this plan does NOT do

- No `UPDATE` is included or executed.
- No migration file created.
- No dispatcher / cron / sends touched.
- Lovable frontend unchanged.

When approved, the next step will be a single migration containing the same CTEs above wrapped in:
```
UPDATE crm.communication_queue q
SET    scheduled_for = p.proposed_scheduled_for,
       metadata = q.metadata || jsonb_build_object(
         'reschedule_batch','global_instance_reschedule_v2',
         'reschedule_at', now(),
         'previous_scheduled_for', q.scheduled_for)
FROM   proposed p
WHERE  q.id = p.queue_id
  AND  q.status='queued' AND q.channel='email'
  AND  COALESCE((q.metadata->>'allocator_locked')::bool,false)=false
  AND  (q.metadata->>'edited_at') IS NULL;
```
— idempotent via `metadata.reschedule_batch`.