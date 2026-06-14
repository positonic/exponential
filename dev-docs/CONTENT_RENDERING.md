# Content rendering — the single Markdown stack

**Markdown is the one canonical format for authored prose in this app.** Decision: [ADR-0017](../docs/adr/0017-markdown-canonical-content-format.md).

If you are about to render or accept user/agent-authored text (a description, an update, a comment, a chat message, notes, a body), use the two canonical components below. Do **not** reach for `react-markdown`, `dangerouslySetInnerHTML`, Tiptap, or a bare `<Textarea>` for prose.

## TL;DR

| You need to… | Use | Import from |
|---|---|---|
| **Display** prose | `<MarkdownRenderer content={…} variant="prose\|compact" />` | `~/app/_components/shared/MarkdownRenderer` |
| **Accept** prose input | `<MarkdownInput value onChange … />` | `~/app/_components/shared/MarkdownInput` |
| Classify a stored string | `detectContentType(content)` | `~/lib/content/contentFormat` |

## Display — `MarkdownRenderer`

The canonical renderer. Markdown by default; **legacy HTML is tolerated on read** (detected and sanitised with DOMPurify) so old Tiptap content keeps rendering. Server-capable — the markdown path renders in RSC pages; the only client-only piece (image lightbox) is isolated in `MarkdownImage`.

```tsx
// Long-form surfaces: docs, blog, descriptions, retros
<MarkdownRenderer content={doc} variant="prose" />

// Dense surfaces: activity feed, comments, chat bubbles, cards
<MarkdownRenderer content={update.content} variant="compact" />

// Comments/replies — mention badges + owner image delete
<MarkdownRenderer
  content={comment.content}
  variant="compact"
  mentionNames={mentionNames}
  onDeleteImage={(url) => removeImage(comment.id, url)}
/>
```

Props: `content`, `variant` (`"prose"` default | `"compact"`), `mentionNames?` (render `@[Name](id)` as badges), `onDeleteImage?` (owner-only delete on compact image lightbox), `className?`.

- **`prose`** keeps article spacing (large headings via Mantine `Title`, anchor links). Use on whole-page reading surfaces.
- **`compact`** tightens spacing, shrinks headings, and enables soft line breaks (textarea newlines → `<br>`). Use anywhere embedded in a card/feed/chat.

## Input — `MarkdownInput`

Autosizing textarea + formatting toolbar (bold/italic/list/link) + a **Write|Preview** toggle (preview = `MarkdownRenderer` compact). **Always emits Markdown, never HTML.** Controlled: the parent owns `value`.

```tsx
<MarkdownInput
  value={value}
  onChange={(next, cursorPos) => setValue(next)}
  placeholder="Write an update…"
  mentionNames={mentionNames}
/>
```

For comments use `CommentInput`, which composes `MarkdownInput` and adds @mention autocomplete + image paste + Cmd+Enter + a send button. For the OKR activity composer use `ActivityComposer`.

## Internals (don't reinvent)

- `~/lib/content/contentFormat.ts` — `detectContentType()` (html/markdown/text) and (later) `htmlToMarkdown()`.
- `~/lib/content/remarkMentions.ts` — turns `@[Name](id)` into mention badges (handles the Markdown-link collision).
- `~/lib/content/remarkSoftBreaks.ts` — soft line breaks for compact surfaces.
- `~/app/_components/shared/MarkdownImage.tsx` — client image lightbox for compact.

## Migration note (HTML → Markdown)

New writes are always Markdown. Existing HTML (legacy Tiptap fields) renders via the tolerant read path and is converted to Markdown lazily **on edit** (`htmlToMarkdown`). There is no bulk data migration — see ADR-0017.

## Reviewer / agent checklist

When reviewing or writing a change that touches prose input or display, confirm:

- [ ] Prose **display** uses `MarkdownRenderer` (correct `variant`) — not `react-markdown` directly, not `dangerouslySetInnerHTML`, not raw `<Text>{content}</Text>`.
- [ ] Prose **input** uses `MarkdownInput` / `CommentInput` — not a bare `<Textarea>`. (Non-prose textareas — API keys, JSON config, search — are exempt.)
- [ ] No **new** Tiptap editor or HTML-producing input was introduced.
- [ ] New content is stored as **Markdown**; any HTML touched is converted on edit, not written fresh.

A lint rule enforces the mechanical half (no direct `react-markdown` import / `dangerouslySetInnerHTML` outside the canonical components). The textarea-for-prose case is a human/agent judgement call — hence this checklist.
