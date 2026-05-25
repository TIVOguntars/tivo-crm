# Lead Priority cleanup — pabeigšana

Mērķis: izņemt atlikušās legacy Lead Priority atsauces no `src/routes/uzdevumi.tsx` un `src/routes/lead.$leadId.tsx`, lai build vairs nekrīt. Bez DB / view / RPC / RLS izmaiņām. `/leadi` netiek aiztikts.

## 1. `src/routes/uzdevumi.tsx`

Iepriekšējā iterācijā jau tika dzēsti `priority` state, `priorityChips`, `priorityCounts`, `priorities`, `PriorityStars`, bet vairākas to lietojuma vietas palikušas → build kļūdas.

Noņemt:

- **Filter chips bloks (rindas ~696–707)** — viss `priorityChips.map(...)` grid. Atstāt tikai lead status chips kolonnā; pielāgot ārējo grid (`lg:grid-cols-7` / `lg:col-span-3` / `lg:col-span-4`) uz vienkāršu pilnā platuma lead status grid.
- **Tabulas header (rinda ~761–763)** — `<HeadCell>` ar `<SortButton label="Lead prioritāte" k="leadPriority" />`.
- **Filter row (rinda ~791–793)** — `<FilterCell>` ar `<HeaderOptionsSelect value={priority} ... options={priorities} />`.
- **Rindas render (rinda ~864, 866, 868, 879–881, 893–896)**:
  - `const pLabel = s(r.priority_label)` — dzēst.
  - `const isHigh = pLabel === "Augsta"` un `isHigh && "bg-red-50/70 ..."` row tinting — dzēst.
  - `const score = n(r.priority_score)` — dzēst.
  - `{/* 1. Lead prioritāte */} <TableCell><PriorityStars .../></TableCell>` — dzēst visu šūnu.
- **`SortKey` (rinda ~1142–1153)** — noņemt `"score"` un `"leadPriority"` no union.
- **`sortValue` (rinda ~1156–1162)** — noņemt `case "score"` (`priority_score`) un `case "leadPriority"` (`sort_priority`). Atstāt `case "priority"` → `task_priority_label` (Task Priority, nevis Lead).
- **`colSpan={10}` (rinda 856)** — pārrēķināt uz `9` (tika dzēsta Lead prioritāte kolonna; PPV, Vārds, Tagi, Statuss, Atbildīgais, Termiņš, Prioritāte (task), Darbība, Darbības = 9).

Saglabāt bez izmaiņām:
- `taskPriorityLabel()` un `base.task_priority_label = taskPriorityLabel(taskRaw)` — Task Priority no `crm.tasks.priority`.
- `taskPriority` state + `taskPriorities` options + `HeaderOptionsSelect` (rinda 833) — Task Priority filter.
- `SortKey "priority"` ar `task_priority_label` — Task Priority sort.

## 2. `src/routes/lead.$leadId.tsx`

Noņemt:

- **Imports (rinda 21)** — `Star` no `lucide-react` (vairs nelietots).
- **`useCrmView("lead_priority_scoring_v2", ...)` blokss (rindas 345–350)** — viss `scoringQ` un komentārs virs tā.
- **Derived state (rindas 454–465)** — `scoringRow`, `priorityScore`, `priorityLabel`, `recommendedStatus`, `showRecommendedStatus`, `priorityStars`.
- **Header bloks "Prioritāte" (rindas 780–799)** — viss `<div className="flex flex-col ml-[50px]">...</div>` ar Star zvaigznēm, `priorityLabel · priorityScore` un `Ieteiktais statuss` badge.

Saglabāt bez izmaiņām:
- PPV bloks (rinda 771–775).
- Atbildīgais bloks (rinda 776–779).
- Pēdējā aktivitāte bloks (rinda 800–803).
- Viss pārējais Lead 360 saturs.

## Verifikācija

```
rg "priority_score|priority_label|raw_priority_score|priority_sort|queue_bucket|queue_status|lead_priority_scoring_v2|PriorityStars|priorityStars|Lead prioritāte|Karstie" src/routes/uzdevumi.tsx src/routes/lead.\$leadId.tsx
```

Sagaidāmais rezultāts: 0 rindu. (Visi `task_priority_label` / `taskPriority` lietojumi paliek — tie ir Task Priority no `crm.tasks.priority`, kas pēc instrukcijas jāsaglabā.)

Pēc tam ļaut harness palaist build, lai apstiprinātu, ka nav TS kļūdu un nav unused imports.
