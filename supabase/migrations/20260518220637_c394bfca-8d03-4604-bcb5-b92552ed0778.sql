-- Guard audit_events.actor_user_id against missing crm.profiles rows.
-- Centralizes the fix so every caller (rpc_create_task, rpc_complete_task,
-- rpc_cancel_task, rpc_skip_task, rpc_reschedule_task, bulk_*, email queue,
-- and the create_audit_event helper) is protected without rewriting each RPC.
-- FK stays intact; column already nullable; original uid preserved in metadata.

CREATE OR REPLACE FUNCTION crm.audit_events_guard_actor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'crm'
AS $$
BEGIN
  IF NEW.actor_user_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM crm.profiles WHERE id = NEW.actor_user_id) THEN
    NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb)
      || jsonb_build_object('actor_user_id_unresolved', NEW.actor_user_id);
    NEW.actor_user_id := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_events_guard_actor_trg ON crm.audit_events;
CREATE TRIGGER audit_events_guard_actor_trg
BEFORE INSERT ON crm.audit_events
FOR EACH ROW
EXECUTE FUNCTION crm.audit_events_guard_actor();