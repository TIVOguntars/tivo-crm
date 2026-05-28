
# Jauna CRM tabulu sistēmas bāze + izolēta demo lapa

Veidot tikai jauno arhitektūru. Nepieslēgt esošajām lapām. Neaiztikt /leadi, /uzdevumi, /lietotaji, auth, RPC, krāsu tokenus, CSS.

## Jaunie faili

### 1. `src/components/crm/table/CrmDataTable.tsx` (jauns)

Eksportē primitīvus:

- `CrmDataTable` — ārējais wrapper. Renderē shadcn `Table` iekš `div` ar `border + bg-card`. Props: `maxHeight?: number|string` (ieslēdz vertikālo scroll un sticky header), `sort?: { key, dir }`, `onSortChange?(key, dir)`. Padod sort kontekstu pa React Context.
- `CrmDataTableHeader` — wraps shadcn `TableHeader`, default `sticky top-0 z-20`.
- `CrmDataTableLabelRow` — `TableRow` ar klasi `crm-table-header-row` (40px, bez bottom border).
- `CrmDataTableFilterRow` — `TableRow` ar klasi `crm-table-filter-row` (40px), default `sticky top-10 z-20`.
- `CrmSortableHead` — `TableHead` + `<button class="crm-sort-trigger">`. Cikls null → asc → desc → null. Rāda `ArrowUp/Down/UpDown` ikonu. Atbalsta `align`.
- `CrmFilterCell` — `TableHead` ar `crm-table-filter-cell`. Atbalsta `colSpan`, `align`.
- `CrmDataBody` — `TableBody` wrapper.
- `CrmDataRow` — `TableRow` ar `crm-table-body-row`.
- `CrmDataCell` — `TableCell` ar `crm-table-body-cell`. Atbalsta `align`, `colSpan`.
- `CrmFilterInput` — shadcn `Input` ar `crm-filter-control border-0 shadow-none` (32px, 13px, vienots focus ring).
- `CrmFilterSelect` — shadcn `Select` + `SelectTrigger.crm-filter-control`. Props: `value`, `onValueChange`, `options: {value,label}[]`, `placeholder`, `allValue` (default `"__all__"`), `allLabel` (default `"Visi"`). Tukša vērtība = "visi".
- `CrmClearFiltersButton` — `<button class="crm-filter-control">` ar X ikonu. Rāda tikai ja `active`.

Stingri ievērojam:
- Tikai HTML `<table>` (caur shadcn `Table`). Nekur nelietojam `<div role="grid">`.
- Nekur nelietojam native `<select>`/`<input>` — tikai shadcn.
- Nekur netiek pielietoti lokāli `py-*`/`px-*` override; visi izmēri nāk no `crm-*` klasēm jau `src/styles.css`.
- Krāsas tikai caur `var(--tivo-navy*)` un `var(--crm-*)` tokeniem.

### 2. `src/routes/_crm-table-demo.tsx` (jauns, izolēta demo lapa)

Route ceļš `/_crm-table-demo` (underscore prefiksā nodrošina, ka tas nesakaras ar esošajām navigācijām). Lapa ir patstāvīga — neimportē neko no esošajām CRM lapām, neizmanto auth, neizmanto RPC.

Saturs (fake dati, ~8 rindas):
- `CrmPageActionsRow` ar pogu "Jauns ieraksts".
- Virsraksts "CRM DataTable demo".
- `CrmDataTable` ar `maxHeight={480}`:
  - Header row: `CrmSortableHead` kolonnām (ID, Lead, Statuss, Prioritāte, Termiņš, Atbildīgais, Darbība) + viena ne-sortēta darbības kolonna.
  - Filter row: `CrmFilterInput` (Lead meklēšana), `CrmFilterSelect` (Statuss, Prioritāte, Atbildīgais), `CrmClearFiltersButton` pēdējā šūnā.
  - Body:
    - **Badge piemēri** statusiem (Jauns, Aktīvs, Pauzēts, Pabeigts) — izmantojot esošo `Badge` un `crm-*` toņus.
    - **Priority** piemēri (Augsta = red soft, Vidēja = orange soft, Zema = navy soft) — `Tag` vai inline span ar TIVO soft fonu.
    - **Overdue date** piemēri: termiņš pagātnē — teksts `var(--tivo-red)`; <24h — `var(--tivo-orange)`; tālāks — neitrāls.
- Funkcionalitāte:
  - Sorting strādā uz lokāla `useState` ({key, dir}).
  - Filtrēšana caur `useState` (search string + 3 select).
  - Clear filters notīra visus 4 laukus.
  - Sticky header redzams, ritinot tabulu.

### 3. Aug./ieturēšana
- Demo lapa nav iekļauta nekādā navigācijā/menu. Piekļūstama tikai zinot URL.
- `routeTree.gen.ts` regenerējas automātiski no Vite plugin.

## Ko NEDARĪT

- Nepieskaras `src/routes/leadi.tsx`, `uzdevumi.tsx`, `iestatijumi.lietotaji.tsx`.
- Nepieskaras `src/styles.css`, `src/components/ui/*`, `src/components/crm/CrmLayout.tsx`.
- Nepieskaras auth, RPC, query hooks.
- Nepievieno jaunas CSS tokenu definīcijas — viss jau eksistē.

## Pārbaude pēc ieviešanas

- `/_crm-table-demo` ielādējas.
- Header un filter rinda — 40px; filtru kontroles 32px; body rindas ≥44px; teksts 13/14px.
- Sortēšana un filtrēšana strādā uz fake datiem.
- Sticky header paliek redzams ritinot.
- Esošās lapas vizuāli nemainās.
- Build/typecheck zaļš.
