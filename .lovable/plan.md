## Mērķis

Padarīt PPV bloka attālumu līdz "Vārds" paredzamu un kontrolējamu, neatkarīgi no `justify-between` radītās atstarpes.

## Izmaiņas (tikai `src/routes/lead.$leadId.tsx`, header sadaļa ~rindas 375–430)

1. **Izņemt PPV bloku no labās grupas** (pašlaik rindas 408–429 — `<div className="hidden md:flex ... ml-[-17px]">` ar PPV + Prioritāte + Pēdējā aktivitāte).

2. **Pārvietot to kreisajā grupā** (rindas 377–405) — ievietot kā jaunu `<div>` blakus Vārds/statuss blokam, ar fiksētu atstarpi, piem. `ml-6` (24px) no Vārds bloka.

3. **Noņemt `ml-[-17px]`** — vairs nav vajadzīgs, jo atstarpi tagad nosaka pozīcija kreisajā grupā ar parastu `ml-*` vai `gap-*`.

4. **Saglabāt iekšējo struktūru** PPV / Prioritāte / Pēdējā aktivitāte blokam — tikai mainās tā vecāka konteiners.

5. **Labajā grupā** paliek tikai darbības pogas (zvana, e-pasta utt.) — `lg:justify-between` joprojām strādā, atdalot virsraksta+PPV bloku no pogu bloka.

## Tehniskās detaļas

- Kreisās grupas konteiners (`<div className="flex items-center gap-3 min-w-0">`) jāmaina, lai pieņem PPV bloku kā sibling.
- `min-w-0` un `truncate` uz `<h1>` jāsaglabā, lai garš vārds neizjauc layout.
- Mobilajā (`md:` zemāk) PPV joprojām paslēpts (`hidden md:flex`).
- Atstarpi starp Vārds un PPV var precīzi noregulēt ar `ml-6` / `ml-8` / `ml-12` pēc vajadzības.

## Rezultāts

PPV bloks atrodas ~24px pa labi no Vārds, neatkarīgi no ekrāna platuma. Turpmāk attālumu var mainīt ar vienu klasi.
