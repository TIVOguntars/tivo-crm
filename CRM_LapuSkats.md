# LOVABLE — OBLIGĀTI IEVIEŠAMS

# TIVO CRM DESIGN SYSTEM v1

## STATUSS

Šis dokuments ir:

* vienīgais atļautais CRM UI standarts;
* obligāti ievērojams visās jaunajās CRM lapās;
* obligāti ievērojams visos jaunajos shared komponentos;
* obligāti ievērojams visās migrācijās.

Šis NAV “ieteikums”.
Šis ir sistēmas līmeņa standarts.

---

# 0. IEVIEŠANAS NOTEIKUMI

## 0.1. Nekad vairs:

* nelabot produkcijas lapas tieši;
* neveidot “ātrus UI fix”;
* neveidot route-level table layout;
* neveidot lokālus UI izņēmumus;
* neveidot atsevišķus table variantus.

---

## 0.2. Obligātais process

Pirms UI ieviešanas:

1. Audit
2. Design decision
3. Shared component
4. Demo page
5. Approval
6. Migration

Aizliegts:

* uzreiz modificēt `/leadi`
* uzreiz modificēt `/uzdevumi`
* uzreiz modificēt `/iestatijumi/*`

---

# 1. DIZAINA FILOZOFIJA

## 1.1. CRM ≠ marketing UI

CRM interfeiss:

* nav dekoratīvs;
* nav dashboard showcase;
* nav consumer SaaS;
* nav animation-first UI.

CRM prioritātes:

1. Lasāmība
2. Datu skenējamība
3. Darba ātrums
4. Konsekvence
5. Zems vizuālais troksnis

---

## 1.2. Light-first enterprise UI

Dominē:

* gaiši toņi;
* soft surfaces;
* mierīgi kontrasti;
* plānas robežas;
* semantiski akcenti.

Aizliegts:

* neon krāsas;
* pilni sarkani bloki;
* dark dashboards;
* agresīvi badge;
* consumer gradients.

---

## 1.3. Viena patiesības sistēma

Visi UI izmanto:

* kopīgus tokenus;
* shared primitives;
* shared layout;
* shared table architecture.

Aizliegts:

* inline krāsas;
* route-level styling;
* random radius;
* py-/px- override;
* hardcoded hex route failos.

---

# 2. LAYOUT SISTĒMA

## 2.1. Spacing standarts

| Elements             | Spacing |
| -------------------- | ------- |
| Header → action row  | 20px    |
| Action row → banners | 20px    |
| Banner row → toolbar | 20px    |
| Toolbar → table      | 12px    |

---

## 2.2. Content container

Visas CRM lapas:

* centered;
* vienots max-width;
* vienots horizontal padding;
* vienots vertical rhythm.

---

# 3. ACTION ROW SISTĒMA

## 3.1. Positioning

Action row:

* vienmēr virs tabulas;
* vienmēr pirmā satura rinda;
* vienmēr aligned right.

---

## 3.2. Allowed actions

| Action   | Icon          |
| -------- | ------------- |
| Jauns    | Plus          |
| Atvērt   | Eye           |
| Rediģēt  | Pencil        |
| Dzēst    | Trash         |
| Zvans    | Phone         |
| E-pasts  | Mail          |
| WhatsApp | MessageCircle |
| Uzdevums | CheckSquare   |
| Vēsture  | History       |

---

## 3.3. Table actions

Tabulās:

* tikai icon buttons;
* nekad text buttons;
* tooltip obligāts.

---

# 4. BANNER SISTĒMA

## 4.1. Banner row

Banneri:

* tikai viena rinda;
* max 8;
* nekad ne-wrapojas.

---

## 4.2. Banner height

Banner height:

* 2x action row height.

---

# 5. TABULU SISTĒMA

# 5.1. Vienīgā atļautā arhitektūra

```tsx
<CrmDataTable>
  <CrmDataTableHeader />
  <CrmDataTableFilterRow />
  <CrmDataTableBody />
</CrmDataTable>
```

---

# 5.2. Aizliegtā arhitektūra

Aizliegts:

* `div role="grid"`
* native select
* native input
* inline sticky
* lokāli table layout
* route-level table styling

---

# 5.3. Tabulu dimensijas

| Elements        | Height  |
| --------------- | ------- |
| Header row      | 40px    |
| Filter row      | 40px    |
| Filter controls | 32px    |
| Dense row       | 52px    |
| Rich row        | 64–72px |

---

# 5.4. Header hierarchy

## Header row

* uppercase;
* 600 font-weight;
* navy-soft;
* slightly darker than filter row.

## Filter row

* tā pati tonalitāte;
* bez separator līnijas;
* white controls.

---

# 5.5. Sticky behavior

Sticky:

* action row;
* banner row;
* toolbar row;
* table header row;
* table filter row.

Scroll:

* tikai body rows.

---

# 6. FILTER SISTĒMA

## 6.1. Filter controls

Obligāti:

* white background;
* 6px radius;
* vienots height;
* vienots focus ring.

---

## 6.2. Clear filters

Ja aktīvs vismaz 1 filtrs:

* parādās X poga;
* notīra visus filtrus.

---

# 7. HOVER / FOCUS SISTĒMA

## 7.1. Row hover

Hover:

* viegls navy-soft overlay.

---

## 7.2. Selected row

Selected:

* left accent border;
  VAI
* soft selected background.

---

## 7.3. Focus state

Visiem inputiem:

* vienota focus sistēma.

---

# 8. TYPOGRAPHY

## 8.1. Font

Globāli:

* Open Sans

---

## 8.2. Sizes

| Usage         | Size           |
| ------------- | -------------- |
| Table body    | 13px           |
| Metadata      | 12px           |
| Header labels | 12px uppercase |
| Page title    | 28–32px        |

---

# 9. RADIUS SISTĒMA

| Elements        | Radius |
| --------------- | ------ |
| Filter controls | 6px    |
| Cards           | 10px   |
| Badges          | pill   |
| Buttons         | 8px    |

---

# 10. SEMANTIC STATUS SYSTEM

# 10.1. Lead Status

| Status         | Tonis            |
| -------------- | ---------------- |
| Jauns          | neutral blue     |
| Piesaistīšana  | info cyan        |
| Kvalificējas   | teal             |
| Aktīvs         | green            |
| Klients        | deep green       |
| Nesasniedzams  | amber            |
| Nekvalificējas | dark muted gray  |
| Arhivēts       | light muted gray |

---

# 10.2. Object Status

| Status       | Tonis           |
| ------------ | --------------- |
| Pieprasījums | blue            |
| Rasējumi     | indigo          |
| Piedāvājums  | cyan            |
| Pārrunas     | teal            |
| Līgums       | green           |
| Realizācija  | emerald         |
| Pabeigts     | gray-green      |
| Atlikts      | amber           |
| Atcelts      | dark muted gray |

---

# 11. PRIORITY SISTĒMA

| Priority | Tonis       |
| -------- | ----------- |
| High     | soft red    |
| Medium   | soft orange |
| Low      | soft navy   |

---

# 12. DEADLINE SISTĒMA

| State       | Tonis      |
| ----------- | ---------- |
| >3d overdue | muted red  |
| today       | amber      |
| future      | neutral    |
| completed   | muted gray |

---

# 13. BADGE SISTĒMA

Badge:

* soft background;
* bez neon;
* bez pure red;
* bez pilna kontrasta.

---

# 14. KPI SISTĒMA

KPI kartes:

* minimāls troksnis;
* prioritāte ciparam;
* bez piesātinātiem background.

---

# 15. KRĀSU POLITIKA

Visas krāsas:

* tikai caur TIVO tokens;
* tikai semantic mapping;
* nekādi hardcoded hex route failos.

---

# 16. AIZLIEGTIE PATTERNI

Aizliegts:

* inline colors;
* py-/px- override;
* random hover;
* random radius;
* consumer gradients;
* neon alerts;
* text buttons tabulās.

---

# 17. SCROLL SISTĒMA

## 17.1. Galvenais princips

Nekad:

* visa lapa nedrīkst scrollēties vertikāli.

Vertikālais scroll:

* tikai table body.

---

## 17.2. Sticky zonas

Vienmēr iesaldēti:

1. page header
2. action row
3. banner row
4. grouping/filter toolbar
5. table header row
6. table filter row

---

## 17.3. Tehniskā arhitektūra

```css
page-shell: height: 100vh
content: flex-column
table-container: flex:1
table-body: overflow-y:auto
```

---

## 17.4. Aizliegts

Aizliegts:

* body scroll;
* dubults scroll;
* disappearing toolbar;
* scrollējošs header.

---

# 18. KOLONNU PLATUMU SISTĒMA

## 18.1. Galvenais princips

Kolonnas:

* minimāli nepieciešamais platums;
* minimālas atstarpes;
* viena elastīgā kolonna.

---

## 18.2. Elastīgā kolonna

Parasti:

* Lead
* Name
* Description
* Title

Šī kolonna:

* aizņem atlikušo platumu.

---

## 18.3. Piemēri

| Kolonna   | Platums     |
| --------- | ----------- |
| Checkbox  | 36px        |
| PPV / ID  | 56–72px     |
| Status    | min-content |
| Priority  | min-content |
| Deadline  | 110–130px   |
| Actions   | fixed       |
| Lead/Name | flex        |

---

## 18.4. Aizliegts

Aizliegts:

* vienādi width visām kolonnām;
* platas status kolonnas;
* platas action kolonnas;
* lieli tukšumi starp kolonnām.

---

# 19. OBLIGĀTĀ MIGRĀCIJAS PIEEJA

Esošās lapas:

* nemodificēt haotiski;
* nemēģināt “pielabot”.

Pareizā pieeja:

1. shared primitive
2. demo page
3. approval
4. isolated migration
5. validation
6. rollout

---

# 20. VIENĪGĀ PIEĻAUJAMĀ ATTĪSTĪBAS PIEEJA

Ja rodas jautājums:

* neinterpretēt;
* neizgudrot;
* nehalucinēt.

Obligāti:

1. auditēt esošo;
2. uzdot secīgus jautājumus;
3. izstrādāt sistēmu;
4. tikai tad ieviest.
