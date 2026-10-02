# Workspace updates are owner-approved Pages

## Status

Accepted — 2026-10-02. PRD: feature "Workspace updates: resident AI copywriter" (Exponential, product
`exponential`).

## Context

Several surfaces each told part of the "what shipped" story, and none finished it. The public blog
was hand-written and stopped after February. `ContentDraft` generated posts from commits and never
published them. `/product-timeline` was a raw commit firehose, and Week-in-Review stayed in-app. The
"What Shipped Today" **Broadcast** ([ADR-0029](0029-automation-platform-primitive.md)) emailed
commit summaries on a UTC schedule with no review.

We want a curated update every week, per workspace, written by an AI copywriter. The owner was
explicit that **nothing is sent or published without their approval**, and that drafts reach them in
Matrix.

## Decision

1. A **Workspace update** is a lifecycle row (`WorkspaceUpdate`: one per workspace, kind and period;
   DRAFT → APPROVED → SENT, or SKIPPED / EMPTY). Its body is a **Knowledge Page**
   ([ADR-0033](0033-knowledge-pages.md)), so review happens in the real editor with inline comments.
   Publishing later reuses Page publishing ([ADR-0038](0038-page-public-publishing.md)). Drafts are
   linked from an "Updates" index Page through the pageLink graph
   ([ADR-0039](0039-page-nesting-soft-link-graph.md)).
2. **Approval is mandatory.** Only a reviewer moves a row to APPROVED (reviewers are configured
   users, else owners and admins), and every distribution step hangs off that transition. There is
   no auto-send window.
3. **Code chooses, the model narrates.** Shipped work is gathered from features, feature scopes,
   tickets, cycles and goal updates (merged PRs only as a fallback). It is ranked and capped in code
   (three highlights, eight one-liners, "+N more"). The writer (Claude, structured output) returns
   prose keyed to item ids, and anything citing an item outside the selection is dropped. A
   deterministic template writes the draft when no model is available.
4. Settings live in a typed per-workspace `WorkspaceUpdateConfig`: local weekday, hour, IANA
   timezone, reviewers, voice and index Page. A dedicated hourly cron drafts each period once.
   Windows tile from the previous scheduled update. On-demand drafts never move the window.
5. Drafts reach reviewers through a new `update_review` notification category. It is the first
   category whose Matrix default is on, so a defaulted Matrix cell delivers only to users who have
   paired Matrix.

## Considered alternatives

- **Extend the Broadcast / `WorkflowDefinition` scheduler.** Rejected. Its cadence is UTC-only and
  its config is untyped JSON. A linear step pipeline also has no place for a human approval state
  between writing and sending. Broadcasts stay as they are for unattended daily sends.
- **`ContentDraft` as the store.** Rejected. It has no editor, comments or public route, and Pages
  already have all three.
- **Auto-send after a review window.** Rejected by the owner: approval is always required.
- **Let the model write free Markdown.** Rejected. The structure and the "only what shipped"
  guarantee are enforced in code.

## Consequences

- One additive migration (`WorkspaceUpdateConfig`, `WorkspaceUpdate`, and a back-relation from
  `KnowledgePage`).
- Distribution on approval is a later scope: publish the Page, `/updates/[workspace]` with RSS, the
  newsletter List, and the team Matrix room. So are double-opt-in signup and the monthly roll-up to
  `/blog`.
- Regenerating a draft replaces the Page's content, including the reviewer's own edits. The UI
  warns before it does.

## Amendment: approved snapshots are what get distributed (2026-10-02)

Decision 1 said publishing would reuse Page publishing (ADR-0038). It doesn't. A published Page shows
its **live** content, so any edit after approval would go public unreviewed, which breaks decision 2.

Instead, approving freezes the Page's title and body onto the row (`approvedTitle` / `approvedBody`),
and every channel sends that snapshot:

- the public `/updates/<workspace>` page, each update's own page under it, and the RSS feed (rendered
  with the canonical `MarkdownRenderer`, or with the shared document schema and the public sanitizer
  for RSS and email);
- the newsletter List (the Broadcast fan-out, logged per recipient against the update);
- the team Matrix room.

Each channel's outcome is recorded on the row. A channel that finished never runs again, so a retry
never double-sends. The update becomes SENT once no channel failed. The hourly sweep retries failures
for three days after approval. The draft Page stays the team's working document.

Retries favour a missed send over a duplicate one:

- Each attempt claims a lease on the row (`distributionAttemptAt`), so approval's own attempt and the
  sweep never send at once. The sweep tries the least recently attempted rows first.
- Each newsletter email is recorded as QUEUED before it is sent, and a contact with a QUEUED or SENT
  record is never emailed that update again.
- The public page and feed are never cached, so switching the public page off takes them down at
  once.
