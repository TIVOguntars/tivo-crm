## Phase 2.2 (revised) — Settings-driven task-selection offsets

All offsets resolved from `crm.settings`. Zero hardcoded numeric offsets in SQL.

### 1. New setting row

```sql
-- INSERT preview (data-tool, not migration)
INSERT INTO crm.settings (setting_key, setting_group, value_json, description, is_active)
VALUES (
  'task_selection.priority_offsets',
  'task_selection',
  '{
    "tag_offsets": {
      "sketch": -20,
      "getestimate": 0
    },
    "default_offset": 0,
    "priority_tag_precedence": ["getestimate", "sketch"]
  }'::jsonb,
  'Per-tag offsets applied to lead priority_score when ordering Auto-generated call task candidates. First matching tag from priority_tag_precedence wins; falls back to default_offset.',
  true
);
```

Ops can later edit `value_json` to add/remove tags or change weights — no code deploy required.

### 2. Tag resolution logic (deterministic)

Given lead `tags` (comma/space separated text in `crm.leads.tags`) and the setting:

```
normalized_tags := lower trim split of l.tags

resolved_tag :=
  first element t of priority_tag_precedence
  such that t ∈ normalized_tags
  AND t ∈ keys(tag_offsets)

IF resolved_tag IS NULL:
  offset := default_offset
  reason := NULL
ELSE:
  offset := tag_offsets[resolved_tag]
  reason := resolved_tag || '_offset'    -- e.g. 'sketch_offset', 'getestimate_offset'

task_selection_score := COALESCE(priority_score,0) + offset
```

Examples:
- `tags = 'sketch, getestimate'`  → resolved = `getestimate`, offset = 0
- `tags = 'sketch'`               → resolved = `sketch`,      offset = −20
- `tags = 'hot'`                  → resolved = NULL,          offset = 0 (default)
- `tags = NULL`                   → resolved = NULL,          offset = 0

### 3. SQL preview — `crm.rpc_generate_daily_planned_tasks()`

Two surgical changes. No literal `-20`, `sketch`, `getestimate`, or `sketch_penalty` anywhere.

**3a. New DECLARE + load block (top of function, after existing settings reads)**

```sql
-- DECLARE additions
v_offsets_cfg      jsonb;
v_tag_offsets      jsonb;
v_tag_precedence   jsonb;
v_default_offset   numeric;

-- after the other SELECT value_json INTO ... lines
SELECT value_json INTO v_offsets_cfg
  FROM crm.settings
 WHERE setting_key='task_selection.priority_offsets' AND is_active;

v_tag_offsets    := COALESCE(v_offsets_cfg->'tag_offsets',    '{}'::jsonb);
v_tag_precedence := COALESCE(v_offsets_cfg->'priority_tag_precedence', '[]'::jsonb);
v_default_offset := COALESCE((v_offsets_cfg->>'default_offset')::numeric, 0);
```

**3b. Replace the candidate loop SELECT**

```sql
FOR v_lead IN
  WITH lead_tags AS (
    SELECT l.id AS lead_id,
           COALESCE(
             ARRAY(
               SELECT lower(btrim(t))
                 FROM regexp_split_to_table(COALESCE(s.tags,''), '[,\s]+') AS t
                WHERE btrim(t) <> ''
             ),
             ARRAY[]::text[]
           ) AS tag_list
      FROM crm.leads l
      LEFT JOIN crm.lead_priority_scoring_v2 s ON s.lead_id = l.id
     WHERE l.status = v_status
  ),
  resolved AS (
    SELECT lt.lead_id,
           (
             SELECT prec.tag
               FROM jsonb_array_elements_text(v_tag_precedence) AS prec(tag)
              WHERE prec.tag = ANY(lt.tag_list)
                AND v_tag_offsets ? prec.tag
              LIMIT 1
           ) AS resolved_tag
      FROM lead_tags lt
  )
  SELECT l.id,
         l.status,
         p.user_code AS ppv_code,
         l.ppv_user_id,
         c.full_name,
         c.phone_e164,
         COALESCE(c.phone_validated,false) AS phone_validated,
         s.priority_score                  AS lead_priority_score,
         s.tags                            AS lead_tags,
         r.resolved_tag                    AS resolved_offset_tag,
         COALESCE(
           (v_tag_offsets ->> r.resolved_tag)::numeric,
           v_default_offset
         ) AS tag_priority_offset,
         COALESCE(s.priority_score, 0) + COALESCE(
           (v_tag_offsets ->> r.resolved_tag)::numeric,
           v_default_offset
         ) AS task_selection_score,
         CASE WHEN r.resolved_tag IS NULL
              THEN NULL
              ELSE r.resolved_tag || '_offset'
         END AS task_priority_adjustment_reason
    FROM crm.leads l
    LEFT JOIN crm.contacts c ON c.id = l.contact_id
    LEFT JOIN crm.profiles p ON p.id = l.ppv_user_id
    LEFT JOIN crm.lead_priority_scoring_v2 s ON s.lead_id = l.id
    LEFT JOIN resolved r ON r.lead_id = l.id
   WHERE l.status = v_status
   ORDER BY
     (COALESCE(s.priority_score,0) + COALESCE(
        (v_tag_offsets ->> r.resolved_tag)::numeric,
        v_default_offset
      )) DESC,
     (l.status = 'Jauns') DESC,
     l.created_at DESC
LOOP
```

**3c. Extended metadata in the `rpc_create_task` call** (no new literals; values come from `v_lead.*` which were resolved from settings)

```sql
p_metadata => jsonb_build_object(
  'source','daily_planned_task_generator',
  'rule_key', v_rule_key,
  'definition', v_rule,
  'generated_for_date', v_generated_date,
  'ppv_code', v_lead.ppv_code,
  'priority_bucket', v_priority_bucket,
  'daily_quota_source', 'outreach.daily_quota',
  'quota_limit', v_ppv_cap,
  'quota_dimension', 'ppv_user',
  'phone_gate_passed', (v_task_type = 'call'),
  'lead_priority_score',             v_lead.lead_priority_score,
  'task_selection_score',            v_lead.task_selection_score,
  'tag_priority_offset',             v_lead.tag_priority_offset,
  'task_priority_adjustment_reason', v_lead.task_priority_adjustment_reason,
  'offset_source_setting',           'task_selection.priority_offsets'
)
```

### 4. Expected ordering effect (UC + MO, today's queues)

Same shift as before (getestimate leads with score ≥ sketch_score−20 surface ahead), but now driven entirely by the setting row. Edit the row → ordering changes on the next generator run, no deploy.

Illustrative MO bucket (unchanged from prior preview; resolution path is identical for this dataset):

```
                                  lead_score  offset  task_score
Max mauertmNb       getestimate       65        0        65
Anton               getestimate       47        0        47
Thomas Hummels      sketch            65       -20       45
Marielle Nulkes     getestimate       45        0        45
Hans Den Otter      sketch            58       -20       38
AppleJack Ladybug   sketch            55       -20       35
```

### 5. Hardcoded-offset audit (post-revision)

- No numeric offset literals in SQL.
- No tag name literals (`sketch`, `getestimate`) in SQL.
- No literal `'sketch_penalty'`. `task_priority_adjustment_reason` is built as `resolved_tag || '_offset'`, so adding a new tag in settings automatically yields a new reason string with no code change.
- The only literal referencing the rule is the setting key itself (`'task_selection.priority_offsets'`), which is required to load the config.

Confirmed: zero remaining hardcoded offsets.

### 6. Out of scope (untouched)

`crm.lead_priority_scoring_v2`, lead-priority display, stars, `crm.rpc_create_task`, cron, other settings, SMS/email, workflow engine, frontend.

### Execution

No execution. Awaiting approval. On approval:
1. Data-tool INSERT of `task_selection.priority_offsets` row.
2. Single migration replacing `crm.rpc_generate_daily_planned_tasks()` with the revised body above.
