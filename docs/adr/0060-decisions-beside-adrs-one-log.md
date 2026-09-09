# Decisions are Exponential-owned rows beside git-projected ADRs; one Decision Log, two sources

## Status

Accepted — 2026-09-09

## Context

The Decision Log projects ADR markdown from enrolled git repositories into `AdrDocument` rows and
is read-only by construction: git is the source of truth, and its PRD makes "no write path to ADR
content" a hard constraint. ADRs are also deliberately rare; the repo's bar is hard-to-reverse
*and* surprising *and* a real trade-off. Most decisions a team makes fail that bar and are written
nowhere, which is why `CONTEXT.md` carries them as inline notes ("decision 2026-06-12: …").

Meeting summaries already contain decisions as prose (a "Key Decisions" section in the device
template; "Decision:" / "Agreed:" callouts in the Fireflies-shaped prompt). The meeting view model
carries empty `decisions` and `questions` arrays "until extraction lands", and the glossary flags
Decision and Open question as not-yet concepts. Ceremonies (ADR-0059) need open questions as an
agenda input and decisions as an occurrence output.

## Decision

1. **A new `Decision` model, workspace-owned and writable.** Statement, Markdown body with ADR
   headings, deciders, owner, decided-at, source (`MEETING | MANUAL | AGENT`), provenance (meeting,
   occurrence, evidence = quoted transcript turns), scope (optional product, project, objective or
   key result), and links (supersedes, formalised-as-ADR, tickets, features). Labels come from a
   workspace sequence (`D-0042`). ADRs are untouched and stay read-only.
2. **One index, two sources.** The Decision Log lists `Decision` and `AdrDocument` rows together
   under a Source facet (Code, Meeting, Manual). Status shares the ADR vocabulary
   (`PROPOSED | ACCEPTED | SUPERSEDED | DEPRECATED`) plus `OPEN`.
3. **Open question is a Decision in `OPEN` status.** One entity covers the arc from question to
   answer; the agenda's "decisions pending" section is one query.
4. **Extraction is deterministic, produces drafts, and a human confirms.** This extends ADR-0007
   from Actions to Decisions: notes first, transcript second, structured output that must cite
   supporting transcript turns; a candidate with no evidence is discarded; nothing enters the log
   until confirmed. The extractor receives the meeting's open and proposed decisions so a resolved
   question becomes a status change, not a duplicate.
5. **Visibility follows the evidence.** A meeting-linked decision quotes the transcript, so it is
   visible only through the meeting visibility resolver (ADR-0014), restriction included. A
   decision without a meeting is workspace-visible, narrowed by project restriction when
   project-linked.
6. **The ADR bridge is a pull request, never a database write.** "Draft ADR" on an accepted
   decision opens a PR in an enrolled repo with the file pre-filled from the decision; when it
   merges and syncs, the decision links to the `AdrDocument`. This is the PRD's deferred
   "propose an ADR" flow, fed by meeting decisions.

## Considered alternatives

- **Meeting decisions as `AdrDocument` rows with a null repository.** Rejected: the model's
  natural key is repository + path, its `contentHash` / `lastSeenSha` are git blob SHAs, and the
  sync engine would have to special-case rows it did not produce, all to break the one invariant
  the Decision Log is built on.
- **One Knowledge Page per decision.** Rejected: no lifecycle, no evidence anchors, no typed
  links, and not queryable for agendas.
- **Decisions as `Insight` rows.** Rejected: an Insight is product-scoped evidence about users
  with its own triage lifecycle (INBOX …); overloading it would blur two different things.
- **A separate `OpenQuestion` model.** Rejected: question and decision are one lifecycle, and
  splitting them forces every agenda and every "resolve" path to bridge two tables.
- **Auto-confirming high-confidence extractions.** Rejected for the same reason ADR-0007 never
  auto-publishes Actions: an invented decision in a log people trust is worse than a missing one.

## Consequences

- Glossary gains **Decision** and **Open question**; the flagged ambiguity is resolved.
- The Decisions index gains a Source facet and groups meeting decisions by ceremony or project
  rather than by repository; the ADR detail page gains a "Decided in" row.
- The summary prompts keep their prose decision sections; the UI links prose to rows rather than
  parsing prose into rows.
- The activity feed gains a `decision` entity type; Zoe gains a decision tool on the same service
  seam as the UI (ADR-0016).
- The CLI and SDK need `decisions` commands (a known coverage gap); tracked as a later scope.
- Adds a migration; stacks with the Ceremonies schema work (ADR-0059) on one branch.
