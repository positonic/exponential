# Who does what is a Position, not a Role, a field, or a Page

## Status

Accepted — 2026-10-10. Builds on [ADR-0067](0067-assistant-is-an-owned-external-agent.md)
(an Assistant is an assignable principal) and [ADR-0016](0016-agent-activity-writes-reuse-human-path.md)
(Zoe in chat acts as the user — unchanged). Vocabulary in CONTEXT.md under **Workspace
membership**: Role, Position, Remit.

## Context

Zoe was asked to create three travel tasks and assign each to "whoever handles this kind of
thing". She could not: the only per-member fact Exponential stores is `WorkspaceUser.role`,
a permission tier (owner / admin / member / viewer) that says what a member may do and nothing
about what work they take on. The CLEAR workspace keeps that information in a Notion
"Roles & Responsibilities" table — named functions, each with responsibilities, an explicit
"not accountable for" column, and a holder — where one person holds two functions and agents
hold none. The Assign modal and Zoe's rosters see none of it.

Three facts shaped the choice:

- An Assistant's and an External agent's shadow users are ordinary `WorkspaceUser` rows, so
  anything keyed on workspace membership covers humans and agents with one code path.
- The document is function-first: one function, several holders over time; one person,
  several functions. A single text column per member cannot express either.
- The run engine already routes by member id (`get-run-context` returns members with
  `isAgent` and `assistantOwner`; `reassign-action` takes one of those ids). Routing data has
  to attach to member ids to be usable by it.

## Decision

1. **A new workspace-scoped entity, Position**: title, free-text **Remit**, optional
   "not accountable for", and holders (many-to-many with workspace members). Humans,
   Assistants and External agents are all holders of the same shape.
2. **Role is untouched.** A Position never grants or restricts access; `WorkspaceUser.role`
   remains the only input to access control. The "Edit Role" modal is not reused for this.
3. **Remit is free text matched by meaning**, not a tag taxonomy. An External agent's own
   description is its fallback Remit when it holds no Position.
4. **Writes are human-only.** Owners and admins manage Positions and holders; a holder may
   edit the Remit of a Position they hold. No agent principal can create or alter a Position,
   so an agent cannot widen its own routing surface.
5. **One roster shape.** The chat roster and the run agent's `get-run-context` members carry
   the same Position fields, produced by one mapping, so a human picking an assignee, chat
   Zoe, and a running Assistant all route from the same facts.

## Considered alternatives

- **Reuse `WorkspaceUser.role` or the Edit Role modal.** Rejected: overloads a word the
  codebase uses for access control; one tier per member cannot hold two functions.
- **A free-text "responsibilities" column on `WorkspaceUser`.** Rejected after reading the
  CLEAR document: loses the function-first structure, the shared holder, and the explicit
  "not accountable for"; forces each person to restate a function someone else also holds.
- **A Knowledge Page holding the document.** Rejected as the source of truth: no link to
  member ids, so assignment degrades to name matching; agents cannot appear in it; it goes
  stale silently. A Page may still hold the long-form text, linked from a Position.
- **A tag or skill taxonomy.** Rejected: invites a vocabulary nobody maintains, and Zoe
  matches prose better than tags.
- **Live sync from Notion.** Rejected for now: two sources of truth for holders, for a
  document that changed once in two months. Import is a one-off draft-and-confirm chat flow.
