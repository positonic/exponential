# Form intake spam defense is layered and privacy-first; no third-party captcha by default

## Status

Accepted — 2026-06-25.

## Context

The public **Intake** route (`POST /api/forms/[slug]/submit`, ADR-0029) is
unauthenticated and, on a new-contact submission, fires a **real outbound email**
via the CRM automation engine (`create_crm_contact` →
`dispatchContactTypeAutomations` → `send_email`). So spam is not just junk
`CrmContact`/`FormSubmission` rows — it burns email-sending reputation and money.
It needs real abuse protection.

Two existing layers shipped with ADR-0029: a hidden **honeypot** field and
per-IP/per-email **in-memory** rate limiting. The second is a known stopgap — the
route's own comment and ADR-0030 both name Upstash as "the real fix". On Vercel
each serverless instance holds its own `Map`, so the windows are per-lambda and
reset on cold start: a determined or post-scale attacker slips through.

The obvious next reach is a captcha. But Forms treats applicant PII carefully
(ADR-0029: `CrmContact.email` encrypted, only `emailHash` retained). A mainstream
captcha cuts against that: **Cloudflare Turnstile** loads a third-party script and
discloses **every applicant's IP + browser signals to Cloudflare** (a US
processor) — better than reCAPTCHA (no ad business, ~cookieless) but still a
third party introduced into an otherwise first-party, privacy-careful flow.

## Decision

Defend in **layers, cheapest-and-most-private first**, and do **not** add a
third-party captcha by default:

1. **Honeypot** — keep (free, already shipped).
2. **Time-trap** — stamp form-render time client-side; reject submissions
   completed in under ~3s (bots are instant). Free, first-party, zero data
   sharing.
3. **Durable rate limiting** — move the per-IP/per-email windows from the
   in-memory `Map` to **Upstash** (`@upstash/ratelimit`), so the limits actually
   hold across serverless instances. This is the fix ADR-0030 already endorsed.
4. **Escalation only if needed: Altcha**, a **self-hosted** proof-of-work captcha
   — verified by our own server, **no third-party calls, no IP disclosure, no
   behavioural profiling**. Reserved for when real bot traffic beats layers 1–3.

All four layers are **$0** in licensing; Upstash sits inside its free tier at a
job-form's volume. Cost and privacy point the same way here.

## Considered alternatives

- **Cloudflare Turnstile.** Free and low-friction, but discloses every visitor's
  IP + browser fingerprint-ish signals to a US processor and adds a third-party
  script — inconsistent with the Forms PII posture. Reserved as a last resort
  ("we accept a Cloudflare processor"), not a default.
- **Google reCAPTCHA.** Rejected — heaviest privacy cost (ad-tracking ecosystem),
  worst fit.
- **Friendly Captcha.** Same PoW privacy story as Altcha but a paid EU SaaS — no
  reason to pay when self-hosted Altcha is free.
- **Keep in-memory rate limiting.** Rejected — porous on serverless, already
  flagged as a stopgap by ADR-0030 and the code itself.

## Consequences

- Adds **Upstash** as an infra dependency (one account + env vars). Already
  anticipated by ADR-0030.
- The time-trap can, in theory, reject a genuinely fast paste-and-submit; the ~3s
  threshold is conservative and tunable, and a rejected human can simply retry.
- Choosing Altcha-when-needed over an always-on captcha means a brief window of
  weaker protection if a sophisticated bot appears before Altcha is wired —
  accepted, because layers 1–3 cover the realistic threat for a niche job form
  and the email-cost blast radius is bounded by rate limits.
- If Altcha is ever added, it ships behind the same self-hosted/HMAC-secret model
  — no applicant data leaves Exponential.
