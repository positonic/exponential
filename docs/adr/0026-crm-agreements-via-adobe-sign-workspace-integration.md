# CRM Agreements are signed via Adobe Sign, connected once per workspace

## Status

Accepted — 2026-06-18. Builds on [ADR-0020](0020-agent-integration-callback-not-token.md)
(credentials resolved server-side via the Integration model).

## Context

The onboarding **Automation** must send a partner/advisor a signable **Agreement**.
The sibling `../one-2b` codebase already does e-signature — **not DocuSign**, but
**Adobe Sign**: an HTML template is filled with placeholders, uploaded as a
"transient document", turned into an agreement sent `SEND_FOR_SIGNATURE`, and a
webhook flips a status row on `AGREEMENT_WORKFLOW_COMPLETED`
(`one-2b/src/lib/adobe-sign.ts`). We want to replicate that proven approach.

one-2b authenticates Adobe Sign with **per-document OAuth** (tokens stored on each
signature row) because there the *end user signs their own module* — the signer
authenticates. Our case inverts this: the *business* sends agreements to external
partners, who just sign. So the credential belongs to the **workspace**, not the
recipient.

## Decision

1. **Provider: Adobe Sign**, mirroring one-2b's flow (transient document →
   agreement → completion webhook). Not DocuSign.
2. **Connected once per workspace via the `Integration` model** — an admin connects
   Adobe Sign in Settings → Integrations; tokens are encrypted and resolved
   server-side (ADR-0020 pattern), the same as Notion/Fireflies/Slack. **Not**
   one-2b's per-recipient OAuth.
3. **Templates are per–Customer-type HTML files in the repo** for the PoC (one for
   Channel Partner, one for Advisor) — DB-backed editable templates are deferred.
4. **Two emails, one job each:** a branded "welcome" email we send (logged as a
   `CrmCommunication`) and Adobe Sign's own hosted "review & sign" email. We do not
   attach the unsigned agreement or self-host the signing link in the PoC.

## Considered alternatives

- **DocuSign.** Rejected — we already have a working Adobe Sign integration to
  copy from in one-2b.
- **Port one-2b's per-document OAuth verbatim.** Rejected — wrong ownership model
  here (assumes the signer authenticates) and bypasses the Integration pattern.
- **Single shared service account via env vars.** Rejected — doesn't generalize to
  multiple workspaces/clients and leaks one Adobe account across tenants.
- **One combined email with a self-hosted signing link.** Deferred — means
  suppressing Adobe's email and owning signing-link deliverability ourselves.

## Consequences

- One Adobe Sign connection per workspace is an admin one-time setup step.
- Signing status is driven by the Adobe webhook; the PoC needs a webhook route and
  a place to record agreement status (model TBD at implementation).
- Editing an agreement's wording is a code deploy until DB-backed templates land.
