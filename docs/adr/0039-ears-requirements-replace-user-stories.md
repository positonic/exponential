# EARS requirements replace user stories on the feature registry

## Status

Accepted - 2026-07-09

## Context

Features carry `UserStory` rows (`asA` / `iWant` / `soThat` / `acceptanceCriteria`, attachable to a Feature or a FeatureScope), and the `/to-prd` skill mandates emitting stories as structured triples. In practice the triples are filled to satisfy the template, not to record information: the persona clause is filler, the benefit clause is circular, and nothing in a story is testable. The story format is a conversation prompt from agile coaching, not a requirements notation.

Meanwhile our features are increasingly specified for and built by agents, where the spec-driven wave (AWS Kiro's spec mode, GitHub Spec Kit) is converging on atomic, testable statements. The established notation for those is EARS (Easy Approach to Requirements Syntax): one "shall" statement per requirement, in a small set of sentence patterns (ubiquitous / When / While / If-then). EARS is standard in systems engineering and the IREB requirements community, not in classic consumer product orgs - we are deliberately siding with the spec-driven camp because agents verify statements, not empathy.

## Decision

- A new `Requirement` row (one free-text EARS-flavoured `statement`, optional kind: functional / non-functional / constraint, checkable met/unmet, ordered) attaches to a Feature or is pinned to one of its FeatureScopes - the same shape `UserStory` has today.
- Requirements are drafted in a PRD (a Knowledge page linked to the Feature, optionally to a Scope) and extracted into rows on acceptance. **Rows are canonical**; the PRD is the argument that produced them and ages into history.
- User stories are retired as data. The `UserStory` table stays in the schema, dormant, for existing rows and possible later revival - but the UI and `/to-prd` stop writing to it. Stories survive only as optional prose in a PRD's problem section.
- Definition-of-done is explicitly NOT modelled in the registry (it is a team-wide process checklist); ticket-level acceptance criteria are unchanged.

## Consequences

- The `/to-prd` skill (positonic/skills fork) must be rewritten to emit EARS requirements instead of story triples, or its output has nowhere to land.
- Two requirement-shaped tables coexist in the schema (`UserStory` dormant, `Requirement` live); readers should treat `Requirement` as the only write path.
- Checking off requirements gives the registry a live "how much of the spec is met" signal per feature/scope without a status machine on requirements.
