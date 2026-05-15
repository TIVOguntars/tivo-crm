## Findings

**Source of activity feed:** `crm.get_lead_360_profile` RPC → `profile.communications[]`. This array currently exposes only:

```
id, body, status, channel, subject, provider, direction, created_at, provider_message_id
```

There is no `body_html`, no `raw_data`, no `metadata` in the RPC payload — that is why the modal can never find HTML.

**Where the HTML actually lives:** I queried `crm.communications` directly. Each IMAP email row has a `raw_payload` JSON column with the full MIME data:

```
raw_payload.html_body   ← the real formatted HTML
raw_payload.cc / bcc / source / ...
```

For the test email `8edb1b4b-...` the `html_body` starts with `<html xmlns:v=...>` (full Outlook MIME), confirming HTML is stored, just not exposed by the RPC.

**Conclusion:** the RPC is the bottleneck. The fix is frontend only — we don't need a backend change because `crm.communications` is already in `CRM_VIEWS` and selectable via `fetchCrmView`.

## Plan

1. **Batch-fetch raw payloads for the current lead** alongside the 360 RPC, in `src/routes/lead.$leadId.tsx`:

   ```ts
   const commPayloadsQ = useCrmView(
     "communications",
     `select=id,raw_payload&lead_id=eq.${leadId}&channel=eq.email`,
     { all: true },
   );
   ```

   Build a `Map<id, raw_payload>` memo so the modal can look up the HTML in O(1) without a per-click round trip.

2. **Pick the HTML in resolution order** when the modal opens:
   1. `raw_payload.html_body` (and aliases: `raw_payload.html`, `raw_payload.body_html`, `raw_payload.content_html`) from the map keyed by activity id
   2. inline `body_html` / `html` / `html_body` / `content_html` on the activity itself (future-proof if RPC starts exposing it)
   3. plain `body` / `body_text` / `content` / `preview` / `body_preview` / `summary`
   4. fall back to `subject`, else "Nav satura."

3. **Sanitize before render** with the existing `isomorphic-dompurify` import (already added). Strip `<script>`, inline event handlers, and disallowed protocols. Keep `<a target>` and add `rel="noopener noreferrer"` via a DOMPurify hook so links are safe.

4. **Render** sanitized HTML inside the existing modal container with `prose prose-sm` styling — no layout change, no new components. Plain-text branch keeps the current `<pre>` block.

5. **Diagnostic log** (only when an email activity has neither raw_payload HTML nor inline HTML):

   ```
   console.warn("No HTML body found for email activity", id, Object.keys(rawForId ?? {}), Object.keys(activity))
   ```

   Logged once per activity open, not per render.

6. **Non-email channels** (call, sms, whatsapp, note) keep the current plain-text path — no behaviour change.

## Files touched

- `src/routes/lead.$leadId.tsx` — add `commPayloadsQ`, build the lookup map, refactor the modal body resolution + sanitize call, add the diagnostic warn.

No backend, schema, RPC, or DB changes required.
