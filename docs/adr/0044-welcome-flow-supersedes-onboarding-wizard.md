# ADR-0044: Welcome flow supersedes the onboarding wizard

Status: Accepted (2026-07-17)

## Context

New users faced two sequential first-run flows: the 6-step onboarding wizard at `/onboarding` (profile, video, tools survey, calendar, work hours, first project) followed by the assistant-guided Getting Started page at `/welcome` (goal → action → plan → calendar). That meant two routing gates (`onboardingCompletedAt`, `welcomeCompletedAt`), two progress trackers (the wizard-seeded "Learn Exponential" project — kept in sync by fire-and-forget `completeOnboardingStep` calls across six modules, silently broken when the project was missing — and `welcomeSetupState`), and preferences (work hours, profile photo) that could only ever be set once, inside the wizard.

## Decision

`/welcome` is the sole new-user gate. Routing derives only from `welcomeCompletedAt` plus account age — and since `User` has no `createdAt` column, account age is proxied by the earliest owned `Workspace.createdAt` (the Personal workspace is auto-created at signup); users owning no workspace classify as old (`resolveNewUserRedirect` in `src/server/services/welcome/`). The redirect fires only while the account is under 24 hours old; after that the dismissible WelcomeBanner is the only nudge. `/onboarding` is a redirect stub for one release, then disappears.

The wizard, its illustrations, the onboarding router, `services/onboarding/`, and every seeded-project sync call are deleted; `welcomeSetupState` is the single progress tracker, and admin lifecycle status (active / onboarding / registered) derives from it. Work-hours and profile capture moved to Settings → Profile (shipped first, in V2). Attribution ("how did you hear about us") and email-marketing opt-in capture are deliberately dropped with no replacement — no code or human ever consumed the data. Existing "Learn Exponential" projects survive as ordinary projects; `completeWelcome` no longer touches them.

The ten deprecated `User` columns (`onboardingCompletedAt`, `onboardingStep`, `onboardingProjectId`, `projectSetupCompletedAt`, `attributionSource`, `emailMarketingOptIn`, `selectedTools`, `workRole`, `workFunction`, `usagePurposes`) stay in the schema, marked `/// Deprecated` — dropping them is a separate later migration (V4), so retiring the survey isn't conflated with destroying its historical answers.

## Rejected alternatives

- **Hard gate until completion** — turns a growth flow into a jail; skip affordances + banner cover the long tail.
- **Folding attribution/tools capture into /welcome** — the flow's design premise is minimum path to first value; nothing consumed those answers.
- **Lazy-creating the seeded project on first visit** — resurrects dual trackers and silent-failure sync.
- **Reading the dead onboarding columns to classify legacy mid-wizard users** — a vanishing cohort; they reclassify as registered.
