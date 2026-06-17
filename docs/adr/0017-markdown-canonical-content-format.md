# Markdown is the canonical format for authored prose

## Status

Accepted — 2026-06-14

## Context

User- and agent-authored prose is stored and rendered inconsistently across the app. Three stacks coexist:

- **Markdown** — stored as markdown strings, displayed via `MarkdownRenderer` (react-markdown + remark-gfm), `SmartContentRenderer` (auto-detects HTML/MD/text), and a *third* private copy of markdown component mappings inside `ManyChat`. Used for project/ticket/feature descriptions, AI chat, blog, meeting summaries.
- **HTML / WYSIWYG** — Tiptap editors (`GoalDescriptionEditor`, `JournalForm`, `RichTextInput`, ticket modals) that emit sanitized HTML, displayed via `dangerouslySetInnerHTML` + DOMPurify.
- **Plain-text limbo** — raw text rendered with no markdown processing at all: goal/initiative **updates**, comments, replies (`ActivityComposer` → `ActivityFeed`), plus ~50 stray `<Textarea>` across settings/workflows.

The triggering bug: a goal update authored in markdown rendered as one undifferentiated blob, because `ActivityFeed` renders update content as a raw `<Text>{content}</Text>` ([ActivityFeed.tsx:302](../../src/app/_components/shared/ActivityFeed.tsx#L302)) — while the goal *description* directly above it, on the same page, renders rich text. The inconsistency is visible within a single feature.

The result is at least three renderers, two storage formats, and a pile of unrendered textareas — duplicated styling, an XSS surface wherever HTML is stored, and content that agents cannot reliably read or write.

## Decision

**Markdown is the single canonical stored format for authored prose.** HTML is legacy — tolerated on read, never newly written.

1. **Storage = markdown strings.** Everything authored by a user or an agent is stored as markdown.
2. **One canonical renderer.** `MarkdownRenderer` (keep the name — it has the most existing imports) is extended to be **HTML-tolerant** (detect HTML → sanitize + render; otherwise render markdown) and to take a **`variant: 'prose' | 'compact'`** prop. `prose` keeps today's article spacing (docs, blog, descriptions); `compact` tightens margins for chat, comments, updates, and cards. `SmartContentRenderer` becomes a thin deprecated re-export; `ManyChat`'s private markdown components fold into the shared set.
3. **One canonical input.** A new `MarkdownInput` — autosizing textarea, a small markdown toolbar, a **Write|Preview** toggle (preview renders via `MarkdownRenderer`), Cmd+Enter submit, paste/mention handling. It produces **markdown only**, never HTML. Existing plain textareas for prose (updates, comments) upgrade to it; Tiptap editors migrate to it over time.
4. **No big-bang data migration.** Existing HTML values keep rendering via the tolerant read path. When a user opens an old HTML document in `MarkdownInput`, it is converted HTML→markdown once (turndown) and saved back as markdown — so HTML fades out lazily on edit rather than via a risky bulk prod rewrite.
5. **Enforcement, three layers** (matching the hardcoded-color precedent):
   - **ESLint** — ban direct `react-markdown` imports and `dangerouslySetInnerHTML` *outside* the canonical components, forcing everyone through `MarkdownRenderer`/`MarkdownInput`.
   - **Docs** — `dev-docs/CONTENT_RENDERING.md` is the single source of truth, pointed to from `CLAUDE.md` so every coding agent loads it.
   - **/pr-review** — a checklist line: prose input/display uses `MarkdownInput`/`MarkdownRenderer`.

## Considered alternatives

- **HTML / WYSIWYG everywhere (Tiptap, store sanitized HTML).** Rejected: agents can't easily emit HTML (chat and extraction already produce markdown), it's not diffable/greppable, and it keeps an XSS sanitize-everywhere surface. The nicest WYSIWYG UX did not outweigh agent-friendliness and portability.
- **Keep both formats, define per-field boundaries.** Rejected: the dual-format complexity is permanent, agents still hit HTML fields, and "which field is which format" is a rule that gets forgotten.
- **Tiptap serialized to markdown (tiptap-markdown).** Rejected as the canonical input: lossy MD↔HTML round-trips (tables, nested lists, code fences), heavier bundle, and pasting raw markdown is awkward — for a small win over a textarea + preview.
- **One-time backfill migration (turndown all HTML columns now).** Rejected: a bulk prod data rewrite is risky, conversions are lossy and permanent, and per repo policy migrations are sensitive. Lazy convert-on-edit reaches the same end state without the blast radius.

## Consequences

- `MarkdownRenderer` gains a `variant` prop and an HTML-detection read path; `SmartContentRenderer` and `ManyChat`'s markdown components are consolidated into it.
- New `MarkdownInput` component; prose textareas (updates, comments, replies) and Tiptap editors migrate to it incrementally.
- Two read paths (HTML-tolerant + markdown) live simultaneously until HTML content is fully aged out by edits — accepted, and the reason the tolerant renderer exists.
- New ESLint rule, `dev-docs/CONTENT_RENDERING.md`, a `CLAUDE.md` pointer, and a /pr-review checklist item.
- **CONTEXT.md is intentionally not touched** — markdown rendering is an implementation detail, not domain-expert language.
