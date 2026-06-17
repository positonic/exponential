# Meeting visibility: one resolver, project-authoritative, attendance trumps restriction

## Status

Accepted — 2026-06-12

## Context

A workspace-level audit (triggered by a new Clear-workspace admin seeing a leadership 1:1 on `/w/clear/meetings`) found Meeting (`TranscriptionSession`) read access enforced inconsistently per surface:

- The meetings list (`getAllTranscriptions`) filtered by owner / participant / project access.
- The weekly stats rail (`weeklyMeetingStats`) applied **no access control at all** — any authenticated user could pass any `workspaceId` and read meeting counts, durations, and participant names/emails.
- Related-meeting search (`findRelated`) checked workspace membership only, leaking titles/summaries of restricted-project meetings to plain members.
- The per-row check (`ensureTranscriptionAccess`, router-local) didn't grant participants access, so an attendee could see a restricted-project meeting in the list but get FORBIDDEN opening it. It also let workspace *viewers* edit project-less meetings.

## Decision

1. **One resolver.** Meeting access lives in `src/server/services/access/resolvers/transcriptionResolver.ts`: `buildTranscriptionAccessWhere(userId)` for every bulk/aggregate read (list, weekly stats, related search), `getTranscriptionAccess` + `canViewTranscription`/`canEditTranscription` per row. Routers must not carry inline meeting permission logic.
2. **Project access is authoritative** for project-assigned meetings. Unrestricted projects remain workspace-visible (the existing model was reaffirmed over team-scoped-by-default); restricted projects are an **explicit allowlist** — creator, `ProjectMember`s, and workspace owner/admin escape hatch. Members of the owning *team* deliberately do **not** inherit access to a restricted project.
3. **Attendance trumps restriction, view-only.** A linked Participant may always *view* a meeting they were in — restriction hides a project's contents from bystanders, not from the people in the room. Attendance never grants edit.
4. **Project-less meetings**: any workspace member may view; edit requires a non-`viewer` role.

## Considered alternatives

- **Team-scoped projects by default** (meetings of a team-owned project visible only to that team): rejected — silently hides existing projects from people who can see them today; the `isRestricted` flag already expresses the sensitive case.
- **Restriction absolute (no participant exception)**: rejected — meetings would silently vanish from attendees' own lists, and the participant branch already shipped in the list query; removing it is the more surprising change.
- **Per-surface checks kept inline**: rejected — that is precisely what produced the weeklyStats hole.

## Consequences

- Stats/related-search results always equal "meetings this caller could open"; rail numbers match the list.
- Aggregates for meetings the caller can't see are no longer observable (counts include only accessible meetings).
- Flipping a project to Restricted requires explicitly adding teammates as `ProjectMember`s — surfaced in the UI copy on the Restricted switch.
