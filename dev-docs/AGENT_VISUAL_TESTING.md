# Agent visual testing

How an agent (or a developer) verifies UI changes in a real, authenticated,
data-bearing app — without an OAuth round-trip and without touching shared
databases.

## TL;DR

```bash
npm run test:e2e          # boots next dev on :3100, seeds, mints a session, runs e2e/*.spec.ts
```

For ad-hoc browsing instead of specs:

```bash
npm run dev:seed-fixture  # idempotent: workspace dev-fixture → product → feature → tickets
npm run dev:session       # prints an authjs.session-token cookie for the fixture user
```

Set the printed cookie in any browser context, then open the URL the seed
script prints. `npm run dev:session -- --json` for machine-readable output;
`--email you@example.com` mints for any *existing* user (it never creates one).

## How it works

- The app uses NextAuth v5 with `session: { strategy: "jwt" }`
  (`src/server/auth/config.ts`), so a session is a self-contained JWE derived
  from `AUTH_SECRET` + the cookie name as salt. `scripts/dev-fixture/session.ts`
  calls the same `encode()` the framework uses — no auth-bypass code path
  exists in the app itself; nothing here ships to the client bundle.
- `scripts/dev-fixture/seed.ts` seeds a disposable `dev-fixture` workspace:
  one product (`fixture`), one feature, six tickets across statuses — including
  one ticket that is deliberately scope-only (attached to a `FeatureScope`,
  not the feature) because the feature Tickets accordion excludes those by
  design; the fixture makes the exclusion observable.
- `e2e/global-setup.ts` runs seed + mint and writes
  `e2e/.auth/storageState.json` (cookies) and `e2e/.auth/fixture.json`
  (seeded ids/urls). Both are gitignored. Every spec starts authenticated.
- `playwright.config.ts` boots `next dev --turbo` on port **3100**
  (`reuseExistingServer` outside CI), so the suite is one command with no
  manual startup. Specs are `e2e/*.spec.ts`; vitest owns `*.test.ts`, so the
  two suites never collide.

## Safety rails

`scripts/dev-fixture/env.ts` guards every entry point (both CLIs and the
Playwright global-setup):

- refuses `NODE_ENV=production`;
- hard-blocks managed-service DB hosts (same pattern list as
  `src/test/test-db.ts`, which exists because a test run once wiped
  production);
- requires a localhost-ish `DATABASE_URL` (or one that is explicitly a test
  DB);
- loads `.env.local` + `.env` the way `next dev` does — `AUTH_SECRET` lives in
  `.env.local`, which Prisma's own env loader does **not** read.

A minted cookie only works against a server sharing the local `AUTH_SECRET`;
it is inert against production.

**No real email.** A `next dev` with `.env.local` sends through the live
Postmark key, so booking a meeting emails real calendar invites. Set
`EMAIL_DELIVERY_DISABLED=1` and `sendEmail` refuses every send, whatever the
key source (env or a workspace's Postmark integration); callers treat the
failure as non-fatal. The Playwright `webServer` sets it. **A reused server
(one already listening on the e2e port) does not get it** — start that one
with `EMAIL_DELIVERY_DISABLED=1 npx next dev -p 3100`; the schedule-meeting
spec asserts "0 invites sent" and fails if delivery was on. Use the same
switch for ad-hoc browsing that books or cancels meetings.

## Writing specs

- Prefer functional assertions (roles, links, badge text) over pixel diffs —
  screenshots are attached to every test (`test.info().attach`) for human
  review instead of being gated on.
- First navigation to a route on `next dev` pays compile + fetch cost: anchor
  each test with one generous `toBeVisible({ timeout: FIRST_PAINT_TIMEOUT })`
  on real content, then assert normally (see `e2e/feature-tickets.spec.ts`).
- Get seeded ids/urls from `loadFixture()` (`e2e/fixture-data.ts`) rather than
  hardcoding CUIDs.

## Page-load performance harness

`e2e/perf/` measures every authenticated page against a **production build**
(timings from `next dev` are meaningless). It has its own config,
`playwright.perf.config.ts`, with one worker, because parallel timing runs on
one machine corrupt each other.

```bash
npx next build
npm run test:perf                                   # all ~160 routes, ~55 min
PERF_ROUTES='crm/contacts$' PERF_RUNS=3 npm run test:perf   # a subset
npx tsx e2e/perf/report.ts e2e/.results/perf/<run-id>       # ranked table
```

- **Data**: global setup seeds `dev-fixture` and then `scripts/seed-perf-fixture.ts`
  (1,500 actions, 1,600 contacts, 300 tickets, …). The default fixture is too
  small to expose slow queries or oversized payloads.
- **Per route**: 1 warm-up, then `PERF_RUNS` hard loads (cold context) and
  `PERF_RUNS` client navigations from the workspace home (sidebar click when
  the link exists, `router.push` otherwise). Each tRPC procedure the page
  issued is then replayed alone server-side.
- **Recorded**: TTFB, LCP, content-ready, JS bytes, tRPC requests,
  procedures and decoded payload, a waterfall-depth heuristic, duplicate
  procedures, and per-load DB statement counts when `pg_stat_statements` is
  loaded (start Postgres with `-c shared_preload_libraries=pg_stat_statements`).
- **Filters**: `PERF_GROUP` (see `e2e/perf/routes.ts`), `PERF_ROUTES` (regex on
  the route pattern), `PERF_RUN_ID` (output directory name).
- **Knobs**: `PERF_PORT` (reuses an already-running `next start`, which must
  have `AUTH_TRUST_HOST=true`), `PERF_LATENCY_MS` (CDP-added RTT).
- **A/B**: build each side in its own checkout, run both against the same
  seeded DB, and compare medians from the same machine in the same session.
  Baselines from a different day or machine aren't comparable.

The 2026-09-16 baseline and root-cause analysis are in
`dev-docs/perf/page-load-baseline-2026-09-16.md`.

## Running a real agent chat locally

Everything above verifies the app. None of it calls a model: the agents live in
the Mastra repo (`../mastra`), and a change to a prompt, a tool or a model
setting there is only proven by a real model call. The Mastra repo has a
one-command live smoke test for that: one real turn of the Assistant agent,
with one real tool call, printing the reply, the tool calls and the cost.

```bash
# In the Mastra checkout. No app needed: a built-in stub answers the tool call.
npm run smoke:live -- --stub-app
```

To run the real path, the agent's tools calling **this** app, start the app and
hand the script an agent token for the fixture user:

```bash
# In this checkout
npm run dev:seed-fixture        # once
npm run dev                     # the app on :3000

# In the Mastra checkout
SMOKE_AUTH_TOKEN=$(cd ../exponential-app && npm run -s dev:agent-token) npm run smoke:live
```

`npm run dev:agent-token` prints an `agent-context` JWT, the same token the chat
route gives Mastra, for the fixture user (`--email` for any existing local user,
`--json` for the user id and expiry). It has the same safety rails as
`dev:session`, never creates a user, lasts 30 minutes, and is inert against any
server that does not share the local `AUTH_SECRET`. The smoke script refuses an
app that is not on `localhost`. A fixture seeded with `dev:seed-perf` has
hundreds of overdue actions, so the tool result is large and the run costs more
than the stub run; the plain fixture is enough.

**The key.** The smoke test spends `ANTHROPIC_API_KEY_DEV` and nothing else: a
separate Anthropic key in its own workspace with a monthly spend limit
(50 USD), kept in the Mastra checkout's `.env` and, for CI, as a secret read
only by the Mastra repo's `eval.yml` workflow. The script refuses to run on the
production key (`ANTHROPIC_API_KEY`) or in production. Details, the full list of
refusals, and what the smoke test does and does not cover are in the Mastra
repo's `README.md`, "Running a real agent turn".

**In a PR.** For a change the smoke test covers, run it and paste the report
(reply, tool calls, cost) into the PR instead of writing "not run against a
live model". For a Mastra branch, `gh workflow run eval.yml --ref <branch>` in
the Mastra repo does the same in CI and puts the report in the run summary.

## Cleanup

Everything hangs off the fixture workspace; to remove it, delete the
`dev-fixture` workspace (cascades to product/feature/tickets) and the
`dev-fixture@exponential.test` user.

## In CI

`.github/workflows/e2e.yml` runs the suite nightly against `main` and on
demand (`gh workflow run e2e.yml --ref <branch>`): a `pgvector` Postgres
service, `prisma migrate deploy`, `playwright install --with-deps chromium`,
then `npm run test:e2e` with dummy env (`DATABASE_URL` on localhost, a dummy
`AUTH_SECRET`, a test `DATABASE_ENCRYPTION_KEY`). It boots `next dev --turbo`
like a local run, so cold route compiles make it slow — acceptable for a
nightly. It is **not** a required check and is not on the PR path; the
Playwright HTML report and `e2e/.results` are uploaded as an artifact on
failure.

## Not built (yet)

- **A PR smoke subset**: a handful of fast specs (e.g. `route-gating`,
  `command-palette`, `topbar-crumb`) tagged and run on PRs, still non-required.
  Worth doing once the nightly has been green for a couple of weeks.
- **Pixel-diff gating** (`toHaveScreenshot`): add selectively once the suite
  has been stable for a while, if at all.
