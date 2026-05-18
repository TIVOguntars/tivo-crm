
# FINAL Migration Preview — BJ/PPV Workflow Configuration Settings (corrected)

Settings rows only. **Not executed. No migration file created. No RPCs, no task generation, no cron, no frontend.**

---

## Corrections applied vs previous plan

1. **Role naming.** `BJ` removed (BJ = person, not role). `Mārketinga saziņa` → `Mārketings`. Canonical roles in config: `PPV`, `Mārketings`, `Projektētājs`, `Tāmētājs`.
2. **`outreach.daily_quota.role`** = `"Mārketings"`.
3. **`workflow.stop_rules.Nesasniedzams.manual_resume`** = `true` (was `false`).
4. All other 11 keys unchanged from approved plan.

---

## `crm.settings` (already inspected)

Columns: `id uuid PK`, `setting_key text UNIQUE NOT NULL`, `setting_group text NOT NULL`, `value_json jsonb NOT NULL`, `description text`, `is_active bool NOT NULL default true`, `created_by/updated_by uuid → crm.profiles`, `created_at/updated_at timestamptz`. Unique on `setting_key` enables safe idempotent upsert. No existing rows for any of the 13 target keys.

---

## Final SQL preview (DO NOT EXECUTE)

```sql
-- Idempotent: existing rows with the same setting_key are preserved verbatim.
INSERT INTO crm.settings (setting_group, setting_key, value_json, description, is_active) VALUES

('task','task.types',
 '{"values":["call","sms","whatsapp","email","zoom","meeting","status_change","task_created","task_completed","note","other"]}'::jsonb,
 'Allowed task_type values for crm.tasks', true),

('task','task.statuses',
 '{"values":["planned","overdue","in_progress","completed","cancelled","skipped","failed"]}'::jsonb,
 'Allowed status values for crm.tasks', true),

('activity','activity.types',
 '{"values":["call","sms","whatsapp","email","zoom","meeting","status_change","task_created","task_completed","note","other"]}'::jsonb,
 'Allowed activity_type values for crm.activities', true),

('call','call.outcomes',
 '{"values":["talked","no_answer","busy","voicemail","wrong_number","callback_requested","not_interested","do_not_contact","agreed_ppv_followup"]}'::jsonb,
 'Outcome codes for completed call tasks', true),

('message','message.outcomes',
 '{"values":["sent","delivered","replied","no_reply","failed","opt_out"]}'::jsonb,
 'Outcome codes for SMS/WhatsApp/email message tasks', true),

('contact','contact.limits',
 '{"calls":4,"sms_whatsapp":2,"emails":4,"on_limit_status":"Nesasniedzams","automation_continues":true}'::jsonb,
 'Per-lead contact-attempt limits before status becomes Nesasniedzams. Automation continues.', true),

('outreach','outreach.daily_quota',
 '{"role":"Mārketings","per_ppv_user":{"UC":10,"MO":10}}'::jsonb,
 'Daily outreach quota per PPV user group, executed by role Mārketings', true),

('outreach','outreach.eligible_statuses',
 '{"values":["Jauns","Nesasniedzams"]}'::jsonb,
 'Lead statuses eligible for outreach planning', true),

('calendar','calendar.business_days',
 '{"timezone":"Europe/Riga","working_days":["Mon","Tue","Wed","Thu","Fri"],"holidays":[]}'::jsonb,
 'Business-day calendar for all schedulers', true),

('automation','automation.weekend_policy',
 '{"human_tasks_weekends_allowed":false,"manual_tasks_weekends_allowed":true,"sis_b2c_weekends_allowed":true,"sis_b2b_weekends_allowed":false}'::jsonb,
 'Weekend execution policy per actor type', true),

('ppv','ppv.auto_reschedule',
 '{"no_answer_days":2,"business_days_only":true}'::jsonb,
 'Auto-reschedule rule for PPV no_answer tasks when user does not reschedule manually', true),

('status','status.on_outcome',
 '{"not_interested":"Nekvalificējas","do_not_contact":"Nesasniedzams","opt_out":"Atlikts","agreed_ppv_followup":"Piesaistīšana"}'::jsonb,
 'Outcome → target lead status mapping', true),

('workflow','workflow.stop_rules',
 '{"Nekvalificējas":{"stops":true,"manual_resume":true},"Atlikts":{"stops":true,"manual_resume":true},"Nesasniedzams":{"stops":false,"manual_resume":true}}'::jsonb,
 'Per-status automation stop rules', true)

ON CONFLICT (setting_key) DO NOTHING;
```

Properties:
- `ON CONFLICT (setting_key) DO NOTHING` → never overwrites existing rows.
- No DDL, no RLS change, no trigger change, no FK touched.
- Re-running is safe; second run affects 0 rows.

---

## Self-check queries (read-only)

```sql
-- 1) All 13 keys present
SELECT setting_key FROM crm.settings
WHERE setting_key IN (
 'task.types','task.statuses','activity.types',
 'call.outcomes','message.outcomes','contact.limits',
 'outreach.daily_quota','outreach.eligible_statuses',
 'calendar.business_days','automation.weekend_policy',
 'ppv.auto_reschedule','status.on_outcome','workflow.stop_rules')
ORDER BY setting_key;
-- Expect: 13 rows.

-- 2) Group bucketing
SELECT setting_group, count(*) FROM crm.settings
WHERE setting_group IN ('task','activity','call','message','contact','outreach','calendar','automation','ppv','status','workflow')
GROUP BY setting_group ORDER BY setting_group;
-- Expect: task=2, activity=1, call=1, message=1, contact=1, outreach=2,
--         calendar=1, automation=1, ppv=1, status=1, workflow=1.

-- 3) Role correction landed
SELECT value_json->>'role' AS role
FROM crm.settings WHERE setting_key='outreach.daily_quota';
-- Expect: 'Mārketings'.

-- 4) Stop-rules correction landed
SELECT value_json->'Nesasniedzams' AS nesasniedzams_rule
FROM crm.settings WHERE setting_key='workflow.stop_rules';
-- Expect: {"stops": false, "manual_resume": true}.

-- 5) Mapped statuses exist in catalog
SELECT (kv).value AS status_value,
       EXISTS (SELECT 1 FROM crm.lead_statuses ls WHERE ls.status_key=(kv).value) AS exists_in_catalog
FROM (SELECT jsonb_each_text(value_json) AS kv FROM crm.settings WHERE setting_key='status.on_outcome') t;
-- Expect: all true (Nekvalificējas, Nesasniedzams, Atlikts, Piesaistīšana).

-- 6) Eligible statuses exist in catalog
SELECT x AS status_value,
       EXISTS (SELECT 1 FROM crm.lead_statuses ls WHERE ls.status_key=x) AS exists_in_catalog
FROM crm.settings, jsonb_array_elements_text(value_json->'values') x
WHERE setting_key='outreach.eligible_statuses';
-- Expect: Jauns=true, Nesasniedzams=true.

-- 7) Forbidden role tokens absent
SELECT setting_key, value_json
FROM crm.settings
WHERE setting_group IN ('outreach','status','workflow','automation','ppv')
  AND value_json::text ~* '("BJ"|"Mārketinga saziņa")';
-- Expect: 0 rows.
```

---

## Rollback SQL (DO NOT EXECUTE)

```sql
-- Hard rollback (removes only the 13 seeded keys)
DELETE FROM crm.settings
WHERE setting_key IN (
 'task.types','task.statuses','activity.types',
 'call.outcomes','message.outcomes','contact.limits',
 'outreach.daily_quota','outreach.eligible_statuses',
 'calendar.business_days','automation.weekend_policy',
 'ppv.auto_reschedule','status.on_outcome','workflow.stop_rules');

-- Soft rollback alternative (keeps audit trail)
-- UPDATE crm.settings SET is_active=false, updated_at=now()
-- WHERE setting_key IN ( ...same list... );
```

No FK references `crm.settings`; rollback is non-cascading and safe.

---

## Scope confirmation

- ✅ Settings rows only (13 keys).
- ❌ No RPCs.
- ❌ No task generation.
- ❌ No cron / pg_cron change.
- ❌ No dispatcher / allocator change.
- ❌ No frontend change.
- ❌ No DDL on tables, no RLS edits.
- Existing settings preserved by design.

Awaiting approval before execution.
