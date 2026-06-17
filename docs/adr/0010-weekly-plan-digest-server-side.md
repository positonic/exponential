# The Weekly plan digest is computed by one server procedure, shared by the wizard and Zoe

## Status

Accepted — 2026-06-10

## Context

The **Weekly plan** (the personal, GTD-style review ritual — see `CONTEXT.md`) spots issues
on each active Project: no next Action, no recent activity, overdue actions, no Key result
linked, status STUCK/BLOCKED, no end date, no description. Today that logic lives **only** in
the React wizard — `calculateProjectHealthScore` in
`src/app/(sidemenu)/w/[workspaceSlug]/weekly-plan/page.tsx` (≈lines 34-81), with the
OFF_TRACK / AT_RISK derivation in `ProjectReviewCard.tsx`. There is no server-side equivalent:
`briefing.ts` filters on a cruder `progress < 50`, and `FetchProjectHealthStep.ts` uses a
different overdue-ratio metric for standups. Neither matches the wizard.

We are adding a chat-driven Weekly plan: **Zoe** presents the same issues in the in-app chat
and walks the user through them one Project per turn. The obvious-looking move is to write a
Mastra tool that re-computes the health score and issue list itself. That is **not** what we
chose, and a future reader will reasonably wonder why an agent feature doesn't just let the
agent (or its tool) do its own scoring.

## Decision

**Issue-spotting is a single deterministic server procedure. The wizard and Zoe are both
read-side consumers of it — neither computes its own copy.**

1. Extract the scoring into a service and expose it as **`weeklyReview.getDigest`** (workspace-
   scoped, like `getActiveWithDetails`). It returns the ordered list of active Projects, each
   annotated with its spotted issues and a health score — the **Weekly plan digest**.

2. **Refactor the React wizard to consume `getDigest`** rather than computing
   `calculateProjectHealthScore` client-side. The wizard's sort order and the AT_RISK /
   OFF_TRACK badges derive from the procedure's output.

3. **Expose one Mastra tool over the same procedure** so Zoe's digest is, by construction,
   identical to the wizard's. The tool returns data only; Zoe's chat text frames it.

This is the same single-source-of-truth stance as
[ADR-0007](0007-deterministic-action-extraction.md) (deterministic extraction, agent refines)
and [ADR-0005](0005-server-issued-voice-catalog.md) (server issues the catalog, clients
consume): the *fact-producing* logic is computed once, server-side, and every surface renders
the same artefact.

## Considered alternatives

- **Re-implement the scoring inside a Mastra tool.** Rejected: it creates two definitions of
  "a Project needs attention" — the React one and the agent one — that will silently drift.
  The whole point of the chat flow is parity with the wizard; divergence defeats it.
- **Extract for chat now, leave the wizard computing its own copy, migrate later.** Rejected as
  the steady state (acceptable only as a transient): it is the same duplication with a promise
  to fix it, and the React copy is the one most likely to keep accreting ad-hoc tweaks.

## Consequences

- **The health-scoring weights become a server contract.** Tuning a deduction (e.g. "-15 for
  no end date") now changes both surfaces at once — a feature, not a cost, but it means the
  weights live in the service, not in a component.
- **`getDigest` is the seam for the proactive nudge.** The scheduled weekly nudge
  (one per active workspace) reuses this procedure to decide whether a workspace has drifted
  enough to ping about — no fourth copy of the logic.
- **KR-vs-Objective signal mismatch is surfaced, not resolved here.** The digest's "no Key
  result linked" signal reads `project.keyResults`, while Zoe's existing `linkProjectToGoalTool`
  links project→Objective(Goal). Clearing that issue conversationally may need KR-level linking.
  Flagged in `CONTEXT.md`; out of scope for this ADR.
