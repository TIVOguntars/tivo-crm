# Backfill Email Allocator — SQL Preview (v2, corrected)

Scope unchanged: allocator + planner metadata + a one-line metadata stamp in `queue_item_reschedule`. No changes to dispatcher, reconciler, pg_net, Resend, retry, cron, workflow_steps, or queue status lifecycle.

## 1. `crm.rebalance_backfill_email_schedule`

```sql
CREATE OR REPLACE FUNCTION crm.rebalance_backfill_email_schedule(
    p_start_date date DEFAULT current_date
)
RETURNS TABLE(
    queue_id        uuid,
    old_scheduled   timestamptz,
    new_scheduled   timestamptz,
    slot_date       date
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = crm, public, extensions
AS $$
DECLARE
    v_tz            constant text     := 'Europe/Riga';
    v_window_start  constant time     := time '08:00';
    v_window_end    constant time     := time '18:00';
    v_spacing       constant interval := interval '2 minutes';
    v_daily_cap     constant int      := 80;

    v_current_date     date := p_start_date;
    v_slot_local       timestamp;
    v_slot_utc         timestamptz;
    v_allocated_today  int  := 0;
    r                  record;
BEGIN
    v_slot_local := (v_current_date::timestamp + v_window_start);

    FOR r IN
        SELECT q.id,
               q.scheduled_for,
               q.created_at,
               COALESCE((q.metadata->>'priority_score')::numeric, 0) AS prio
        FROM crm.communication_queue q
        WHERE q.status = 'queued'
          AND q.channel = 'email'
          AND q.metadata->>'daily_bucket' = 'existing'
          AND q.scheduled_for <= now()
          AND COALESCE((q.metadata->>'allocator_locked')::boolean, false) = false
        ORDER BY prio DESC,
                 q.scheduled_for ASC NULLS LAST,
                 q.created_at ASC
        FOR UPDATE SKIP LOCKED
    LOOP
        IF v_allocated_today >= v_daily_cap THEN
            v_current_date    := v_current_date + 1;
            v_slot_local      := (v_current_date::timestamp + v_window_start);
            v_allocated_today := 0;
        END IF;

        IF v_slot_local::time >= v_window_end THEN
            v_current_date    := v_current_date + 1;
            v_slot_local      := (v_current_date::timestamp + v_window_start);
            v_allocated_today := 0;
        END IF;

        v_slot_utc := (v_slot_local AT TIME ZONE v_tz);

        UPDATE crm.communication_queue
           SET scheduled_for = v_slot_utc,
               metadata = COALESCE(metadata, '{}'::jsonb)
                          || jsonb_build_object(
                                'rebalanced_at',       now(),
                                'rebalanced_for_date', v_current_date::text,
                                'allocator',           'backfill_scheduler_v1'
                             )
         WHERE id = r.id;

        queue_id      := r.id;
        old_scheduled := r.scheduled_for;
        new_scheduled := v_slot_utc;
        slot_date     := v_current_date;
        RETURN NEXT;

        v_allocated_today := v_allocated_today + 1;
        v_slot_local      := v_slot_local + v_spacing;
    END LOOP;

    RETURN;
END;
$$;
```

Eligibility now requires: `status='queued'` AND `channel='email'` AND `daily_bucket='existing'` AND **overdue** (`scheduled_for <= now()`) AND **not manually locked** (`allocator_locked` is false/absent).

## 2. `crm.queue_item_reschedule` — add allocator lock stamp

Surgical change: only the `metadata` update gains `allocator_locked: true`. All status checks, permission checks, audit events, and return shape stay identical.

```sql
-- inside the existing UPDATE in crm.queue_item_reschedule(...)
UPDATE crm.communication_queue
   SET scheduled_for = p_new_scheduled_for,
       metadata = COALESCE(metadata, '{}'::jsonb)
                  || jsonb_build_object(
                        'rescheduled_at',    now(),
                        'rescheduled_by',    auth.uid(),
                        'allocator_locked',  true
                     )
 WHERE id = p_queue_id
   AND status IN ('queued', 'blocked');
```

No other `queue_item_*` RPC is touched.

## 3. `crm.generate_email_plan_for_lead` — metadata tagging only

Backfill mode is now strictly explicit. Age-based detection removed.

```sql
v_is_backfill := (p_reason IN ('backfill', 'historical_import'));

v_priority_score := 0;  -- MVP; real scoring engine wired later

IF v_is_backfill THEN
    v_queue_metadata := jsonb_build_object(
        'queue_type',     'backfill',
        'daily_bucket',   'existing',
        'priority_score', v_priority_score
    );
ELSE
    v_queue_metadata := jsonb_build_object(
        'queue_type',     'new_lead',
        'daily_bucket',   'new',
        'priority_score', v_priority_score
    );
END IF;
```

Each existing `INSERT INTO crm.communication_queue (...)` keeps every other column and only sets `metadata := COALESCE(<existing_metadata>, '{}'::jsonb) || v_queue_metadata`. Scheduling, recipient resolution, template lookup, blocked_reason, audit events — unchanged.

## Explicitly NOT changed

- `crm.dispatch_email_queue_once`
- `crm.reconcile_email_send_responses`
- pg_net / Resend / retry / sending logic
- cron schedules
- `crm.workflow_steps`
- queue status lifecycle (queued/sending/sent/failed/blocked/cancelled)
- new-lead scheduling cadence
- other `queue_item_*` RPCs

## Verification (after apply, manual)

```sql
-- candidates the allocator would touch
SELECT id, scheduled_for, metadata->>'priority_score' AS prio,
       metadata->>'allocator_locked' AS locked
FROM crm.communication_queue
WHERE status='queued' AND channel='email'
  AND metadata->>'daily_bucket'='existing'
  AND scheduled_for <= now()
  AND COALESCE((metadata->>'allocator_locked')::boolean, false) = false
ORDER BY (metadata->>'priority_score')::numeric DESC NULLS LAST,
         scheduled_for ASC, created_at ASC;

-- run allocator starting tomorrow
SELECT * FROM crm.rebalance_backfill_email_schedule(current_date + 1);
```

No execution, no cron, no dispatch performed by this preview.
