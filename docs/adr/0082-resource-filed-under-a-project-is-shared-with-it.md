# A Resource filed under a project is shared with it

## Status

Accepted — 2026-11-15. Amends the "personal store" premise of
[ADR-0079](0079-agents-keep-their-owners-reading-list.md) for Resources that have a Project; an
agent's reach is unchanged. Decided before the code; this file landed with the change that built
it (ticket `perky.nova`).

## Context

A Resource has always been private to the person who saved it. Every `resource.*` read is scoped
to the caller's own rows, Knowledge search returns Resource text to its saver only, and
`projectId` was a label on a personal library: a page filed under a shared Project was listed
there for one person and for nobody else.

The Chrome extension is gaining a **Resources** tab that files the open tab, or every tab of a
browser tab group, under a Project. That makes "file this under the project" a daily act, and
raises what filing means to the Project's other members.

## Decision

**Filing shares.** A Resource under a Project is visible to everyone who can see that Project,
restricted Projects included. A Resource with no Project stays visible only to its owner.

- **One Project.** A Resource is filed under at most one Project. Filing it elsewhere moves it,
  and a move is always an explicit choice. Moving into a Project is what shares a Resource;
  moving out unshares it.
- **The owner keeps the read state.** `readStatus` and `readAt` stay on the Resource and belong
  to its owner. A shared Resource appears on its owner's Reading list only, so the Reading list
  remains "the caller's own Resources".
- **Once per Project.** A page already filed under a Project cannot be filed there again by
  someone else; matching is by the Resource's identity, not its raw URL. A member who wants the
  page on their own Reading list saves a Resource of their own with no Project.
- **Editors can unfile, and nothing more.** Only the owner deletes, archives, describes or moves
  a Resource. Anyone who can edit the Project may unfile it, which returns it to its owner
  unshared.
- **Search follows visibility.** Indexed Resource text is searchable by exactly the people who
  can see the Resource. Filing under a Project offers indexing pre-selected; a save with no
  Project leaves it unselected, as decided on 2026-10-23.

## Considered options

- **Keep the Project a private label** (the status quo, and the smaller change). Rejected: a
  Project is where its members look for its material, and a page listed there for one person
  and hidden from the rest is a surprise in the other direction.
- **Read state per member.** Rejected for now: it moves read state off the Resource into a
  per-person record, which is a migration of every row and a rewrite of the Reading list on web
  and iOS. Nothing here blocks adding it later.
- **One Resource per person in the Project's list.** Rejected: a shared list that shows the same
  page once per teammate gets worse with every member, and "is this already here?" is the
  question the extension's status line exists to answer.
- **Only the owner may take it out of a Project.** Rejected: a misfiled page would be stuck
  whenever its owner was away or gone. Unfiling destroys nothing, so editors get that and no
  more.
- **A Resource in several Projects.** Rejected for now: a join table and every project-filtered
  query, for a need nobody has yet. Going from one to many later is easy; the reverse is not.

## Consequences

- Resource reads can no longer be scoped by owner alone: listing, opening and the Knowledge
  search condition must admit rows in Projects the caller can see, while every write stays
  owner-only apart from unfile.
- A save into a Project checks for the page across owners, not only among the caller's rows.
- Moving a Resource into a Project publishes it. Every client must say who will see it before
  the save, and a Project created on the spot is unrestricted unless the person says otherwise.
  A "personal" workspace is not private either: its unrestricted Projects are visible to all of
  its members, agents included.
- A Resource is visible through a Project only while its owner belongs to the Project's
  workspace, as a Page grant is ([ADR-0080](0080-page-grants-are-additive.md)).
- "Can see that Project" means being in it: its creator, a Project member, a member of its team
  or workspace when it is unrestricted, or a workspace owner or admin. A *public* Project's page
  can be read by anyone signed in, and that alone shows nobody the Resources filed under it:
  what a member clipped belongs to the people in the Project, not to its page. (Settled while
  building, 2026-11-15; Pages and Meetings do follow public Project access, so this is the
  narrower reading on purpose and the one to widen if it proves wrong.)
- Filing puts the Resource in the Project's workspace, whatever workspace the save named, and
  its index entries move with it. A row filed under a Project but sitting in another workspace
  is shared with nobody; rows like that from before this decision were left as they were.
- Resources already filed under a Project when this shipped became visible to that Project's
  members that day. Nobody was told "who will see it" when those were filed.
- An agent still works on its owner's rows in the workspaces delegated to it (ADR-0079). This
  decision does not let an agent read other people's shared Resources.
- A Resource needs two addresses where it has one `url`: its identity, for matching, and the
  address it was last saved from, for its link. Existing rows get an identity computed from the
  URL they have.
