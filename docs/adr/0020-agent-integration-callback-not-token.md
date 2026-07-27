# Agent reaches external integrations via authenticated callback, not by passing the credential to the LLM

## Status

Accepted — 2026-06-15

## Context

**Zoe** (the brain) needs to read from and write to a user's connected **Notion**
integration on their behalf — the trigger was a user asking "what are my outgoings for the
rest of the year?", expecting Zoe to read their Notion payments database.

The Notion tools already exist in `../mastra` (`src/mastra/tools/notion-tools.ts`), but they
resolve the Notion client from a **raw OAuth/API token read out of `requestContext`**
(`getClientFromRuntime` → `requestContext.get("notionAccessToken")`). The chat stream route
(`src/app/api/chat/stream/route.ts`) **deliberately stops putting that token in the context**:

```
// NOTE: Notion OAuth tokens are no longer passed to agents to prevent
// exfiltration via prompt injection.
// Agents that need Notion access should call back to authenticated app endpoints instead.
```

So today the tools are registered on Zoe but throw "Notion is not connected" at runtime — the
token they reach for is never present. The user sees a misleading dead-end (their Notion *is*
connected). We need to make Notion reachable again **without** reintroducing the token into the
model's context.

Every *other* data tool on Zoe already solves this. `okr-tools`, `project-tools`, etc. read
only an `authToken` (the short-lived agent JWT) from `requestContext` and call
`authenticatedTrpcCall("mastra.<x>", …)` back into this app's `mastra` tRPC router, which
resolves the JWT to a `userId` and does the work server-side. The credential (DB access) never
leaves the server. Notion is the lone tool that took the credential-in-context shortcut.

This is the read-side sibling of [ADR-0016](0016-agent-activity-writes-reuse-human-path.md)
(agent *writes* reuse the human path): there the concern was *authorization parity*; here the
concern is *credential handling* — a distinct axis.

## Decision

1. **The credential never enters the LLM context.** Notion's API key stays server-side. Zoe's
   Notion tools carry only the agent `authToken` (as every other data tool does) and call back
   into `mastra.*` endpoints; they no longer read `notionAccessToken` from `requestContext`.
   `getClientFromRuntime` is retired. This generalizes to **any tokened integration** — Notion
   is just the first instance.

2. **`mastra.*` proxy → shared service → `NotionService`.** New `mastra.notion*` endpoints
   resolve the user's Notion credential server-side (`getDecryptedKey` over the
   `provider:"notion"` `Integration`, the same lookup `workflow.ts` already uses), instantiate
   `NotionService`, and return the result. The lookup logic lives in one shared service called
   by the proxy, not duplicated inline (CLAUDE.md's centralized-resolver rule).

3. **Credential discovery is workspace-scoped with a personal fallback.** The endpoint resolves
   the `Integration` by `{ provider:"notion", userId, workspaceId }` when a `workspaceId` is in
   the turn context, falling back to the user's workspace-less personal Notion integration if no
   workspace-scoped row matches. Mirrors the settings page's own query. Avoids cross-workspace
   credential bleed for users with separate Notion accounts per workspace.

4. **Read + write, but writes are gated by mandatory draft-and-confirm.** All five operations
   are wired (search, query-database, get-page, create-page, update-page). Reads pour external
   Notion content into Zoe's context — which carries an **inherent content-injection risk**
   (a poisoned page can carry instructions), the same posture we already accept for web and
   email reads. We do **not** mitigate that with taint tracking. Instead, writes follow
   [ADR-0016](0016-agent-activity-writes-reuse-human-path.md)'s draft-and-confirm: Zoe never
   mutates Notion without surfacing the exact change and getting an explicit "yes", so an
   injected write cannot execute silently — the human is the gate.

5. **Lean, capped payloads.** Tool results are projected to a small shape server-side before
   returning (Thread-cost discipline — see the **Thread cost** glossary entry): `query-database`
   caps at ~25 rows returning id/title/url + scalar properties (not rich-text blobs);
   `get-page` truncates block text (~3k chars, `truncated:true`); `search` returns
   id/type/title/url only. Tool descriptions tell Zoe to page/refine when truncated.

6. **Distinguish "not connected" from "connected but empty".** The endpoints return a structured
   result separating *no Notion integration* (`{ connected:false }`) from *integration present,
   zero matches* (`{ connected:true, total:0 }`). Because a Notion **internal integration token
   only sees pages explicitly shared with it**, zero-results is the most likely post-fix dead-end.
   The tool description coaches Zoe to tell the user, on zero results, that the integration only
   sees explicitly-shared pages and how to share one — rather than reproducing the original
   confusing dead-end.

## Considered alternatives

- **Reintroduce the raw token into `requestContext`** (the pre-existing `getClientFromRuntime`
  shape). Rejected: this is exactly what route.ts walked back — a prompt-injected page could
  coax the model into emitting the token. Credential-in-context is the vulnerability.

- **Scope the credential by `userId` only (most-recent integration).** Rejected: a user with a
  work Notion in one workspace and a personal Notion in another could get the wrong account
  answering a question. Workspace-scoping with fallback is barely more code and removes the bleed.

- **Read-only first, defer writes.** Considered (smaller surface, lower risk). Rejected for this
  slice: the existing tool set is read+write and draft-and-confirm already makes writes safe; we
  ship parity.

- **Scope writes to configured sync databases / taint-track read content.** Rejected as
  over-engineering for now: mandatory draft-and-confirm already puts a human between any
  injected instruction and a mutation, and database-scoping would block legitimate "add this to
  my notes" asks. Revisit if a real injection-to-write path is demonstrated.

## Consequences

- `../mastra`'s `notion-tools.ts` is rewritten to the `authToken` + `authenticatedTrpcCall`
  shape; `getClientFromRuntime` and the `notionAccessToken` context key are removed.
- New `mastra.notion*` endpoints + a shared Notion-access service in this repo
  (`src/server/api/routers/mastra.ts` + `src/server/services/`), reusing the existing
  `Integration` / `getDecryptedKey` / `NotionService` primitives.
- `route.ts`'s comment ("agents should call back to authenticated app endpoints instead")
  becomes the *implemented* contract, not just an aspiration.
- Content-injection-via-read remains an accepted, documented residual risk for Notion (as for
  web/email). The mitigation is the write-side confirmation gate, not read-side sanitization.
- The pattern is the template for the next tokened integration (Slack, etc.): credential
  resolved server-side, agent holds only the JWT.
