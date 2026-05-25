## Mērķis
Pilnībā izņemt legacy frontend Lead Priority loģiku no /leadi, /uzdevumi un Lead 360. Frontend vairs nekur neaprēķina un nerenderē Lead Priority (zvaigznes, bucket, "Karstie", score/label). `crm.tasks.priority` (High/Medium/Low) paliek neskarts kā vienīgais Task Priority avots.

## Stingri ārpus scope
- Bez DB / migrāciju / view / RPC / RLS izmaiņām.
- Neaiztikt `crm.tasks.priority` un Task Priority UI (High/Medium/Low).
- Neveidot jaunu scoring, bucket, stars, fallback prioritāti.
- Nemainīt filtrus/sort, kas balstās uz NE-priority laukiem.

## Izmaiņas pa failiem

### 1) `src/components/PriorityCell.tsx` — DZĒST
Failu izņemt pilnībā (`priorityStarsCount` + `PriorityCell`). Imports nav nekur kodbāzē (`rg` apstiprina 0 lietojumus ārpus paša faila).

### 2) `src/lib/priorityColors.ts` — DZĒST
`priorityTone`, `PRIORITY_ROW_BG`, `PRIORITY_BADGE` šobrīd nav lietoti nekur citur — droši dzēšami.

### 3) `src/routes/leadi.tsx`
Noņemt visu Lead Priority aprēķinu/renderēšanu:
- Dzēst `priorityBucket(score)` funkciju un visu tās lietojumu.
- Dzēst saved view chip `"Karstie"` (`priority_score >= 60` predicate).
- Dzēst FIELDS ierakstus: `priority_score`, `priority_label`, `queue_bucket` (filter/grouping/search galos).
- Dzēst SORT_FIELDS ierakstus: `priority_score`, `priority_label`.
- Noņemt default sort `{ f: "priority_score", d: "desc" }` — aizvietot ar esošu non-priority lauku (`created_at desc`, kas jau ir kā nullslast pamatā).
- Noņemt otro `useCrmView("lead_priority_scoring_v2", …)` ielādi un visu `score/label/raw_priority_score` patch loģiku `leadsPatched` mappingā.
- Noņemt `v_next_action_queue` selectos `queue_status, queue_bucket, priority_label` (atstāt tikai `lead_id, action_type, assigned_user_id, workflow_name, step_name, communication_label, communication_state` — tie ir vajadzīgi kolonnai "Atbildīgais" un "Uzdevums").
- `QueueFacts` tipā noņemt `queue_bucket`, `priority_label`.
- `Lead` tipā noņemt `priority_score`, `priority_label`, `queue_bucket`, `queue_bucket_label`, `raw_priority_score` (un jebkurus citus priority laukus). Atstāt `ppv_user_id`, `next_action`, `next_action_due_date`, `display_name`, contact lauki, communication counters — tos lietotājs prasīja saglabāt.
- Dzēst kolonnu "Prioritāte" no LEADS_GRID un attiecīgo `<td>` render bloku (rindas 1715–1731).
- LEADS_GRID columnu skaitu samazināt par 1; pārbaudīt, ka header un row col-spani sakrīt.
- Noņemt filtru chip UI elementus `priority_label`, `queue_bucket`.
- Pārliecināties, ka `dedupe(...)` blokā `priority_label` / `queue_bucket` arī izņemts.

### 4) `src/routes/uzdevumi.tsx`
Noņemt Lead Priority avotu un atvasinājumu, bet **paturēt** `task_priority_label`, kas nāk no `crm.tasks.priority` (NE no lead score).
- Dzēst otro `useCrmView("lead_priority_scoring_v2", "select=lead_id,priority_score,priority_label,recommended_status,raw_priority_score,…")` un visu merge bloku, kas pievieno `priority_score`, `priority_label`, `raw_priority_score` task rindām.
- Dzēst kodu, kas atvasina `task_priority_label` no `leadScore` (`leadScore >= 70 ? "Augsta" : …`). `task_priority_label` jāveido **tikai** no `task.priority` (mapping: `high → "Augsta"`, `normal/medium → "Vidēja"`, `low → "Zema"`). Ja task select šobrīd neielādē `priority`, papildināt tasks `select=` ar `priority` (tas ir esošs `crm.tasks` lauks — nav DB izmaiņa).
- Noņemt filter `priority` (lead priority_label) un atbilstošo UI chip. Paturēt filter `taskPriority` (task_priority_label).
- Noņemt komentāru/loģiku "Map lead priority_score (0..90) to 1..5 stars" un jebkādu zvaigžņu render task rindām.
- Noņemt sort opciju `priority_score` un jebkuru tie-breaker `n(b.priority_score) - n(a.priority_score)` — aizvietot ar `due_at asc nullslast` (jau esošs sort lauks) kā stabilu fallback.
- Noņemt grupēšanu/sort pēc `queue_bucket` (rindas 659–660).
- Noņemt `priority_label` lietojumus rindās 570, 610, 688, 728, 977.
- Render kolonnā paturēt tikai `task_priority_label` (no `task.priority`).

### 5) `src/routes/lead.$leadId.tsx`
- Dzēst `scoringQ = useCrmView("lead_priority_scoring_v2", …)` un visus atvasinājumus: `scoringRow`, `priorityScore`, `priorityLabel`, `recommendedStatus`, `showRecommendedStatus`, `priorityStars`.
- Header bloka "Prioritāte" sekciju (rindas 780–799) dzēst pilnībā — zvaigznes, label, score, "Ieteiktais statuss" badge. Saglabāt PPV, Atbildīgais, Pēdējā aktivitāte sekcijas.
- Noņemt `Star` import, ja pēc tam vairs nav lietots.

## Verifikācija pēc ieviešanas
- `rg "priorityStarsCount|PriorityCell|priorityBucket|priority_score|priority_label|priority_sort|queue_bucket|queue_status|raw_priority_score|lead_priority_scoring_v2|Karstie" src` → 0 rezultātu.
- `rg "priorityTone|PRIORITY_ROW_BG|PRIORITY_BADGE" src` → 0 rezultātu.
- `rg "task.priority|task_priority_label" src` → paliek tikai uzdevumu kontekstā (apliecina, ka Task Priority saglabāts).
- Vizuāli: /leadi ielādējas (679 leads), bez "Prioritāte" kolonnas, bez "Karstie" chip; /uzdevumi rāda Task Priority no `task.priority`; Lead 360 header bez priority bloka.

## Deliverable
1. Dzēsti: `PriorityCell.tsx`, `priorityColors.ts`.
2. Atjaunoti: `leadi.tsx`, `uzdevumi.tsx`, `lead.$leadId.tsx`.
3. Saglabāts: `crm.tasks.priority` kā vienīgais Task Priority avots; `task_priority_label` veidots tikai no tā.
4. Bez DB / migrāciju / jaunu view izmaiņām.
