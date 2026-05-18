## Mērķis

Pievienot repo migration failu jau DB izpildītajai funkcijai `crm.rpc_cancel_task` (versionēšanai). Bez DB izmaiņām.

## Darbība

Izveidot jaunu failu: `supabase/migrations/20260518173800_rpc_cancel_task.sql`

Saturs = tieši tas pats SQL, kas tika izpildīts iepriekšējā solī (1:1 kopija no auto-ģenerētā migration faila):

- `CREATE OR REPLACE FUNCTION crm.rpc_cancel_task(p_task_id uuid, p_cancelled_reason text, p_cancelled_by_user_id uuid DEFAULT auth.uid(), p_metadata jsonb DEFAULT '{}'::jsonb) RETURNS jsonb`
- `LANGUAGE plpgsql`, `SECURITY DEFINER`, `SET search_path = crm, public`
- Validācija: `TASK_ID_REQUIRED`, `CANCELLED_REASON_REQUIRED`, `TASK_NOT_FOUND`, `TASK_ALREADY_FINALIZED`
- `UPDATE crm.tasks` → status='cancelled' + cancelled_reason + metadata merge
- `INSERT INTO crm.activities` (note, 'Task cancelled')
- `INSERT INTO crm.task_relations` (task → activity, follows)
- `INSERT INTO crm.audit_events` (task_cancelled)
- `RETURN jsonb_build_object(success, task_id, activity_id, status, cancelled_reason)`
- `REVOKE ALL ... FROM PUBLIC`
- `GRANT EXECUTE ... TO authenticated, service_role`

## Nedarīt

- Neveikt SQL izpildi
- Neveikt DB izmaiņas
- Bez frontend, cron, triggers, workflow advancement, automatic next-task generation

## Pēc izveides

Parādīt pilnu faila saturu pārbaudei.
