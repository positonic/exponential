# Outcomes are deprecated and removed from the product; the table stays

## Status

Accepted — 2026-08-07

## Context

`model Outcome` entered the codebase as "Daily Outcomes", imported from Exponential's own Startup Routine docs. It never earned a place in the domain: it had no [CONTEXT.md](../../CONTEXT.md) glossary entry, and sat *beside* the Objective(**Goal**)/**Key result** vocabulary rather than inside it — `description`, `dueDate`, `type @default("daily")`, `whyThisOutcome`, bridging Goals↔Projects via two implicit many-to-many relations.

CONTEXT.md carried it as a flagged ambiguity for months. The owner's read was that an Outcome is "most akin to a milestone", while the recursion it was reached for (goals-of-goals) was already served by `Goal.parentGoalId`. It was deliberately excluded from the iOS voice v1 scope pending a milestone-vs-objective decision that never came. [`welcome.ts`](../../src/server/api/routers/welcome.ts) carried a `TODO(outcomes-removal)` instructing onboarding not to route through Outcomes.

Meanwhile the concept had metastasised: 28 `api.outcome.*` call sites across 17 frontend files, ~2,000 LOC of dedicated components, and Outcome-derived signal threaded into search, AI scheduling, weekly-review highlights, onboarding progress, and the agent's `get_project_context` payload — while `/outcomes` itself was already orphaned from every navigation surface (no sidebar, no mobile nav, no topbar; reachable only via two alignment cards, the command palette, or a typed URL). Two dedicated components were already dead code. The schema had rotted in place too: `Outcome.projectId` was a dangling scalar with no foreign key that nothing ever wrote, and there was no `OutcomeType` enum — only a Zod enum in the router.

## Decision

1. **Remove the concept from the product entirely.** Delete the `outcome` tRPC router, `outcomeService`, both `/outcomes` routes, and all eleven dedicated components. Excise Outcome-derived signal from `goal`/`project`/`search`/`scheduling`/`user`/`workspace`/`portfolioReview`/`mastra` routers, `goalService`, `WeeklyReviewSummaryService`, `projectTools`, the access `ResourceType` union, the test factory, and the demo seed.
2. **`model Outcome` stays in `prisma/schema.prisma`**, with its `User`/`Workspace`/`Goal`/`Project` relations intact. No migration is written; no rows are dropped.
3. **Measurable progress on a Goal is a Key result.** Copy, docs, and onboarding that reached for "outcome" now say *goal*, *key result*, or *priority* as appropriate.
4. **The team-planning `WeeklyOutcome` model is a separate entity and survives** — but its user-facing vocabulary becomes **Weekly commitment**, so the word "Outcome" disappears from the product surface. The model name, tRPC procedures, and the `?tab=weekly-outcomes` URL slug are unchanged (renaming the slug would break existing links for no user benefit).
5. **`OutcomeTimeline` is renamed `ProjectTimeline`, not deleted.** Despite the name it merged goals, completed actions, and outcomes into a project timeline; only the outcome lane was removed.

## Consequences

- Anything reading `outcomes` off a project or goal payload now gets nothing. The `../mastra` agents repo serialises `project.outcomes` in `getAllProjectsTool` / `get_project_context`; those fields are optional there and degrade to empty, but the tool descriptions still advertise outcomes and should be cleaned up separately.
- `exponential-sdk`'s search type union and `exponential-cli`'s search label map still list `outcome`. Harmless — the server no longer returns that type — but stale.
- Search results, the AI scheduling prompt, weekly-review Slack highlights, and the "Today's Focus Set" state on the home page all lose an input. The scheduling prompt's `closestOutcomeDeadline` heuristic is gone outright; `AiNextBestStep` no longer short-circuits to a "focused" card and always renders the AI suggestion.
- Onboarding's `steps.hasOutcome` is removed. It had no consumer.

## Alternatives rejected

- **Define the concept properly and keep it.** Rejected: two years of the table existing without anyone being able to say what it *is* — milestone? objective? daily intention? — is the evidence. Key results already occupy the "measurable progress toward a goal" slot, and `Goal.parentGoalId` already occupies the nesting slot.
- **Drop the table in the same change.** Rejected: removal of the code is reversible, a `DROP TABLE` is not. Keeping the rows lets the data question ("is any of this worth migrating to Key results?") be answered on its own timeline, and keeps this PR free of a migration — which under this repo's workflow would force it through `develop` rather than fast-track.
- **Leave the marketing copy alone.** Rejected: the landing page, feature pages, and docs sold "Goals cascade into outcomes" as the core mental model. Leaving that while the feature is gone would be worse than either extreme.
