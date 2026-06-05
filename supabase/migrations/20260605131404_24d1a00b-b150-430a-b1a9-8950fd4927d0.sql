-- Enable RLS on CRM reference/lookup tables (no policies added).
ALTER TABLE crm.activity_types               ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.communication_channels       ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.communication_directions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.communication_event_types    ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.communication_providers      ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.lead_priority_recalc_queue   ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.lead_priority_scores         ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.outcome_codes                ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.status_normalization_rules   ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.task_statuses                ENABLE ROW LEVEL SECURITY;

-- Pin search_path on the 12 reviewed CRM functions.
ALTER FUNCTION crm.apply_lead_priority_scheduler_v1()                            SET search_path = crm, public, extensions;
ALTER FUNCTION crm.execute_pending_contact_merges(limit_count integer)          SET search_path = crm, public, extensions;
ALTER FUNCTION crm.preview_pending_contact_merges(limit_count integer)          SET search_path = crm, public, extensions;
ALTER FUNCTION crm.queue_lead_priority_refresh_v1(p_lead_id uuid, p_reason text) SET search_path = crm, public, extensions;
ALTER FUNCTION crm.refresh_lead_priorities_batch_v2(p_limit integer)            SET search_path = crm, public, extensions;
ALTER FUNCTION crm.rollback_contact_merge(audit_id uuid)                        SET search_path = crm, public, extensions;
ALTER FUNCTION crm.trg_queue_priority_from_activities_v1()                      SET search_path = crm, public, extensions;
ALTER FUNCTION crm.trg_queue_priority_from_contacts_v1()                        SET search_path = crm, public, extensions;
ALTER FUNCTION crm.trg_queue_priority_from_lead_objects_v1()                    SET search_path = crm, public, extensions;
ALTER FUNCTION crm.trg_queue_priority_from_lead_tags_v1()                       SET search_path = crm, public, extensions;
ALTER FUNCTION crm.trg_queue_priority_from_leads_v1()                           SET search_path = crm, public, extensions;
ALTER FUNCTION crm.trg_queue_priority_from_objects_v1()                         SET search_path = crm, public, extensions;