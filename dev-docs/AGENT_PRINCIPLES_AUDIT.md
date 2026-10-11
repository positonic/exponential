# Agent principles audit matrix

The as-built map of the four **Fixed principles** ([ADR-0071](../docs/adr/0071-agent-principles-fixed-invariants.md),
CONTEXT.md **Fixed principle**) onto the operations that govern them: where each rule is enforced,
which test proves it, and what stays guidance. Copy (`content/docs/method/agent-principles.md`,
skills, prompts) may call a principle *enforced* only when every row for it is `enforced`
(ADR-0071; requirement `cmv3vbotz000di906be137dk5`).

Verified against the code on 2026-10-11 (branch `wise.vertex-phase-3-audit-matrix-principal-resolve`).
Each Phase 3 ticket updates the rows it closes, in the same PR.

**Status values**

| Status | Meaning |
|---|---|
| `enforced` | The server refuses the write on every route the row names, and a test covers it. |
| `tool-surface only` | Holds only because one client doesn't expose the tool. Any other route can do it. |
| `gap` | Nothing stops it today. The "Next" column names the ticket that closes it. |
| `guidance` | Can't be checked by the application (prose accuracy, intent). Stays in the method text. |

**Principals.** Rows use the kinds from `resolvePrincipal` (`src/server/services/access/principal.ts`):
`human`, `agent` (a shadow user: External agent key or Assistant run) and `agent_for_human` (Zoe,
the chat gateways and voice, working under a person's own identity).

---

## 0. Identity: who is acting (cross-cutting)

Every principle below depends on telling agents from people by verified credential, never by a label
the caller sets (D-0016).

| Governed operation | Enforcement point | Test | Status | Limits / Next |
|---|---|---|---|---|
| Deciding human vs agent vs agent-for-human | `resolvePrincipal(ctx)` reads only the DB key lookup (`agent-key`), the JWT's verified `tokenType` and `runId`, `User.isAgent` and the `ExternalAgent` row. An unrecognised token type never resolves to `human`; a shadow user with no agent row is refused. | `src/server/services/access/__tests__/principal.test.ts` | `gap` (resolver built and tested, not wired) | No route calls it yet, so nothing is enforced through it. The rows below move onto it. |
| `humanOnlyProcedure` (`src/server/api/trpc.ts`) | a thin call to `resolvePrincipal`: only `human` passes; `agent` and `agent_for_human` are refused. `isPersonCredential` (the resolver's own list of person credentials) refuses every other token type before any DB lookup | `src/server/api/__tests__/humanOnlyProcedure.test.ts`, plus `externalAgentGrant.test.ts`, `externalAgentUpdate.test.ts`, `workspaceAddMember.test.ts`, `adr.test.ts`, `decision.test.ts` › confirmDraft | `enforced` | On the resolver since zippy.blaze. |
| Decision router principal (was `isAgentPrincipal`, `routers/decision.ts`) | removed: `decision.create`, `update`, `setStatus` and `confirmDraft` hand `resolvePrincipal(ctx)` to `decisionService` | `decision.test.ts`, `services/decisions/__tests__/recordIntegrity.test.ts` | `enforced` | `agent_for_human` (Zoe, gateways, voice) now counts as an agent here (wild.lark). |
| `assertHumanPrincipal`, `resolveTimeEntryPrincipal` (`routers/timeEntry.ts`) | `resolvePrincipal`: an `agent` writes its owner's time as `PROPOSED` with itself as author; an `agent_for_human` writes the person's time as `PROPOSED`; only a `human` confirms a day or remembers a resolution. A durable `x-api-key` counts as the person's own credential (`api-token`), and `User.isAgent` still catches a shadow user behind one | `timeEntry.test.ts` › "timeEntry principal from the resolver" | `enforced` | `source` (`manual`/`claude-desktop`/`agent-run`) is a method label the caller still names; identity and status are not. |
| Action `source` on `action.create` (was `sourceForPrincipal`, `routers/action.ts`) | `actionSourceForPrincipal(resolvePrincipal(ctx))` (`server/utils/actionSource.ts`): person → `ui` or `cli`; agent → `agent`; agent for a person → its gateway or `voice`, otherwise `agent` (never `ui`) | `action.test.ts` › "names the source from the principal", `utils/__tests__/actionSource.test.ts` | `enforced` | |
| `resolveAgentActionSource` (`mastra.createAction`, `mastra.quickCreateAction`) | takes the principal: same mapping as above, so a person's own `api-token` is `cli`, not `agent`; an unmapped `-gateway` token is still rejected | `action.test.ts` › "mastra.quickCreateAction names the source from the principal", `actionSource.test.ts` | `enforced` | |
| `action.quickCreate` `source` input (`resolveQuickCreateSource`, `apiKeyMiddleware`) | ignored for `agent` and `agent_for_human` principals (and for a shadow user behind an `x-api-key`): the source comes from the principal | `action.test.ts` › "an agent principal cannot choose its source" | `enforced` | A person's own value from `ACTION_SOURCES` still passes through (it labels their own surface; e.g. the iOS shortcut). |
| Grilling skills' closing step (D-0016) | none: the skill confirms drafts with the developer's own credential, after explicit consent | — | `guidance` (procedural) | The guarantee is the consent step, not the server. Next: polar.lynx moves the step to the skill's own `exp_agent_` key so ADR-0070 drafts it and the person confirms in the Inbox. |

## 1. Record integrity

*Never present a proposal as an accepted decision, or an interpretation as an observed fact.*

| Governed operation | Enforcement point | Test | Status | Limits / Next |
|---|---|---|---|---|
| `decision.create` by an agent principal, or with `source: AGENT` | `createDecision` takes the `Principal` and drafts it (ADR-0070), labelled `AGENT` whatever `source` the caller sends | `decision.test.ts` › "agent-authored decisions are drafts a person confirms", `recordIntegrity.test.ts` › "createDecision" | `enforced` | Covers `agent` and `agent_for_human`. A person may still label their own decision `AGENT` (it becomes a draft). |
| `decision.create` by Zoe for a person (`agent-context`, `sub` = the person), the chat gateways and voice | drafted by principal (`agent_for_human`), not by label; `source` forced to `AGENT`, so never "Logged by hand" | `decision.test.ts` › "Zoe acting for a person (%s) is drafted by principal" | `enforced` | `DecisionsIndex.tsx` labels every `AGENT` row "Logged by Zoe", including an External agent's. |
| `decision.confirmDraft` | `humanOnlyProcedure`, and `confirmDraft` refuses any non-`human` principal in the service | `decision.test.ts`, `confirmDraft.test.ts`, `recordIntegrity.test.ts` › "confirmDraft" | `enforced` | Its "already confirmed, apply only the status" branch is covered as a `setStatus` bypass. |
| `decision.setStatus` | `setStatus` takes the `Principal` and refuses `agent` and `agent_for_human` on a confirmed decision (FORBIDDEN), for every status | `recordIntegrity.test.ts` › "setStatus", `decision.test.ts` › "record integrity: agents cannot move or rewrite a confirmed decision" (incl. the `confirmDraft` route) | `enforced` | A person, including through the CLI's `decisions confirm --status` under their own login, still moves it. |
| `decision.update` | `updateDecision` takes the `Principal`: an agent principal cannot change `statement`, `body` or `decidedAt` on a confirmed decision; its edit of a draft is conditional on the row still not being confirmed (`reviewState: { not: CONFIRMED }` in `WHERE`) | `recordIntegrity.test.ts` › "updateDecision", `decision.test.ts` › same block | `enforced` | Filing fields (owner, product, project, objective, key result, ADR) stay open to agents (ADR-0016). Links (`linkTicket`/`linkFeature`/`linkAction`/`unlink`) don't change what was decided. No revision check between two people (inner.crest). |
| Interpretation presented as observed fact (summaries, notes, chat) | none possible | — | `guidance` | Free-text accuracy is a non-goal of the PRD. |

## 2. Evidence-based completion

*Keep authorization, attempt and outcome distinct; claim completion only as far as the evidence supports.*

| Governed operation | Enforcement point | Test | Status | Limits / Next |
|---|---|---|---|---|
| Assistant run completing its Action | mastra's `RUN_ALLOWED_ASSISTANT_TOOL_KEYS` leaves out the status-setting `updateActionTool` | mastra `src/mastra/agents/__tests__/assistant-run-tools.test.ts` | `tool-surface only` | The server accepts `COMPLETED`/`DONE` from a run's `agent-context` token on every route below. |
| `action.update`, `updateKanbanStatus`, `updateKanbanStatusWithOrder`, `reorderKanbanCard`, `mastra.updateAction` (all through `applyActionUpdate` / `deriveActionPatch`) | `protectedProcedure`; status accepted from any principal | `noDirectActionWrites.test.ts` (seam only), `applyActionUpdate.test.ts` | `gap` | External agents complete Actions freely (AGENT_RUNS.md, "today's convention"). `Action` has no evidence field; `lastUpdatedBy`/`lastUpdatedSource` are optional and caller-set. Next: fiery.ember, after decision 5 below. |
| Bulk routes: `bulkDelete`, `bulkReschedule`, `bulkDefer`, `bulkAssign*`, `updateActionsProject` | access checks only | `noDirectActionWrites.test.ts` | `gap` | Don't complete, but delete/move commitments; covered by fiery.ember action 3 and inner.crest. |
| Writers that bypass the seam: `webhooks/slack/route.ts#handleActionComplete`, `server/tools/actionTools.ts`, `routers/workflow.ts`, `SyncEngine.ts`, `notion-sync.ts`, `monday-sync.ts`, `github-integration.ts` | none | — | `gap` | `github-integration.ts` writes the invalid statuses `"COMPLETE"` and `"ARCHIVED"`. Sync writers mirror an external system's state, so their evidence is the external change; they need rows of their own in fiery.ember action 3. |
| Owner confirmation in **Delegated** (`inbox.reviewDelegated`, scoped by `delegatedRunsWhere(userId)`) | `protectedProcedure`, owner-scoped | `src/server/services/inbox/__tests__/delegated.test.ts` | `enforced` (as approval) | Approval, not evidence (D-0004). It does not by itself satisfy this principle. |
| Whether the evidence an agent supplies actually proves the outcome | none possible | — | `guidance` | Non-goal: the application checks presence and shape, not truth. |

## 3. Authorized agency

*Act only within authenticated permissions and explicitly delegated authority, with an accountable person.*

| Governed operation | Enforcement point | Test | Status | Limits / Next |
|---|---|---|---|---|
| External agent reach (workspaces, projects, grants) | delegation invariant cascades in `services/externalAgentAccess.ts` (ADR-0049) | `services/__tests__/externalAgentAccess.test.ts`, `externalAgentGrant.test.ts` | `enforced` | Per-agent scopes/allowlists are deferred (ADR-0049). |
| JWT minting, membership, integrations, agent management | `humanOnlyProcedure` denylist | see Identity rows | `enforced` | No Action, Project, Page, Feature, Scope, Requirement or Ticket write uses it, by design (ADR-0016): agents keep the human path. |
| `mastra.mintAgentToken` | `humanOnlyProcedure` (BUG smooth.spruce, PR 909): an agent cannot swap its revocable key for a stateless `agent-context` JWT (ADR-0049 §6) | `routers/__tests__/mastraMintAgentToken.test.ts` | `enforced` | |
| `action.initializeKanbanOrders` | `requireProjectAccess("edit")` middleware (`canEditProject`) before it writes `kanbanStatus`/`kanbanOrder` across the project | `routers/__tests__/actionAuthorizedAgency.test.ts` | `enforced` | Same rule for people and agents; a viewer or non-member gets FORBIDDEN and no row changes. |
| `action.upsertBySource` | `assertCanWriteToWorkspace`, then `getActionAccess` + `canEditAction` on a matched row before refreshing it | `routers/__tests__/actionAuthorizedAgency.test.ts`, `timeEntry.test.ts` › `action.upsertBySource` | `enforced` | A workspace writer (person or agent key) who cannot edit the matched row gets FORBIDDEN and the row is untouched. |
| AI instructions granting authority | never read by access code, by construction: nothing under `services/access/` (resolvers, `resolvePrincipal`, middleware) nor the gates in `trpc.ts`, `externalAgentAccess.ts` and `actions/workspaceGate.ts` reads `aiInstructions` | `services/access/__tests__/aiInstructionsNeverAuthorize.test.ts` | `enforced` | Pins the code, not intent: instruction text can still *ask* an agent to overstep; it just cannot widen what the server allows. |
| Agent acting outside what it was asked to do, within its permissions | none possible | — | `guidance` | |

## 4. Change integrity

*Keep attribution and history; detect and resolve conflicting updates rather than silently replacing a newer commitment.*

Conflicts use one shape everywhere: services throw `RevisionConflictError`
(`src/server/services/revisions/revisionConflict.ts`), routers map it to `TRPCError({ code: "CONFLICT", cause })`,
and the tRPC `errorFormatter` exposes it as `data.conflict`
(`{ kind: "revision_conflict", entity, id, field?, expectedRevision, currentRevision }`). The record is
unchanged on conflict because every check is a compare-and-set in `WHERE`. No client retries automatically.

| Governed operation | Enforcement point | Test | Status | Limits / Next |
|---|---|---|---|---|
| Rich-editor body saves: `page.update` (`bodyDoc`), `feature.update` (`descriptionDoc`), `ticket.update` (`bodyDoc`), `insight.update` | `checkStaleWrite` + `updateMany where { id, docVersion }` (`writePageBodyIfVersion` for pages); `baseVersion` required | `src/lib/prd/__tests__/stale-write.test.ts`, `page.integration.test.ts` › "optimistic concurrency", `feature-doc-sync.test.ts` | `enforced` | Pages, features and tickets now carry `data.conflict`; `insight.update` still returns a message-only CONFLICT. |
| `workspaceUpdate.approve` | `where { id, status: DRAFT, version }` | workspaceUpdate tests | `enforced` | Message-only CONFLICT. |
| Markdown-source writes carrying `baseVersion`: `page.update` (`body`), `feature.update` (`description`), `ticket.update` (`body`), `mastra.updatePage` | `assertBaseRevision` + `update where { id, docVersion: baseVersion }`; a miss (P2025) re-reads and throws `RevisionConflictError` | `routers/__tests__/page-markdown-conflict.test.ts` (incl. `mastra.updatePage`), `feature-doc-sync.test.ts`, `ticket-doc-sync.test.ts`, `page.integration.test.ts` › "two concurrent writes from the same base" | `enforced` | Only when the caller sends `baseVersion`. An unchanged Markdown re-send rewrites nothing and is never a conflict. |
| Markdown-source writes **without** `baseVersion` (today: `exponential pages update --body-file`, Zoe's `update-page`, SDK, MCP) | none: `docVersion` bumps unconditionally | the "without a base" cases in the files above pin the old behaviour | `gap` | Agents can still overwrite a newer edit. Next: proud.walnut (SDK), hyper.nova (CLI), soft.atlas (MCP), wry.goose (mastra) send the base; happy.cliff then requires it for `agent` and `agent_for_human` principals. |
| Generic updates to `Action`, `Project`, `Decision` (and their bulk routes, `upsertBySource`, `mastra.updateAction`/`updateProject`) | none: no revision column (`Decision` has only `updatedAt`) | — | `gap` | Last write wins. Next: inner.crest, for the records decision 4 below marks protected. |
| Attribution (`updatedById`) | none: no model has `updatedById`; `createdById` only | — | `gap` | Attribution of updates lives only in activity rows. See Identity rows for `source` labels. |
| History | `WorkspaceActivityEvent` (no before/after values), `ActionStatusChange`, `ProjectActivity` | activity tests | `gap` (partial) | No field-level before/after history for documents or decisions. Not scheduled in Phase 3. |

---

## Proposals for James to confirm

The PRD's settled decisions 4 and 5 leave the final choice to this audit. These are proposals, not
decisions: nothing below is implemented, and inner.crest and fiery.ember wait for James to confirm.

### Decision 4: which records get a record-level `revision` (proposed)

**Proposal: `Action` and `Decision`. Not `Project` yet; not `Ticket`, `Feature` or `Page` beyond their per-field `docVersion`.**

| Record | Proposed | Why |
|---|---|---|
| `Action` | **protected** | The unit of commitment, and the most-written record: UI, kanban, Zoe, Assistant runs, External agents and four sync engines all write it, with no revision today. |
| `Decision` | **protected** | The record of what was agreed. Rewriting the statement or status of a confirmed decision is exactly what record integrity forbids, and it has only `updatedAt`. |
| `Project` | not yet | Agent writes are rare (`mastra.updateProject`, metadata only) and mostly human-paced. Revisit if the agent write volume grows; adding it later is the same migration pattern. |
| `Ticket`, `Feature`, `Page` | per-field `docVersion` only (done) | Their commitments live in the document body, already compare-and-set. Status moves (ticket QA → DONE, feature roll-up) are lifecycle transitions, better governed by transition rules than by a revision. |

**Granularity within a protected record (proposed):** `revision` bumps only when a *commitment field*
changes, so unrelated edits don't conflict (PRD: "chosen deliberately"):

- `Action`: `name`, `description`, `status`, `kanbanStatus`, `dueDate`, `scheduledStart`/`scheduledEnd`, assignees, `projectId`. **Not** `kanbanOrder` (drag reordering), `lastUpdated*`, sync bookkeeping.
- `Decision`: `statement`, `body`, `status`, `decidedAt`, deciders.

The check applies when a caller sends `baseRevision`, optional at first, then required for agent
principals, the same path pages took (this ticket → happy.cliff).

### Decision 5: evidence for completion (proposed)

**Proposal: a completion-evidence field on `Action` that agent principals must fill in.** Keep the
run-style "propose completion; the owner confirms" for Assistant runs only, as an approval step on top.

Why:

- ADR-0071 says evidence-based completion "is not 'always wait for a person': a successful send
  completes 'Send the proposal'". Routing every agent completion through owner confirmation would turn
  the principle into exactly that.
- D-0004 and the PRD already record that the owner's confirmation is *approval, not evidence*. Making
  it the mechanism would satisfy the server check without satisfying the principle.
- An evidence field is enforceable in one place: `applyActionUpdate` / `deriveActionPatch`, which every
  seam route already uses (`noDirectActionWrites.test.ts` pins that), so it covers the bypass routes.

Proposed shape (for fiery.ember, by migration, after inner.crest):

- `Action.completionEvidence Json?`: `{ kind, summary, ref? }`, where `kind` is one of
  `outcome_observed` (the agent saw the result, e.g. the send returned 2xx), `artifact` (a URL or record
  id that shows the outcome), or `person_reported` (Zoe recording a completion on the person's own
  say-so in chat).
- A move into `COMPLETED`/`DONE` by an `agent` or `agent_for_human` principal without valid evidence is
  refused with `BAD_REQUEST`. People are unaffected.
- Sync writers (Notion, Monday, GitHub, Slack) record their external source as the evidence
  automatically: they mirror an outcome another system already observed.
- Limit, recorded as `guidance`: the server checks that evidence is present and well-formed, not that it
  is true.

Rejected alternative: propose-and-confirm for every agent completion. It is simpler (no migration), but it
conflates approval with evidence and blocks legitimate autonomous completions.
