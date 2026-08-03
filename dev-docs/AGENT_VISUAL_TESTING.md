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

## Writing specs

- Prefer functional assertions (roles, links, badge text) over pixel diffs —
  screenshots are attached to every test (`test.info().attach`) for human
  review instead of being gated on.
- First navigation to a route on `next dev` pays compile + fetch cost: anchor
  each test with one generous `toBeVisible({ timeout: FIRST_PAINT_TIMEOUT })`
  on real content, then assert normally (see `e2e/feature-tickets.spec.ts`).
- Get seeded ids/urls from `loadFixture()` (`e2e/fixture-data.ts`) rather than
  hardcoding CUIDs.

## Cleanup

Everything hangs off the fixture workspace; to remove it, delete the
`dev-fixture` workspace (cascades to product/feature/tickets) and the
`dev-fixture@exponential.test` user.

## Not built (yet)

- **CI wiring**: needs a Postgres service/testcontainer + `next build` +
  `playwright install` in the workflow. The suite is CI-shaped already
  (`forbidOnly`, retries, github reporter) — this is deliberate scope for a
  follow-up PR.
- **Pixel-diff gating** (`toHaveScreenshot`): add selectively once the suite
  has been stable for a while, if at all.
