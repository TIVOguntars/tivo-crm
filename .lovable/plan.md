# Lead360 Timeline — Restore Existing Timeline as Primary, Make UnifiedTimeline Additive

## Problem

In `src/routes/lead.$leadId.tsx` the "Aktivitātes" panel currently renders `<UnifiedTimeline>` **as a replacement** when `unifiedAvailable === true`:

```tsx
{unifiedAvailable ? (
  <UnifiedTimeline leadId={leadId} onUnavailable={() => setUnifiedAvailable(false)} />
) : timeline.length === 0 ? (
  <Empty />
) : (
  <ol> {timeline.map(...)} </ol>   // existing rich renderer (comms, notes, tasks, workflow, automation)
)}
```

The existing `timeline` already aggregates communications, notes, completed tasks, workflow items, automation/audit info — so swapping it for `UnifiedTimeline` makes older activity sources disappear from the UI.

## Fix (frontend only)

Restore the existing timeline as the **primary, always-rendered** source. Render `UnifiedTimeline` as an **additive supplemental section below it**, never as a replacement.

### Exact rendering change

Replace the conditional block inside the `Aktivitātes` `<Panel>` with:

```tsx
<Panel title="Aktivitātes" count={timeline.length}>
  {/* PRIMARY: existing local timeline — full historical sources
      (communications, notes, completed tasks, workflow completion items,
      automation items, audit events). Always rendered. */}
  {timeline.length === 0 ? (
    <Empty />
  ) : (
    <ol className="relative space-y-2 max-h-[640px] overflow-auto pr-2">
      {timeline.map((it) => { /* unchanged existing renderer */ })}
    </ol>
  )}

  {/* ADDITIVE: unified timeline (crm.v_unified_timeline).
      Supplemental only — never hides or replaces the primary timeline.
      Hidden silently when the view is unavailable or empty. */}
  {unifiedAvailable && (
    <div className="mt-6 pt-4 border-t">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-2">
        Vienotā laika līnija (papildus)
      </div>
      <UnifiedTimeline
        leadId={leadId}
        onUnavailable={() => setUnifiedAvailable(false)}
      />
    </div>
  )}
</Panel>
```

Key points:
- Existing `timeline` renderer is kept **byte-identical** — no logic removed, no branches changed.
- `UnifiedTimeline` is rendered **after** the primary list, under a divider with a clear "papildus" label so users understand it is supplemental.
- If `v_unified_timeline` is unavailable, `onUnavailable` flips `unifiedAvailable` to `false` and the supplemental block disappears; the primary timeline is unaffected.
- If `v_unified_timeline` is empty, `UnifiedTimeline` already renders its own empty state inside the supplemental block — primary timeline still fully visible above.

### Files changed
- `src/routes/lead.$leadId.tsx` — only the JSX inside the `Aktivitātes` `<Panel>` (around lines 1108–1117). No other edits.

### Not touched
- `src/components/UnifiedTimeline.tsx`
- `src/server/analytics.ts` (whitelist for `v_unified_timeline` stays)
- `timeline` `useMemo` and all kind-specific renderers (`comm`, `note`, `task`, workflow/automation branches)
- DB, views, RPCs, workflow engine, backend

### Verification checklist
- Old timeline renders fully on a lead with historical communications + notes + completed tasks, even when `v_unified_timeline` returns rows.
- Workflow completion items, automation items, and audit events still appear (they come through `timeline`, untouched).
- When `v_unified_timeline` is missing/errors, supplemental section disappears; primary timeline unchanged.
- When both are empty, panel shows the existing `<Empty />` state.

### Returned answers (per request)
- **Exact rendering logic used:** primary `<ol>{timeline.map(...)}</ol>` always rendered; `<UnifiedTimeline>` rendered below in an additive `<div className="mt-6 pt-4 border-t">` block, gated only by `unifiedAvailable`.
- **Old timeline restored:** yes, as primary and always-on.
- **UnifiedTimeline additive only:** yes, supplemental section below the primary list, never replaces it.
