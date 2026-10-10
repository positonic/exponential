# Invite-only pages

## Status

Accepted — 2026-10-09. Supersedes the "No separate private/personal-page concept in v1" line of
[ADR-0033](0033-knowledge-pages.md). Its other visibility rules are unchanged.

## Context

A Page's visibility followed its placement: a project-linked Page took its Project's rules, and a
project-less Page was visible to the whole workspace. The only way to share a Page with two
colleagues was to create a restricted project for it. That is heavy, and it still lets workspace
owners and admins in through the restricted-project escape hatch. People asked for "share this page
with you and Praj, without making it public", and the only thing the Share popover offered was
publishing it to the web.

## Decision

A Page can be **invite-only** (`KnowledgePage.isInviteOnly`). An invite-only Page is visible to its
owner and to the people invited to it (`KnowledgePageMember`, role `viewer` or `editor`). Nobody else
can see it.

- **No admin escape hatch.** Workspace owners and admins can't see an invite-only Page they weren't
  invited to. "Private" means private.
- **Project placement grants nothing.** An invite-only Page may stay in a project for organisation,
  but project membership doesn't give anyone access to it.
- **Workspace members only.** Invitees must belong to the Page's workspace when invited, and access
  ends when they leave it. The invite row stays, but it no longer grants anything. There are no
  outside guests.
- **The owner manages sharing.** Only the owner switches invite-only on or off, invites or removes
  people, and publishes an invite-only Page to the web. An invited editor can edit the content, but
  can never make the page more visible than the owner chose.
- **Sub-pages keep their own access.** Nothing is inherited through `pageLink`s. A page can have
  several parents, and the link graph allows cycles. Instead, from an invite-only page the owner can
  "Apply to sub-pages": a one-off action that makes the linked sub-pages they own invite-only and
  adds this page's invitees to them. It only adds people; it never removes anyone's access.
- **Shared surfaces can't be invite-only.** A Workspace update's body and a ceremony occurrence's
  notes page stay visible to the people they're for.
- **Copies don't widen access.** Duplicating an invite-only Page creates an invite-only copy. The
  person who duplicated it owns the copy, and it has no invitees.

The rule lives in the page access resolver (`getKnowledgePageAccess`,
`buildKnowledgePageAccessWhere`, `listKnowledgePageViewers`). Every read path goes through it,
including semantic search (`pageViewerId`, fixed first in #864), favourites, feature-linked pages and
mention notifications. Invitees get a `page_shared` notification.

## Considered options

- **Admins see invite-only pages too**, matching restricted projects. Rejected: users read
  "invite-only" as private, and an admin who needs a page can be invited.
- **Sub-pages inherit the parent's invitees live.** Rejected: a page can have several parents and
  the link graph allows cycles. Checking access would mean walking the graph on every read, and
  which parent wins would be arbitrary.
- **Guests from outside the workspace.** Deferred. It needs guest accounts and workspace scoping in
  navigation, and it is a much bigger change than sharing within a team.
- **A per-page restricted project, created automatically.** Rejected: it clutters the project list,
  and the admin escape hatch would still apply.
