# Daily summary is a structured digest rendered per channel family

Status: accepted — 2026-09-09

The redesigned **Daily summary** carries links (recordings, tickets, `/today`)
and numbered lists. The notification pipeline ([ADR-0045](0045-unified-notification-dispatch.md))
hands every channel one `message` string, and only the Matrix gateway renders
markdown (it posts `formatted_body` HTML); email drops the string raw into its
template, push and WhatsApp are plain text. So one string cannot be both
"rich in Matrix" and "readable everywhere else".

We decided: the digest builder produces a **structured object** (sections,
items, absolute links) and two renderers produce channel text from it — a
**markdown** renderer for Matrix and a **plain-text** renderer (bare URLs,
which most clients auto-link) for everything else. `message` on the
notification stays the plain-text rendering, so every existing channel keeps
working unchanged; the markdown rendering rides in the notification's
`metadata` and the Matrix channel prefers it when present. The pipeline
contract is otherwise untouched: one Notification row, one dedup key, one
Summary category.

## Considered options

- **Markdown everywhere** — rejected: email shows literal brackets and
  collapsed line breaks; push previews fill with URL syntax.
- **A Matrix-only summary, leaving the old template for other channels** —
  rejected: two digests that drift apart, and the old one carried a private
  third definition of "today" we are retiring (see ADR-0034 amendment).
- **Per-channel templates inside each channel service** — rejected: channels
  would need to know the digest's shape; the renderer belongs next to the
  builder, and the "rich variant in metadata" seam works for any future
  category that wants it.

## Consequences

- Channel services never format digest content; they pick a variant.
  A future rich channel (Slack blocks, Zulip markdown) adds a renderer, not a
  template fork.
- `metadata.markdown` becomes a soft convention for "rich variant present";
  channels that ignore it get plain text and are still correct.
- The digest's **scope** (workspace, products) derives from
  `User.defaultWorkspaceId`, deliberately not a new preference — revisit only
  if a user asks for a summary workspace different from their default.
- Recorded **Meeting** ↔ calendar-event matching is a heuristic (time overlap
  ±15 min, title-word tie-break) held only inside the builder; no link is
  persisted. If a real link is ever stored on `TranscriptionSession`, the
  heuristic becomes a fallback.
- The cycle hero computation moves out of `product.getOverview` into a shared
  service so the page and the summary cannot disagree (the one-source-of-truth
  pattern of ADR-0007 / ADR-0034).
