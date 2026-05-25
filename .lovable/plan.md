## Mērķis
Frontend-only preview /leadi skatam. Bez DB, bez migrācijām, bez `public.*`, bez backend loģikas. Tikai mapping un display uzlabojumi virs jau esošajiem `crm.leads_list_display_v3` un `crm.v_next_action_queue` payload-iem.

## Datu avoti

### 1) `crm.leads_list_display_v3` — jau ielādēts ar `select=*`
Šobrīd `useCrmView("leads_list_display_v3", "select=*&order=created_at.desc.nullslast&limit=2000")` jau atgriež visus laukus, kas atļauti specā. Nelasītie payload lauki, ko **pievienojam mapping-ā Lead tipā** (bez query izmaiņām):
- `lead_number`
- `priority_label`
- `communication_label`
- `queue_bucket` (papildus jau lietotajam `queue_bucket_label`)
- `click_count`
- `last_inbound_at`, `last_outbound_at`, `last_reply_at`
- `next_action`, `next_action_due_date` (papildus `action_label` / `effective_due_at`, kas jau lasīti)
- `object_summary`

### 2) `crm.v_next_action_queue` — JAUNS frontend query
`useCrmView("v_next_action_queue", "select=lead_id,action_type,assigned_user_id,workflow_name,step_name,communication_label,communication_state,queue_status,queue_bucket,priority_label&limit=20000", { all: true })`.

Tiek izmantots TIKAI kolonnai **Atbildīgais** un kā fallback `priority_label` / `queue_bucket` chip-iem, ja `leads_list_display_v3` lauks tukšs. Mapojam pēc `lead_id` → `Map<string, QueueRow>`.

### 3) Lauki, kas šobrīd NAV frontend query/type
- `crm.leads.summary` — nav `leads_list_display_v3` payload-ā. Kolonna **Ātrās piezīmes** rāda `—`, kodā komentārs `// field missing in current query/type — pending Supabase backfill`.

## Kolonnu izmaiņas (`src/routes/leadi.tsx`)

| # | Kolonna | Display | Fallback / piezīmes |
|---|---|---|---|
| 1 | Prioritāte | `priority_label` (primary), `priority_score` (mazs secondary teksts) | Ja `priority_label` tukšs → `"0"`. Kārtošana `priority_score DESC`. Frontend NEKO nerēķina (esošā `priorityBucket` un `priorityStarsCount` saglabājas tikai grupēšanai/PriorityCell, bet kolonnas display vērtība nāk no `priority_label`). |
| 2 | PPV | `ppv_user_id` (raw UUID) | Tukšs → `"-"`. **Bez** `useUserMap.resolve()`. |
| 3 | Lead | `display_name` / `full_name` / `company_name` | Bez izmaiņām. |
| 4 | Tagi | `tags` | Bez izmaiņām. |
| 5 | Statuss | `status` caur `StatusBadge` | Vērtības nemainās, tikai paletes toņi (skat. Krāsas). |
| 6 | Atbildīgais | `v_next_action_queue.action_type` + `assigned_user_id` | Auto kopa: `email_send`, `sms_send`, `whatsapp_send`, jebkas ar prefix `system_` vai `auto_` → `"SIS"`. Manuāla + `assigned_user_id` → raw user ID. Nav datu → `"-"`. |
| 7 | Nākamais | `next_action` (fallback `action_label`), `next_action_due_date` (fallback `effective_due_at`) | Esošā biznesa loģika nemainās. |
| 8 | Aktivitāte | `communication_label` + apakšteksts `fmtRelative(last_reply_at ?? last_inbound_at ?? last_outbound_at ?? last_communication_at)` | `has_unread_reply=true` → badge "Jauna atbilde" (uzsvērts tonis). Channel + direction tonis (inbound vēss, outbound silts; email/sms/whatsapp/call atšķirīgi). |
| 9 | Ātrās piezīmes | `—` | Komentārs `// field missing in current query/type`. |

## Header rinda: meklēšana / filtri / kārtošana

Izmantojam jau esošo `flt` + `sort` + `q` arhitektūru. Saglabāšana — jau strādājošā `localStorage` key `leadi:session:v1`. Bez DB.

- **Meklēšana** (`q` matcher): `display_name`, `full_name`, `company_name`, `email_normalized`, `phone_e164`, `lead_number`.
- **Filtri**: pievienot/pārbaudīt chip-us `status`, `tags`, `ppv_user_id`, `priority_label`, `queue_bucket`.
- **Kārtošana**: `priority_score`, `ppv_user_id`, `status`, `next_action_due_date`, `last_communication_at`.

## Krāsu pielāgojumi

Tikai toņi — informācijas daudzums tas pats.

- `src/design/status-system.ts` — mierīgāki toņi (`bg-*-50/60`, `text-*-700`); vērtību kopa nemainās.
- Jauns `src/lib/channelTones.ts`:
  - email = slate, sms = teal, whatsapp = emerald, call = indigo;
  - inbound = vēsāks tonis (`*-50` / `*-700`);
  - outbound = siltāks tonis (amber/orange family pārklājums);
  - unread reply = `bg-rose-100 text-rose-700 ring-1 ring-rose-300`.

## Failu izmaiņas

1. `src/routes/leadi.tsx`
   - paplašināt `Lead` tipu un mapper ar jaunajiem `leads_list_display_v3` laukiem (no esošā `select=*` payload, **bez** query izmaiņām);
   - jauns `useCrmView("v_next_action_queue", …, { all: true })` + `queueByLead: Map<string, QueueRow>`;
   - `responsibleFor(lead)` helper → `"SIS" | userId | "-"`;
   - kolonnu render bloks pārstrādāts pēc augšā esošās tabulas;
   - `Prioritāte` display: `priority_label || "0"` + `priority_score` secondary;
   - `PPV` display: raw `ppv_user_id || "-"`;
   - `q` matcher paplašināts ar `lead_number`;
   - `flt` chip-i `priority_label`, `queue_bucket` pievienoti `FIELDS` un filter UI;
   - `SORT_FIELDS` papildināts ar `ppv_user_id`, `status`, `next_action_due_date`, `last_communication_at` (kur trūkst).
2. `src/design/status-system.ts` — mierīgāki toņi.
3. Jauns `src/lib/channelTones.ts` — channel+direction tonis aktivitātes apakšteksta render-am.
4. Jauns `src/lib/responsibleResolver.ts` — auto-action grupas detection.

## Ārpus scope (stingri)
- DB izmaiņas, migrācijas, RLS, RPC, Edge Functions, `public.*`.
- `crm.profiles` mapping / user name lookup.
- Jaunas tabulas/kolonnas, `quick_note`, `summary` migration.
- Jauni `action_type` ārpus dotās auto kopas.
- Backend prioritātes/responsibility resolver.

## Deliverable pēc ieviešanas

### 1) Strādā
- 9 kolonnu jaunais render (tostarp SIS atpazīšana, unread reply badge, channel toņi).
- Header search + chip filtri `status / tags / ppv_user_id / priority_label / queue_bucket`.
- Kārtošana `priority_score / ppv_user_id / status / next_action_due_date / last_communication_at`.
- Lokālā skata saglabāšana caur `leadi:session:v1`.
- Mierīgāka statusu/badge gamma.

### 2) Frontend trūkstošie lauki query/type
- `object_summary` → ja `leads_list_display_v3` šobrīd to nesatur produkcijas payload-ā, kolonna **Nākamais** apakšteksts paliek tukšs (apstiprināms ar reālu rindas inspekciju).
- `crm.leads.summary` → kolonna **Ātrās piezīmes** = `—`.
- `assigned_user_id` ārpus `v_next_action_queue` payload (piem., ja konkrētai rindai nav ieraksta queue view) → kolonna **Atbildīgais** = `"-"`.

### 3) Vēlāk jāpārceļ uz Supabase / business logic
- Prioritātes sakārtošana (`priority_label`/`priority_score` autoritatīvs avots; frontend fallback `"0"` ir tikai display patch).
- PPV un Atbildīgais lietotāja vārda mapping (kad `crm.profiles` būs aizpildīts).
- `summary` / quick note lauks `leads_list_display_v3` payload-ā.
- Pilna `action_type` taksonomija (auto vs manuāls) — šobrīd hardcoded frontend kopa `email_send / sms_send / whatsapp_send / system_* / auto_*`.
- `queue_bucket` un `priority_label` autoritatīvais avots (`leads_list_display_v3` vs `v_next_action_queue`) — šobrīd frontend lieto `leads_list_display_v3` ar fallback uz queue.
