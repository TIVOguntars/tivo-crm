## Mērķis

Izveidot `crm.rpc_cancel_task` — RPC, kas atceļ vēl nefinalizētu task ar obligātu iemeslu, ieraksta activity + task_relation + audit_event. Bez DB izmaiņām šajā solī.

## Scope

- Tikai `crm` schema
- Bez frontend, cron, triggers, workflow advancement, automatic next-task generation
- Bez citām DB izmaiņām

## Funkcijas paraksts

`crm.rpc_cancel_task(p_task_id uuid, p_cancelled_reason text, p_cancelled_by_user_id uuid DEFAULT auth.uid(), p_metadata jsonb DEFAULT '{}'::jsonb) RETURNS jsonb`

- `SECURITY DEFINER`, `SET search_path = crm, public`
- `REVOKE ALL FROM PUBLIC`, `GRANT EXECUTE TO authenticated, service_role`

## Uzvedība

1. Validē: `TASK_ID_REQUIRED`, `CANCELLED_REASON_REQUIRED` (NULL vai tukšs pēc btrim).
2. Ielādē `crm.tasks` rindu → `TASK_NOT_FOUND` ja nav.
3. Ja `status IN ('completed','cancelled','skipped')` → `TASK_ALREADY_FINALIZED`.
4. `UPDATE crm.tasks` → `status='cancelled'`, `cancelled_reason`, `updated_at=now()`, metadata merge (`cancelled_at`, `cancelled_by_user_id`, `cancelled_reason`).
5. `INSERT INTO crm.activities` — type `note`, summary `Task cancelled`, metadata ar `event_type='cancelled'`, `reason`, `previous_status`.
6. `INSERT INTO crm.task_relations` — `task → activity`, `relation_type='follows'`, metadata `event_type='cancelled'`.
7. `INSERT INTO crm.audit_events` — `event_key='task_cancelled'`, before/after ar `status`, `cancelled_reason`; `changed_fields=['status','cancelled_reason']`.
8. Return: `{ success, task_id, activity_id, status: 'cancelled', cancelled_reason }`.

## SQL preview

```sql
CREATE OR REPLACE FUNCTION crm.rpc_cancel_task(
  p_task_id uuid,
  p_cancelled_reason text,
  p_cancelled_by_user_id uuid DEFAULT auth.uid(),
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = crm, public
AS $$
DECLARE
  v_task crm.tasks%ROWTYPE;
  v_activity_id uuid;
BEGIN
  IF p_task_id IS NULL THEN
    RAISE EXCEPTION 'TASK_ID_REQUIRED';
  END IF;
  IF p_cancelled_reason IS NULL OR btrim(p_cancelled_reason) = '' THEN
    RAISE EXCEPTION 'CANCELLED_REASON_REQUIRED';
  END IF;

  SELECT *
  INTO v_task
  FROM crm.tasks
  WHERE id = p_task_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TASK_NOT_FOUND';
  END IF;

  IF v_task.status IN ('completed', 'cancelled', 'skipped') THEN
    RAISE EXCEPTION 'TASK_ALREADY_FINALIZED';
  END IF;

  UPDATE crm.tasks
  SET
    status = 'cancelled',
    cancelled_reason = p_cancelled_reason,
    updated_at = now(),
    metadata = COALESCE(metadata, '{}'::jsonb)
      || jsonb_build_object(
        'cancelled_at', now(),
        'cancelled_by_user_id', p_cancelled_by_user_id,
        'cancelled_reason', p_cancelled_reason
      )
  WHERE id = p_task_id;

  INSERT INTO crm.activities (
    lead_id,
    person_id,
    object_id,
    task_id,
    activity_type,
    activity_at,
    performed_by_user_id,
    summary,
    outcome_code,
    communication_basis,
    metadata
  )
  VALUES (
    v_task.lead_id,
    v_task.person_id,
    v_task.object_id,
    v_task.id,
    'note',
    now(),
    p_cancelled_by_user_id,
    'Task cancelled',
    NULL,
    NULL,
    COALESCE(p_metadata, '{}'::jsonb)
      || jsonb_build_object(
        'event_type', 'cancelled',
        'reason', p_cancelled_reason,
        'previous_status', v_task.status
      )
  )
  RETURNING id INTO v_activity_id;

  INSERT INTO crm.task_relations (
    lead_id,
    from_kind,
    from_id,
    to_kind,
    to_id,
    relation_type,
    metadata,
    created_by
  )
  VALUES (
    v_task.lead_id,
    'task',
    v_task.id,
    'activity',
    v_activity_id,
    'follows',
    jsonb_build_object('event_type', 'cancelled'),
    p_cancelled_by_user_id
  );

  INSERT INTO crm.audit_events (
    entity_type,
    entity_id,
    action_type,
    source_type,
    event_key,
    event_name,
    before_data,
    after_data,
    changed_fields,
    actor_user_id,
    reason,
    metadata
  )
  VALUES (
    'task',
    v_task.id,
    'update',
    'manual',
    'task_cancelled',
    'Task cancelled',
    jsonb_build_object(
      'status', v_task.status,
      'cancelled_reason', v_task.cancelled_reason
    ),
    jsonb_build_object(
      'status', 'cancelled',
      'cancelled_reason', p_cancelled_reason
    ),
    jsonb_build_array('status', 'cancelled_reason'),
    p_cancelled_by_user_id,
    p_cancelled_reason,
    COALESCE(p_metadata, '{}'::jsonb)
  );

  RETURN jsonb_build_object(
    'success', true,
    'task_id', v_task.id,
    'activity_id', v_activity_id,
    'status', 'cancelled',
    'cancelled_reason', p_cancelled_reason
  );
END;
$$;

REVOKE ALL ON FUNCTION crm.rpc_cancel_task(
  uuid,
  text,
  uuid,
  jsonb
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION crm.rpc_cancel_task(
  uuid,
  text,
  uuid,
  jsonb
) TO authenticated, service_role;
```

## Nākamais solis

Pēc apstiprināšanas — izveidot migration un izpildīt DB, tad parādīt verification.
