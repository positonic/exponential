# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

This repo is **single-context** — one `CONTEXT.md` and one `docs/adr/` directory at the repo root cover the whole Next.js application.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root (when it exists).
- **`docs/adr/`** at the repo root — read ADRs that touch the area you're about to work in.

If any of these files don't exist yet, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The producer skill (`/grill-with-docs`) creates them lazily when terms or decisions actually get resolved.

## File structure

```text
/
├── CONTEXT.md            ← glossary + domain model (created lazily)
├── docs/adr/             ← architectural decisions (created lazily)
│   ├── 0001-...md
│   └── 0002-...md
└── src/
```

If at some point this repo grows into a multi-context layout (e.g. distinct frontend/backend/marketing surfaces with their own glossaries), the convention is:

- Add `CONTEXT-MAP.md` at the repo root pointing at per-context `CONTEXT.md` files
- Place per-context ADRs under `src/<context>/docs/adr/`
- System-wide ADRs stay in `docs/adr/`

Until that happens, treat this as a single-context repo.

## Use the glossary's vocabulary

When your output names a domain concept (in a ticket title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/grill-with-docs`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders) — but worth reopening because…_
