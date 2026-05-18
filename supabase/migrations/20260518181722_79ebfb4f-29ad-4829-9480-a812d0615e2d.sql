-- F2 BUILD: bridge layer no crm.tasks uz frontend display views.
-- Append-only kolonnas. Nemaina esošo kolonnu secību.

BEGIN;

-- 1. Bridge view: aktīvais task uz vienu lead
CREATE OR REPLACE VIEW crm.v_lead_active_task AS
SELECT DISTINCT ON (t.lead_id)
    t.lead_id,
    t.id              AS task_id,
    t.task_type,
    t.due_at,
    t.assigned_user_id,
    t.priority,
    t.status
FROM crm.tasks t
WHERE t.status IN ('planned', 'in_progress')
ORDER BY
    t.lead_id,
    (t.due_at IS NULL),
    t.due_at ASC,
    t.created_at ASC;

REVOKE ALL ON crm.v_lead_active_task FROM PUBLIC;
GRANT SELECT ON crm.v_lead_active_task TO authenticated, service_role;

-- 2. Paplašināt next_action_queue_display_enriched (append-only)
CREATE OR REPLACE VIEW crm.next_action_queue_display_enriched AS
WITH q AS (
    SELECT d.id,
        d.created_at,
        l.id AS lead_id,
        l.status AS crm_status,
        d.full_name,
        d.legacy_lead_status,
        d.ppv_name,
        d.ppv_email,
        d.ppv_phone,
        d.country,
        d.tags,
        d.nakama_darbiba,
        d.atbildigais,
        d.termins,
        d.automatizacija,
        d.automatizacijas_datums,
        d.action_owner_type,
        d.action_owner_label,
        d.action_type,
        d.action_label,
        d.due_at,
        d.lead_priority_score,
        d.sort_priority,
        d.priority_label,
        d.action_source,
        d.queue_bucket,
        d.queue_bucket_label,
        l.contact_id,
        c.full_name AS contact_full_name,
        c.email_normalized,
        c.phone_e164,
        c.phone_validated,
        c.phone_line_type,
        cs.communication_count,
        cs.last_communication_at,
        cs.last_inbound_at,
        cs.last_outbound_at,
        cs.last_reply_at,
        cs.reply_count,
        cs.click_count,
        cs.has_unread_reply,
        cs.communication_state,
        cs.communication_label,
        at.task_id    AS active_task_id,
        at.task_type  AS active_task_type,
        at.due_at     AS active_task_due_at
    FROM crm.next_action_queue_display d
    JOIN crm.leads l ON l.external_id = d.lead_id::text
    LEFT JOIN crm.contacts c ON c.id = l.contact_id
    LEFT JOIN crm.lead_communication_summary cs ON cs.lead_id = l.id
    LEFT JOIN crm.v_lead_active_task at ON at.lead_id = l.id
), fixed_due_dates AS (
    SELECT q.id,
        q.created_at,
        q.lead_id,
        q.crm_status,
        q.full_name,
        q.legacy_lead_status,
        q.ppv_name,
        q.ppv_email,
        q.ppv_phone,
        q.country,
        q.tags,
        q.nakama_darbiba,
        q.atbildigais,
        q.termins,
        q.automatizacija,
        q.automatizacijas_datums,
        q.action_owner_type,
        q.action_owner_label,
        q.action_type,
        q.action_label,
        q.due_at,
        q.lead_priority_score,
        q.sort_priority,
        q.priority_label,
        q.action_source,
        q.queue_bucket,
        q.queue_bucket_label,
        q.contact_id,
        q.contact_full_name,
        q.email_normalized,
        q.phone_e164,
        q.phone_validated,
        q.phone_line_type,
        q.communication_count,
        q.last_communication_at,
        q.last_inbound_at,
        q.last_outbound_at,
        q.last_reply_at,
        q.reply_count,
        q.click_count,
        q.has_unread_reply,
        q.communication_state,
        q.communication_label,
        q.active_task_id,
        q.active_task_type,
        q.active_task_due_at,
        CASE
            WHEN crm.is_terminal_status(q.crm_status) OR crm.is_terminal_status(q.legacy_lead_status) THEN NULL::timestamptz
            WHEN q.due_at IS NOT NULL THEN q.due_at
            WHEN q.action_owner_type = 'system' THEN (date_trunc('day', timezone('Europe/Riga', now())) + interval '09:00:00')::timestamptz
            WHEN q.action_label = 'Pārdošana' THEN (date_trunc('day', timezone('Europe/Riga', now())) + interval '1 day' + interval '09:00:00')::timestamptz
            WHEN q.action_label = 'Gaidu projektu' THEN (date_trunc('day', timezone('Europe/Riga', now())) + interval '7 days' + interval '09:00:00')::timestamptz
            WHEN q.action_label = 'Apvienot dublikātu' THEN (date_trunc('day', timezone('Europe/Riga', now())) + interval '09:00:00')::timestamptz
            ELSE (date_trunc('day', timezone('Europe/Riga', now())) + interval '1 day' + interval '09:00:00')::timestamptz
        END AS effective_due_at
    FROM q
)
SELECT id,
    created_at,
    lead_id,
    full_name,
    legacy_lead_status,
    ppv_name,
    ppv_email,
    ppv_phone,
    country,
    tags,
    nakama_darbiba,
    atbildigais,
    termins,
    automatizacija,
    automatizacijas_datums,
    action_owner_type,
    action_owner_label,
    action_type,
    CASE
        WHEN crm.is_terminal_status(crm_status) OR crm.is_terminal_status(legacy_lead_status) THEN NULL::text
        ELSE action_label
    END AS action_label,
    due_at,
    lead_priority_score,
    sort_priority,
    priority_label,
    action_source,
    CASE
        WHEN crm.is_terminal_status(crm_status) OR crm.is_terminal_status(legacy_lead_status) THEN 'terminal'::text
        ELSE queue_bucket
    END AS queue_bucket,
    CASE
        WHEN crm.is_terminal_status(crm_status) OR crm.is_terminal_status(legacy_lead_status) THEN NULL::text
        ELSE queue_bucket_label
    END AS queue_bucket_label,
    effective_due_at,
    CASE
        WHEN crm.is_terminal_status(crm_status) THEN crm_status
        WHEN crm.is_terminal_status(legacy_lead_status) THEN legacy_lead_status
        WHEN legacy_lead_status = ANY (ARRAY['Jauns','Nesasniedzams','Piesaistīšana','Kvalificēts']) THEN legacy_lead_status
        WHEN action_label = ANY (ARRAY['Pārdošana','Piedāvājums']) THEN 'Piesaistīšana'::text
        WHEN action_label = ANY (ARRAY['Tāmēšana','Skice apjomi']) THEN 'Kvalificēts'::text
        ELSE 'Jauns'::text
    END AS lead_status_label,
    CASE
        WHEN crm.is_terminal_status(crm_status) OR crm.is_terminal_status(legacy_lead_status) THEN 99
        WHEN legacy_lead_status = 'Jauns' THEN 1
        WHEN legacy_lead_status = 'Nesasniedzams' THEN 2
        WHEN legacy_lead_status = 'Piesaistīšana' THEN 3
        WHEN legacy_lead_status = 'Kvalificēts' THEN 4
        WHEN action_label = ANY (ARRAY['Pārdošana','Piedāvājums']) THEN 3
        WHEN action_label = ANY (ARRAY['Tāmēšana','Skice apjomi']) THEN 4
        ELSE 1
    END AS lead_status_sort,
    COALESCE(NULLIF(contact_full_name,''), NULLIF(full_name,''), NULLIF(phone_e164,''), NULLIF(email_normalized,''), 'Neidentificēts leads') AS display_name,
    contact_full_name,
    email_normalized,
    phone_e164,
    phone_validated,
    phone_line_type,
    COALESCE(communication_count, 0::bigint) AS communication_count,
    last_communication_at,
    last_inbound_at,
    last_outbound_at,
    last_reply_at,
    COALESCE(reply_count, 0::bigint) AS reply_count,
    COALESCE(click_count, 0::bigint) AS click_count,
    COALESCE(has_unread_reply, false) AS has_unread_reply,
    COALESCE(communication_state, 'no_contact') AS communication_state,
    COALESCE(communication_label, 'Nav kontakta') AS communication_label,
    active_task_id,
    active_task_type,
    active_task_due_at
FROM fixed_due_dates;

-- 3. Paplašināt leads_list_display (append-only)
CREATE OR REPLACE VIEW crm.leads_list_display AS
SELECT l.id AS lead_id,
    l.external_id,
    l.status,
    l.source,
    l.contact_id,
    COALESCE(NULLIF(c.full_name,''), NULLIF(c.email_normalized,''), NULLIF(c.phone_e164,''), 'Neidentificēts leads') AS display_name,
    c.full_name AS contact_full_name,
    c.email_normalized,
    c.phone_e164,
    c.phone_validated,
    c.phone_line_type,
    q.country,
    q.tags,
    l.owner_user_id,
    l.ppv_user_id,
    l.created_at,
    l.updated_at,
    COALESCE(rc.email_outbound_count, 0) AS email_outbound_count,
    COALESCE(rc.email_inbound_count, 0)  AS email_inbound_count,
    COALESCE(rc.call_outbound_count, 0)  AS call_outbound_count,
    COALESCE(rc.call_inbound_count, 0)   AS call_inbound_count,
    COALESCE(rc.chat_outbound_count, 0)  AS chat_outbound_count,
    COALESCE(rc.chat_inbound_count, 0)   AS chat_inbound_count,
    q.ppv_name,
    q.action_owner_label,
    q.action_label,
    q.effective_due_at,
    q.queue_bucket,
    q.queue_bucket_label,
    q.communication_count,
    q.last_communication_at,
    q.last_inbound_at,
    q.last_outbound_at,
    q.last_reply_at,
    q.reply_count,
    q.click_count,
    q.has_unread_reply,
    q.communication_state,
    q.communication_label,
    at.task_id   AS active_task_id,
    at.task_type AS active_task_type,
    at.due_at    AS active_task_due_at
FROM crm.leads l
LEFT JOIN crm.contacts c ON c.id = l.contact_id
LEFT JOIN crm.lead_row_communication_counts rc ON rc.lead_id = l.id
LEFT JOIN crm.next_action_queue_display_enriched q ON q.lead_id = l.id
LEFT JOIN crm.v_lead_active_task at ON at.lead_id = l.id;

COMMIT;