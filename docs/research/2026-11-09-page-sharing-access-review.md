# Page access and sharing: where we are, what Notion does, and the way forward

*Review written 2026-11-09, prompted by the Syntrofi "Manage Syntrofi" project, where the only way
to protect a page was to park it in a restricted project — and that then locked out an agent James
had asked to write to it (ticket alpha.shark, #819).*

## 1. How page access works today

Every read of a Page goes through one resolver, `getKnowledgePageAccess`
(`src/server/services/access/resolvers/knowledgePageResolver.ts`), and every list through its SQL
twin `buildKnowledgePageAccessWhere`. A page has exactly one of three **modes**, decided by two
fields on `KnowledgePage`:

| Mode | Fields | Who can see it | Who can edit |
|---|---|---|---|
| Workspace page | `projectId = null`, `isInviteOnly = false` | every workspace member, any role | non-viewer roles |
| Project page | `projectId` set, `isInviteOnly = false` | whoever can see the project (restricted project → creator, project members, workspace owners/admins) | whoever can edit the project |
| Invite-only page (ADR-0069, shipped Oct 2026, PR #866) | `isInviteOnly = true` | the owner and the people in `KnowledgePageMember`, while they remain workspace members | invitees with role `editor` |

On top of any mode, **Publish to web** (ADR-0038) makes the live page readable by anyone with the link.

Three things follow from this shape:

1. **Sharing is a mode switch, not a grant.** Turning on invite-only *replaces* project and workspace
   visibility; it does not add people on top of it. A page cannot be "everyone in the project, plus
   Praj from another team". And the owner is the only one who can manage invitees.
2. **Pages have no private default.** A new page with no project is visible to the whole workspace.
   The only private space is one you make per page.
3. **There are no guests.** Invitees must already be workspace members. Someone outside the
   workspace can only ever see a published page.

So the premise of the question is half right. Since October there *is* a way to share a page with
named people without a project (the Share popover → Invite-only switch → Add people), but it is a
separate mode you have to opt into, it is easy to miss (the popover leads with the project audience
and still says "move it to a restricted project" as the lever), it cannot reach outside the
workspace, and it only lets the owner share. That is why the restricted project still feels like
"the only way".

### Related finding: what the bug ticket showed

Project pages inherit a problem of restricted projects: an External agent (ADR-0049) is a plain
workspace *member*, so a restricted project refuses it, and the only grant lever — adding it as a
project member — was unusable because the members picker filtered agents out and the error said
only "Access denied". That is fixed under ticket alpha.shark (clear refusal message naming the
account and the missing access; agents addable to projects with the owner-ceiling guard;
`exponential auth whoami` prints the identity). The Pages list was checked and is safe: it filters
with the same restricted-project clause, so a page in a restricted project never appears in the
list for someone without project access.

## 2. How Notion does it

Notion's model is worth copying in parts, not wholesale. Its pieces:

- **Inheritance by default.** A page gets its parent's permissions. A teamspace sets the default
  for everything inside it; a page in your Private section is yours alone. The sidebar makes the
  default visible: *Teamspaces* (shared), *Shared* (pages shared with you individually), *Private*.
- **Additive grants.** Share adds a person or group *on top of* what is inherited. Four levels:
  Full access (edit + share), Can edit, Can comment, Can view, plus "Can edit content" for database
  pages. The broadest rule wins.
- **Restrict** removes the inherited access from a page (and its sub-pages) so only explicit grants
  remain — the equivalent of our invite-only, but as an operation on an otherwise-inherited page,
  with an undo ("Restore").
- **Guests.** People outside the workspace are invited to individual pages by email, see that page
  and its sub-pages and nothing else, and are listed under Members → Guests. Full access for guests
  is a paid-plan feature.
- **Groups** are first-class grantees (we have Teams, but Teams are not grantees on pages).
- **Publish to web** is separate from sharing, as ours is.

Sources: Notion's [Sharing & permissions](https://www.notion.com/help/sharing-and-permissions)
and [Understanding Notion's sharing settings](https://www.notion.com/help/guides/understanding-notions-sharing-settings),
plus [Thomas Frank's guide](https://thomasjfrank.com/notion-sharing-permissions-the-ultimate-guide/)
for the guest edge cases.

The one Notion piece that does **not** transfer is live inheritance down the page tree. ADR-0069
rejected it on purpose: our hierarchy is the `pageLink` graph (ADR-0039), a page can have several
parents and the graph allows cycles, so "inherit from the parent" has no single answer and would
mean a graph walk on every read. The one-off "Apply to sub-pages" is the right substitute.

## 3. Proposal

Keep the single resolver and the three mode fields. Change the *meaning* of the share list from
"replacement" to "grant", and add the two things people actually ask for: sharing on top of a
project, and sharing with someone outside the workspace. In order of value:

### Step 1 — Grants are additive (small schema change, mostly resolver and UI)

`KnowledgePageMember` becomes a grant that applies in **every** mode, not only invite-only:

- A project page or workspace page can have extra named people with `viewer` or `editor` access.
  The resolver adds one path: *has a `KnowledgePageMember` row and is a workspace member*. The SQL
  twin gains the matching `OR`.
- `isInviteOnly` keeps its exact current meaning — *drop the inherited audience* — and becomes
  Notion's "Restrict": a switch you can turn on or off without losing the grants.
- Share popover becomes one list: the inherited audience row at the top (Everyone in workspace /
  Members of Project X / Nobody — restricted), then named people, then an **Add people** field.
  "Restrict to people listed" is the switch that used to be "Invite-only". Drop the "move it to a
  restricted project" copy.
- Management: a page **editor** may add people at or below their own level (Notion's "Can edit"
  cannot share; "Full access" can). Keep "only the owner can restrict or publish".

This alone removes the "only via a project" feeling and the owner-only bottleneck, with no new
tables. Risk: the resolver has three callers that enumerate viewers (`listKnowledgePageViewers`,
notifications, search); each gains the grant path. Existing invite-only pages keep behaving
exactly as today because the rows already exist.

### Step 2 — Comment-only level (tiny)

Add `commenter` to the invite roles (`viewer` | `commenter` | `editor`). Page comments already have
their own router; the gate is one line. Worth doing in the same PR as Step 1 because the Share UI
is being rebuilt anyway.

### Step 3 — Guests on pages (the real new capability)

Share a page with an email address that has no workspace membership:

- `KnowledgePageMember` gets a nullable `email` plus `acceptedAt`; a grant for an unknown email
  creates a pending invite, sent by the existing invitation mailer (`WorkspaceInvitation` is the
  model to mirror), and binds to the User on first sign-in.
- The resolver's grant path drops the "still a workspace member" requirement **for rows flagged
  `isGuest`**; everything else stays. The membership check exists today to make access lapse when
  someone leaves; for a guest, removal is the explicit act instead.
- Guests see the page (and sub-pages they are also granted) at the page URL and nothing else: the
  workspace layout already has a guest branch (`isWorkspaceGuest`, project-only members), so the
  nav, switcher and search scoping follow the pattern used for project guests.
- Workspace settings → Members lists page guests next to project guests so admins can see and
  revoke them. Workspace owners can turn guest sharing off per workspace.

This needs a migration and its own ADR (it reverses the "no outside guests" line of ADR-0069), so
it goes through `develop`.

### Step 4 — Make the default visible (UI only)

Add a *Shared with me* section to the Pages list and tree (pages where the only path in is a
grant), and a filter for *Mine / Project / Workspace*. This is Notion's sidebar lesson: people
trust the model when they can see which bucket a page sits in.

### Explicitly not proposed

- **Live inheritance through page links** — rejected by ADR-0069 for structural reasons that still
  hold. Keep "Apply to sub-pages" as the one-off.
- **Private-by-default new pages.** The workspace page is our team default and much of Exponential
  (ceremony notes, workspace updates, search) assumes it. Step 1 plus Step 4 gives the same comfort
  without flipping the default.
- **Teams as page grantees.** Nice later; Teams already route through projects, and Step 1's model
  takes a `teamId` on the grant row whenever that is wanted.

### Suggested sequencing

Steps 1, 2 and 4 are one feature ("Share a page with people") shippable without a migration beyond
the `commenter` role value (a string column today, so none). Step 3 is a second feature with an
ADR and a migration. Each is a candidate for `/to-prd` → `/to-tickets`; none of it is started.
