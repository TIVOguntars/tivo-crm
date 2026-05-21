## Phase 1 — /uzdevumi tabulas UX refaktors (frontend-safe)

### Part 5 — DB RPC audit (read-only, jau veikts)

**Eksistē** crm shēmā: `rpc_complete_task`, `rpc_reschedule_task` (tikai due_at), `rpc_cancel_task`, `rpc_skip_task`, `rpc_create_task`.

**Iztrūkst:** `rpc_update_task`, `rpc_delete_task`.

**Sekas Phase 1:**
- Pārplānot ar pilnu lauku rediģēšanu (tips, atbildīgais, prioritāte, piezīmes) nav iespējams droši pieslēgt → **Pārplānot paliek esošajā mini-dialoga formā Phase 1**. UI refaktors ar `TaskFormDialog` edit režīmu → Phase 2 pēc migrācijas.
- Dzēst nav backend RPC → **Dzēst menu vienība šajā fāzē netiek pievienota**. UI tiks pievienots Phase 2.

SQL preview iztrūkstošajiem RPC (gaida apstiprinājumu, Phase 2):
```sql
CREATE OR REPLACE FUNCTION crm.rpc_update_task(
  p_task_id uuid, p_task_type text DEFAULT NULL,
  p_due_at timestamptz DEFAULT NULL, p_assigned_user_id uuid DEFAULT NULL,
  p_priority text DEFAULT NULL, p_title text DEFAULT NULL,
  p_description text DEFAULT NULL, p_metadata_patch jsonb DEFAULT NULL,
  p_updated_by_user_id uuid DEFAULT NULL
) RETURNS jsonb ...;

CREATE OR REPLACE FUNCTION crm.rpc_delete_task(
  p_task_id uuid, p_cascade boolean DEFAULT false,
  p_deleted_by_user_id uuid DEFAULT NULL
) RETURNS jsonb ...;
-- cascade: WITH RECURSIVE pa metadata->>'parent_task_id'
-- audit: entity_type='task', action_type='update'|'delete', source_type='manual_ui'
```

---

### Part 3 — `CommStats` izvilkšana (jauns fails)

**Jauns:** `src/components/CommStats.tsx` — eksportē `CommStats` komponentu + `CommBuckets` tipu (identiska implementācija kā pašlaik iekš `leadi.tsx` rindas 603–653).

**Mainās:** `src/routes/leadi.tsx`
- Noņem lokālo `CommBuckets` tipu + `CommStats` funkciju (rindas 603–653)
- Pievieno `import { CommStats, type CommBuckets } from "@/components/CommStats";`
- Bez vizuālām izmaiņām

---

### Part 1 — Kolonnu pārkārtošana iekš `src/routes/uzdevumi.tsx`

**Jaunā kolonnu secība** (`<thead>` + filtra rinda + `<tbody>` šūnas):

| # | Header | Šūnas saturs | Filtrs header rindā |
|---|---|---|---|
| 1 | Lead prioritāte | `<PriorityStars label={pLabel} score={score} />` | `HeaderOptionsSelect` (priority) |
| 2 | PPV | `s(r.ppv_name) \|\| "—"` | `HeaderOptionsSelect` (ppv) |
| 3 | Vārds Uzvārds / VAL | `<Link to="/lead/$leadId">` ar `leadLabel(r)` + zem tā `s(r.country)` | meklētājs (q) |
| 4 | Zvani–e-pasti–ziņas | `<CommStats counts={commCounts.get(s(r.lead_id))} />` | — (tukša šūna) |
| 5 | Tagi | `<TagsCell tags={tags} />` | `TagsMultiSelect` |
| 6 | Statuss | `<StatusBadge status={mapStatus(...)} />` | `HeaderOptionsSelect` (leadStatus) |
| 7 | Atbildīgais | `<OwnerBadge value={s(r.action_owner_label)} />` | `HeaderOptionsSelect` (owner) |
| 8 | Termiņš | `<DueCell value={r.effective_due_at ?? r.due_at} />` | `Select` (dueFilter) |
| 9 | Prioritāte (uzdevuma) | `<PriorityBadge label={tLabel} />` | `HeaderOptionsSelect` (taskPriority) |
| 10 | Darbība | esošs action label + Auto/Manual badge | `HeaderOptionsSelect` (actionType) |
| 11 | Darbības | `<TaskActionsMenu .../>` | clear-all poga |

**Noņem** atsevišķo Valsts kolonnu (gan headeris, gan filtrs, gan šūna). Valsts kods parādās zem lead nosaukuma kā `<div className="text-[10px] text-muted-foreground">{s(r.country)}</div>`.

`leadSecondary` šajā tabulā netiek izmantots (paliek funkcijā citur lietošanai).

`SortKey` tips paliek tas pats; `sortValue`, `colSpan={11}` saglabājas.

### Part 1 — Rindas un menu klikšķu uzvedība

- `<TableRow>` saņem `onClick={() => openCompleteForTask(r)}` + `className="cursor-pointer"`.
- `openCompleteForTask` saglabā `{ taskId, leadId, taskType }` state un atver vienu kopēju `<CompleteTaskModal>` instanci page līmenī.
- Lead `<Link>` šūnā saņem `onClick={(e) => e.stopPropagation()}` + arī `setLead360ReturnTo` zvanu (skat. Part 2).
- `TaskActionsMenu` ārējais `<div>` saņem `onClick={(e) => e.stopPropagation()}`. Iekšējais `DropdownMenuTrigger` jau pārtrauc.

### Part 1 — Komunikāciju datu plūsma

Pievieno iekš `QueuePage`:
```ts
const commCountsView = useCrmView(
  "lead_row_communication_counts",
  "select=lead_id,email_outbound_count,email_inbound_count,call_outbound_count,call_inbound_count,chat_outbound_count,chat_inbound_count",
  { all: true },
);
const commCounts = useMemo(() => {
  const map = new Map<string, CommBuckets>();
  for (const r of (commCountsView.data?.rows ?? []) as Row[]) {
    const lid = s(r.lead_id);
    if (!lid) continue;
    map.set(lid, {
      email: [Number(r.email_outbound_count) || 0, Number(r.email_inbound_count) || 0],
      call:  [Number(r.call_outbound_count)  || 0, Number(r.call_inbound_count)  || 0],
      chat:  [Number(r.chat_outbound_count)  || 0, Number(r.chat_inbound_count)  || 0],
    });
  }
  return map;
}, [commCountsView.data]);
```

---

### Part 2 — Filtra persistence + return navigation

**Iekš `src/routes/uzdevumi.tsx`:**

1. Pievieno `useEffect` mount fāzē, kas mēģina nolasīt `sessionStorage["uzdevumi:lastSearch"]` un atjauno state (actionType, dueFilter, leadStatus, priority, taskPriority, owner, country, ppv, tags, q, source, sort). Try/catch ap JSON.parse.
2. Pievieno `useEffect`, kas pie katras filtra/sort izmaiņas raksta state JSON uz to pašu atslēgu.
3. Pirms lead navigācijas (lead Link `onClick`):
   ```ts
   try { sessionStorage.setItem("lead360:returnTo", "/uzdevumi"); } catch {}
   ```

**Iekš `src/routes/lead.$leadId.tsx` — `goBackToList` paplašināšana (rindas 321–330):**

```ts
const goBackToList = () => {
  let returnTo: string | null = null;
  try {
    returnTo = sessionStorage.getItem("lead360:returnTo");
    if (returnTo) sessionStorage.removeItem("lead360:returnTo");
  } catch { /* ignore */ }
  if (returnTo === "/uzdevumi") {
    navigate({ to: "/uzdevumi" });
    return;
  }
  let prev: Record<string, unknown> | null = null;
  try {
    const raw = sessionStorage.getItem("leadi:lastSearch");
    if (raw) prev = JSON.parse(raw);
  } catch { /* ignore */ }
  navigate({ to: "/leadi", search: (prev ?? {}) as never });
};
```

Esošā uzvedība uz `/leadi` paliek default.

---

### Part 4 — TaskActionsMenu (frontend-safe izmaiņas tikai)

**Mainās:** `src/components/TaskActionsMenu.tsx`

- **Pabeigt** — bez izmaiņām (esošā `CompleteTaskModal` integrācija).
- **Izlaist** — pilnībā noņem no UI (gan `DropdownMenuItem`, gan `skipOpen` state, gan `skipReason`, gan `handleSkip`, gan `Dialog` JSX bloks). `rpc_skip_task` paliek DB.
- **Atcelt** — bez izmaiņām.
- **Pārplānot** — **paliek mini date-dialog Phase 1** (full edit režīms gaida `rpc_update_task` migrāciju).
- **Dzēst** — **netiek pievienots Phase 1** (gaida `rpc_delete_task` migrāciju).

Phase 1 šajā komponentā = tikai Izlaist noņemšana.

---

### Failu izmaiņas (Phase 1)

| Fails | Darbība |
|---|---|
| `src/components/CommStats.tsx` | **JAUNS** — eksportē `CommStats` + `CommBuckets` |
| `src/routes/leadi.tsx` | Noņem lokālo `CommStats`/`CommBuckets`, importē no jaunā moduļa |
| `src/routes/uzdevumi.tsx` | Kolonnu pārkārtošana, jauna comms kolonna ar `lead_row_communication_counts` view, sessionStorage `uzdevumi:lastSearch`, `lead360:returnTo` set pirms nav, row onClick → `CompleteTaskModal`, valsts kolonnas izņemšana, valsts kods zem lead nosaukuma |
| `src/routes/lead.$leadId.tsx` | `goBackToList` lasa `lead360:returnTo` un atgriežas uz `/uzdevumi` ja nepieciešams |
| `src/components/TaskActionsMenu.tsx` | Noņemt Izlaist (UI + state + handler + dialog) |

### Nemainās

- `crm.v_tasks_queue_ui` (audit neprasa izmaiņas)
- Ģenerators, kvotas, audit shēma
- `TaskFormDialog` (Phase 2 edit režīms gaida migrāciju)
- `rpc_skip_task` (paliek DB, tikai UI noņemts)
- `rpc_reschedule_task` (paliek pieslēgts esošajai mini-dialoga formai)

### Phase 2 (atsevišķi, pēc apstiprinājuma)

1. Migrācija: `crm.rpc_update_task` + `crm.rpc_delete_task`
2. `TaskFormDialog` paplašināšana ar `mode` + `initialTask` props
3. `TaskActionsMenu` Pārplānot → atver `TaskFormDialog` edit režīmā
4. `TaskActionsMenu` Dzēst → AlertDialog ar cascade detektēšanu (caur metadata.parent_task_id rekursīvu count) un izsauc `rpc_delete_task`
