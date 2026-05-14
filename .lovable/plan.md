
# M1–M3 migration failu izveide

Pēc apstiprināšanas izveidošu trīs jaunus migration failus ar timestamp prefiksu `supabase/migrations/` direktorijā. Saturs ir 1:1 v2 preview, ko apstiprināji — nekas papildus.

## Faili, kas tiks izveidoti

```text
supabase/migrations/
  <ts>_m1_junctions_tags_summary.sql
  <ts>_m2_indexes.sql
  <ts>_m3_rbac_helpers.sql
```

> Timestamp prefiksu (`YYYYMMDDHHMMSS`) ģenerēšu izveides brīdī, lai migration secība būtu m1 → m2 → m3.

---

## m1_junctions_tags_summary.sql

- M1.1 `crm.lead_people` backfill no `crm.leads.contact_id`
  - INSERT … WHERE NOT EXISTS (idempotents)
  - Normalizācija: viens `is_primary_contact = true` uz lead-u (ROW_NUMBER pa metadata + id)
- M1.2 `crm.lead_objects` backfill no `crm.lead_project_overview`
  - DO blokā ar `information_schema.tables` esamības pārbaudi
  - `relationship_type := 'interested_in'` literāli (bez paļaušanās uz view kolonnu)
  - **bez `created_at`** — `ORDER BY lead_id, id`
  - Pirmais saites ieraksts katram lead-am → `is_primary_object = true`, ja vēl nav neviena primary
- M1.3 `crm.tags` + `crm.lead_tags`
  - `CREATE TABLE IF NOT EXISTS`
  - Indeksi: `tags_label_idx`, `lead_tags_tag_idx`, `lead_tags_lead_idx`
  - `ALTER TABLE … ENABLE ROW LEVEL SECURITY` (bez policy — atsevišķā migrācijā)
- M1.4 `ALTER TABLE crm.leads ADD COLUMN IF NOT EXISTS summary text`

## m2_indexes.sql

Tikai `CREATE INDEX IF NOT EXISTS`:

- `tasks_lead_status_due_idx` — `(lead_id, status, due_at)`
- `tasks_assigned_status_idx` — `(assigned_user_id, status)`
- `tasks_due_at_idx` — `(due_at)`
- `tasks_task_type_idx` — `(task_type)`
- `notes_lead_created_idx` — `(lead_id, created_at DESC)`
- `notes_type_idx` — `(note_type)`

Bez CHECK, bez DEFAULT izmaiņām, bez datu izmaiņām.

## m3_rbac_helpers.sql

- M3.0 Drošas UNIQUE constraint pārbaudes (DO bloks ar `pg_constraint` introspekciju):
  - `crm.permissions(slug)` → `permissions_slug_key`, ja vēl nav UNIQUE/PK
  - `crm.role_permissions(role_id, permission_id)` → `role_permissions_role_perm_key`, ja vēl nav
- M3.1 `crm.has_role(_user_id uuid, _role_slug text) → boolean` — `STABLE SECURITY DEFINER`, `search_path = crm, public`
- M3.2 `crm.has_permission(_user_id uuid, _permission_slug text) → boolean` — tāds pats profils
- M3.3 `crm.current_user_permissions() → TABLE(permission_slug text)` — izmanto `auth.uid()`
- M3.4 `crm.current_user_roles() → TABLE(role_slug text, role_label text)` — izmanto `auth.uid()`
- `GRANT EXECUTE … TO authenticated` visām četrām funkcijām
- M3.5 9 trūkstošās permissions (`INSERT … ON CONFLICT (slug) DO NOTHING`):
  `view_audit`, `view_import_review`, `view_validation`, `add_note`, `create_task`, `edit_contact`, `add_contact`, `manage_object`, `manage_followup`
- M3.6 Admin role backfill (`INSERT … ON CONFLICT (role_id, permission_id) DO NOTHING`)

---

## Ko NEDARU šajā solī

- Neveidoju `lead_contact_links` tabulu
- Neveidoju `follow_ups` tabulu
- Nepieskaros `tasks` / `notes` schemai (tikai indeksi)
- Nepievienoju CHECK constraints un nemainu DEFAULT vērtības
- Neveidoju RLS policies uz `crm.tags` / `crm.lead_tags`
- Neveidoju write RPC (M4)
- Nemainu UI / frontend kodu
- Nepalaidu nekādu datu UPDATE/DELETE ārpus tā, kas jau aprakstīts M1.1 normalizācijā un M1.2 primary object aizpildē

## Pēc failu izveides

1. Parādīšu visu trīs failu pilnu saturu čatā (`code--view`) pārskatīšanai.
2. Negaidu deploy bez Tavas atļaujas — apstiprini pēc satura pārskata.
3. Pēc deploy apstiprinājuma palaidīšu migrācijas (m1 → m2 → m3 secībā).

Apstiprini šo plānu, un sākšu failu izveidi.
