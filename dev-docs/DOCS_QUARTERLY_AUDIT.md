# Quarterly docs audit

Once a quarter the docs get read against the product, so they stay true. The
`Quarterly docs audit` workflow (`.github/workflows/docs-quarterly-audit.yml`) opens an
Exponential ticket for it on the first day of January, April, July and October, with this
checklist and the result of `docs:check` on `main`. Anyone (or an agent) can pick it up;
record what you find as comments on the ticket, and fix things in ordinary docs PRs.

## Checklist

1. **Guardrails.** `npm run docs:check` passes on `main` (the ticket says whether it did).
2. **Quickstart walk-through.** Follow `/docs/quickstart` step by step in the `dev-fixture` workspace (`npm run dev:seed-fixture` + `npm run dev:session`, see `dev-docs/AGENT_VISUAL_TESTING.md`). Every control it names must exist and behave as written.
3. **Screenshots.** `npm run docs:screenshots`, then look at what changed in `public/doc-assets/`. A changed image means the screen changed: reread the page that uses it.
4. **Generated pages.** `npm run docs:cli` (from an up-to-date exponential-cli checkout) and `npm run docs:whats-new`. Commit the results.
5. **Sidebar vs docs.** Compare the app's sidebar (`src/lib/navLayout.ts`), settings tabs and plugin list with the docs' Introduction, Concepts and Reference pages. New areas need a page or a ticket for one; retired ones get their page removed, with a redirect in `content/docs/_redirects.json`.
6. **Prune.** Any page describing a feature that no longer exists: delete or rewrite it.
7. **"Not yet" claims.** Search the docs for "not yet" and check each against the app; remove the ones that shipped.
8. **Close out.** Comment what changed, link the PRs, and move the ticket to Done.
