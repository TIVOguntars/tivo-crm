
-- =============================================================================
-- Reduce future audit payload bloat from crm.communications UPDATE events.
--
-- Background:
--   crm.audit_events had grown to ~3.5 GB, of which ~3.2 GB came from
--   136k+ UPDATE events on crm.communications. Each event stored
--   to_jsonb(OLD) and to_jsonb(NEW) whole, dragging the full provider
--   webhook envelope (`raw_payload`, ~394 kB avg) and the full email
--   body HTML (`body`, ~48 kB avg) into BOTH before_data and after_data
--   every time — even when only a status timestamp changed.
--
-- This migration strips `raw_payload` and `body` from before_data /
-- after_data on UPDATE events only. The live values remain in
-- crm.communications.raw_payload and crm.communications.body — this
-- only affects what we COPY into the audit log going forward.
--
-- Kept intact:
--   * changed_fields (still computed from the FULL old/new rows, so a
--     change to body or raw_payload is still recorded as a changed key)
--   * metadata, status fields, timestamps, provider IDs in audit payload
--   * INSERT and DELETE events keep full snapshots
--   * entity_versions behavior (UPDATE already skips snapshotting)
--   * All other audit triggers (lead/task/object/activity)
-- =============================================================================

CREATE OR REPLACE FUNCTION crm.handle_communication_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'crm'
AS $function$
declare
  v_audit_event_id uuid;
  v_changed_fields jsonb;
  v_old_full       jsonb;
  v_new_full       jsonb;
  v_old_slim       jsonb;
  v_new_slim       jsonb;
begin
  if tg_op = 'INSERT' then
    -- INSERT: keep the full snapshot. Volume is low and a complete
    -- baseline is useful for forensics / replay.
    v_audit_event_id := crm.create_audit_event(
      p_entity_type := 'communication',
      p_entity_id   := new.id,
      p_action_type := 'create',
      p_source_type := 'system',
      p_event_key   := 'communication_created',
      p_event_name  := 'Communication created',
      p_after_data  := to_jsonb(new),
      p_metadata    := jsonb_build_object(
        'trigger_operation',  tg_op,
        'table_name',         tg_table_name,
        'versioning_policy',  'create_snapshot_only'
      )
    );

    perform crm.create_entity_version(
      p_entity_type     := 'communication',
      p_entity_id       := new.id,
      p_version_action  := 'create',
      p_snapshot_data   := to_jsonb(new),
      p_source_type     := 'system',
      p_audit_event_id  := v_audit_event_id,
      p_metadata        := jsonb_build_object('versioning_policy', 'create_snapshot_only')
    );

    return new;

  elsif tg_op = 'UPDATE' then
    -- UPDATE: strip heavy keys from the stored before/after payloads to
    -- prevent audit-log bloat from webhook status churn. changed_fields
    -- is still computed from the FULL rows so a real change to body or
    -- raw_payload IS still recorded as a changed key (the value just is
    -- not duplicated into the audit log).
    v_old_full := to_jsonb(old);
    v_new_full := to_jsonb(new);

    v_changed_fields := crm.jsonb_changed_fields(v_old_full, v_new_full);

    -- Excluded keys (live values remain in crm.communications):
    --   raw_payload : full provider webhook envelope, ~394 kB avg
    --   body        : full email HTML body, ~48 kB avg
    v_old_slim := v_old_full - 'raw_payload' - 'body';
    v_new_slim := v_new_full - 'raw_payload' - 'body';

    v_audit_event_id := crm.create_audit_event(
      p_entity_type    := 'communication',
      p_entity_id      := new.id,
      p_action_type    := 'update',
      p_source_type    := 'system',
      p_event_key      := 'communication_updated',
      p_event_name     := 'Communication updated',
      p_before_data    := v_old_slim,
      p_after_data     := v_new_slim,
      p_changed_fields := v_changed_fields,
      p_metadata       := jsonb_build_object(
        'trigger_operation',  tg_op,
        'table_name',         tg_table_name,
        'versioning_policy',  'no_entity_version_on_update',
        'reason',             'prevent_communication_status_update_version_spam',
        'payload_policy',     'exclude_raw_payload_and_body_on_update',
        'excluded_keys',      jsonb_build_array('raw_payload', 'body')
      )
    );

    return new;

  elsif tg_op = 'DELETE' then
    -- DELETE: keep the full snapshot for forensics. Volume is low.
    v_audit_event_id := crm.create_audit_event(
      p_entity_type := 'communication',
      p_entity_id   := old.id,
      p_action_type := 'delete',
      p_source_type := 'system',
      p_event_key   := 'communication_deleted',
      p_event_name  := 'Communication deleted',
      p_before_data := to_jsonb(old),
      p_metadata    := jsonb_build_object(
        'trigger_operation',  tg_op,
        'table_name',         tg_table_name,
        'versioning_policy',  'audit_only_on_delete'
      )
    );

    return old;
  end if;

  return null;
end;
$function$;

COMMENT ON FUNCTION crm.handle_communication_audit() IS
  'Audit trigger for crm.communications. On UPDATE, excludes raw_payload and body from before_data/after_data to prevent audit-log bloat (~24 kB -> ~1 kB per event). changed_fields is still computed from full rows. INSERT/DELETE keep full snapshots.';
