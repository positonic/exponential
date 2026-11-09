# Page grants are additive

## Status

Accepted — 2026-11-09. Supersedes two lines of [ADR-0069](0069-invite-only-pages.md): invitees as
a *replacement* audience, and "the owner manages sharing". The rest of ADR-0069 stands.

## Context

Under ADR-0069 a Page's named people (`KnowledgePageMember`) counted only while the page was
invite-only, and turning that on replaced the project or workspace audience. "Everyone in the
project, plus Praj from another team" could not be said, so the restricted project stayed the only
real lever — which is how an agent James asked to write to a page got locked out of the Syntrofi
project (ticket alpha.shark, #819). Only the owner could add people, so an editor who saw someone
missing had to go and find them. Review and the Notion comparison:
[`docs/research/2026-11-09-page-sharing-access-review.md`](../research/2026-11-09-page-sharing-access-review.md).

## Decision

A `KnowledgePageMember` row is a **grant**, and it counts in every page mode.

- **Additive.** On a workspace or project page a grant adds its holder on top of whoever placement
  already admits; with both, the higher level wins (a *viewer* grant never takes away an inherited
  edit right). A grant counts only while its holder belongs to the page's workspace; the row
  outlives leaving, as before.
- **Restrict is a switch.** `isInviteOnly` keeps its meaning — drop the inherited audience — and
  the UI calls it "Restrict to people listed". Turning it on or off never touches the grants.
- **Editors share.** Anyone who can edit a page may add people (`canShareKnowledgePage`). A
  non-owner may change or remove only the grants they added, and may not make someone whose
  workspace role is Viewer a page editor. Only the owner restricts a page, publishes a restricted
  page, or changes other people's grants (`canManageKnowledgePageAccess`). Who counts as an editor
  follows `canEditKnowledgePage` unchanged, so a workspace admin editing a restricted-project page
  through the escape hatch may share it.
- **"Apply to sub-pages"** runs from any page the caller may share: it copies the page's grants to
  each linked sub-page the caller may share, and, only when the page is restricted, restricts the
  caller's own sub-pages. It still only adds.
- Pages that cannot be restricted (workspace-update bodies, ceremony notes) still accept grants.

The rule stays in the page access resolver: `getKnowledgePageAccess`, its SQL twin
`buildKnowledgePageAccessWhere` (one grant branch outside the mode switch) and
`listKnowledgePageViewers`, changed together under one parity test.

## Considered options

- **Keep grants inside invite-only mode** and add a separate "extra people" list for other modes.
  Rejected: two lists for one idea, and switching modes would have to move people between them.
- **Notion's split between "Full access" and "Can edit"**, where only the former shares. Rejected:
  a fourth role for little gain; editors sharing at or below their level covers the cases asked for.
- **Any editor may change any grant.** Rejected: one editor could silently undo another's sharing.
- **Live inheritance down the page tree.** Still rejected, for ADR-0069's reasons (several parents,
  cycles, a graph walk on every read).
- **Guests from outside the workspace** are left to a later feature with its own ADR; the grant
  row is built so it can take a nullable email and an accepted-at date.
