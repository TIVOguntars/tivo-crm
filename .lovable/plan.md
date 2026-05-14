# Leadi: no-grouping + AND-tags operator

Frontend-only changes in `src/routes/leadi.tsx`. No DB changes.

## 1. Allow no grouping

Today line 737 forces `["status"]` whenever `gby` is empty, so the URL state `g=[]` cannot mean "ungrouped". The toolbar control also hardcodes "Statuss" as the empty-state label and never lets the user remove the last level.

Changes:

- **Default vs explicit-empty**: introduce a sentinel so we can distinguish "no `gby` param at all" (use default `["status"]`) from "user explicitly cleared it" (`gby=[]` → flat list).
  - Read raw `search.gby` directly. If the URL key is missing, treat as `["status"]` (preserves current default for "Visi leadi"). If it is present and empty, treat as `[]`.
  - Easiest implementation: change the schema fallback for `gby` to `undefined`, then `const gby = search.gby ?? ["status"];`. URL with `gby=[]` stays empty.
- **Group tree**: when `gby.length === 0`, skip `build()` and render `sorted` as a single flat node (or bypass `GroupTree` entirely and render rows directly). The existing `_leaf` branch already handles a single flat bucket, so passing `[]` to `build()` already returns one leaf node — we just need the header to not render for the synthetic root. Easiest: render flat rows when `gby.length === 0` instead of using `GroupTree`.
- **Toolbar label** (line 2173): `display = value.length === 0 ? "Bez grupēšanas" : labels`.
- **Popover body** (line 2208–2230):
  - When `value.length === 0`, show only an "Add level" button (no L1 row prefilled with status).
  - Always allow removing the last remaining level (drop the `value.length > 0` guard on the "— noņemt līmeni —" option, or add a small × button per row).
  - Add explicit "Bez grupēšanas" action that calls `onChange([])`.
- **Saved-views interaction**: `view="all"` keeps default `["status"]` only because `gby` is unset. Switching to no grouping writes `gby=[]` to URL — view stays `all`, default kicks in only when param is absent.
- **clearAll** (line 1149): keep `gby: []` (already empty) — but since empty now means "no grouping", users who hit "Notīrīt" land on flat view. Acceptable per spec ("user must be able to switch to no grouping"), and matches the new semantics.

## 2. Tags filter: `satur visus` (AND)

Field `tags` currently supports `is_any_of`, `is_none_of`, `is_empty`, `is_not_empty` (line 329).

Changes:

- **Operator catalog** (line 329): add `"contains_all"` to the tags operator list.
- **Operator label** (line 347 region): add `contains_all: "satur visus"`.
- **Evaluator** (around lines 376–399): add a new branch:
  ```
  case "contains_all": {
    if (def.type !== "tags") return false; // only valid for tags
    const arr = (def.get(l) as string[]).map((x) => x.toLowerCase());
    const want = (val as string[]).map((t) => t.toLowerCase());
    return want.every((t) => arr.includes(t));
  }
  ```
- **FilterRule type / op union**: extend the operator string union to include `contains_all` so the schema and TS types accept it.
- **FilterRuleRow UI**: the value editor for tags already renders a multi-select for `is_any_of` / `is_none_of`; reuse the same editor for `contains_all` (no UI change needed beyond the operator dropdown picking it up automatically).
- **Existing rules** unchanged: `is_any_of` keeps OR semantics, `is_none_of` keeps "exclude if any selected tag exists".

## Acceptance

- Toolbar shows "Bez grupēšanas" when no levels selected; rows render flat without group headers; URL has `gby=[]` (or no `g` param after future stripping).
- Default load of "Visi leadi" still groups by Statuss.
- Tags filter dropdown shows new "satur visus"; selecting 2 tags returns only leads having both; 3 tags → all 3 required.
- `is_any_of` / `is_none_of` behavior unchanged.
