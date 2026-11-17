# The app is its own OAuth authorization server for MCP clients

## Status

Accepted — 2026-11-16. Amends point 5 of
[ADR-0049](0049-external-agents-first-class-principals.md): static keys remain, and an OAuth
connection is a second credential for the same principal. Decided in the hosted MCP Agent PRD
(D5, D7 to D12); this file landed with the change that built the first half (ticket
`bold.heron`).

## Context

The hosted MCP endpoint (`/api/mcp`) authenticates with an External agent key or a personal API
token sent as a Bearer header. That works for clients that take a header, such as Claude Code
and Cursor, but the clients most people use do not: Claude.ai's and ChatGPT's custom connectors
take only a URL and expect to sign in with OAuth, following the MCP authorization spec
(2025-11-25): protected-resource metadata (RFC 9728), authorization-server metadata (RFC 8414),
PKCE with S256, dynamic client registration (RFC 7591) or a client ID metadata document, and
tokens bound to the resource they were issued for (RFC 8707).

Someone has to be the authorization server. The app already signs people in with NextAuth, but
NextAuth is an OAuth *client*. A self-hosted install has nothing but the app and its database,
and must be able to offer the same sign-in.

## Decision

1. **The app is the authorization server.** The issuer is the app's own origin and the resource
   is `<origin>/api/mcp`, both read from env and never from the request, so a spoofed `Host`
   cannot change a token's audience. The discovery documents live at the well-known paths, and
   the 401 from `/api/mcp` points at the protected-resource metadata. `MCP_OAUTH_MODE`
   (`off` | `admin` | `on`) gates it all: off, the documents and OAuth routes 404; admin, only
   app admins can approve.
2. **Every client is public.** Clients register themselves and get a `client_id`, never a
   secret, or use the URL of a client ID metadata document they publish as their `client_id`
   (fetched through the outbound SSRF guard, cached for 24 hours). PKCE with S256 is required on
   every authorization. Redirect URIs are https, loopback http or a private-use scheme, and match
   exactly except a loopback URI on any port.
3. **A connection is a person's grant to one client, bound to one External agent.** Its access
   token resolves to exactly the context that agent's key does: the shadow user, never an admin,
   token type `agent-key`. Every access path, the denylist (`humanOnlyProcedure`) and the
   delegation invariant of ADR-0049 therefore apply unchanged, and the agent is the accountable
   author of what the client writes.
4. **Tokens stay opaque and hashed.** Codes (`exp_oac_`, five minutes, one use), access tokens
   (`exp_oat_`, one hour) and refresh tokens (`exp_ort_`, 90 days, rotated on use) are random
   secrets stored only as SHA-256 hashes, as agent keys are. Disconnecting deletes them and takes
   effect on the next request; a code presented twice revokes the connection's tokens.
5. **An access token is honoured only where its audience is.** `/api/mcp` accepts it;
   `/api/trpc` refuses it outright.
6. **Consent is shown on every authorization**, and approving is a `humanOnlyProcedure`, so no
   agent credential, an OAuth token included, can grant access.

## Considered options

- **A hosted identity service (WorkOS, Stytch, Auth0).** Rejected: a self-hosted install could
  not use it.
- **An OAuth server library, or the MCP SDK's `mcpAuthRouter`.** Rejected: the SDK's router is
  Express middleware, and the general libraries bring their own session and storage models. The
  surface needed is two documents and four endpoints.
- **JWT access tokens.** Rejected for the reason of ADR-0049 point 5: revocation would not be
  immediate.
- **A new token type for OAuth requests.** Rejected: five places key on `agent-key` today
  (`Action.source`, the Agent-run callback guard, `resolvePrincipal`, `agentSurface`, the
  analytics surface map), and the principal is the same kind; a new type only adds places to
  forget.
- **Accepting OAuth access tokens on `/api/trpc`.** Rejected: the token's audience is the MCP
  endpoint, and honouring it elsewhere breaks the audience check the spec requires.
- **Remembering consent and skipping the screen.** Rejected: dynamic registration lets any
  client claim any name, so each authorization is shown.
- **A fresh agent for every registration.** Rejected: clients that re-register would leave a
  trail of agents with the same name. A connection is matched to its client by name and
  redirect hosts and reuses its agent.

## Consequences

- Four tables (`OAuthClient`, `OAuthConnection`, `OAuthAuthorizationCode`, `OAuthToken`) in one
  migration.
- Built in steps behind `MCP_OAUTH_MODE`: discovery, registration, consent and the code grant
  first, where the person picks one of their agents or sets up a new one on the consent screen
  (created in the same transaction as the connection, with no key); then refresh rotation with
  replay revocation, client ID metadata documents and the revocation endpoint (ticket
  `loud.viper`); one agent per client reused on reconnect, and the Settings → Agents view of
  connections, after that.
- A rotated token row is kept until its refresh token would have expired, so a replay is
  recognised; every grant prunes the connection's expired rows and codes in its own transaction,
  so there is no cleanup job.
- On Vercel previews the issuer resolves to production, so OAuth is exercised locally or on an
  install with `NEXT_PUBLIC_APP_URL` set.
- Secret scanners can tell the three token kinds apart by prefix, and from agent keys.
