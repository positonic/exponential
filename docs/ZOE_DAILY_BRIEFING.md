# Zoe Daily Briefing — Internal Reference

> **Audience:** future-you + collaborators. Not user-facing. Not linked from any public docs site.
> **Status:** **Design only — not implemented.** Everything below is the intended
> design. Only the schema exists; see [Current state](#current-state) for what is
> actually built, and what shipped instead.

## What this is

A one-paragraph AI "take on your day" that appears at the top of `/today`. It reads the user's actions scheduled for today and suggests a prioritization order + rationale. The user can Accept the plan, dismiss it, refresh to regenerate, or thumbs-up/down.

It's opt-in per user via a setting at `/settings` (off by default). The per-user toggle lives on `NavigationPreference.showDailyBriefing`.

**It's deliberately not automatic.** A briefing is only created when the user asks for one (clicks "Generate" or "Refresh"). This keeps token costs bounded and the signal clean — every briefing represents a user who *wanted* a recommendation.

## Why this document exists

The feature is cheap to ship but the *interesting* part is what comes later: an automated loop that improves the prompt overnight, inspired by [karpathy/autoresearch](https://github.com/karpathy/autoresearch). Every design choice below is in service of *making that loop possible*. If you're reading this months from now wondering "why all the logging ceremony for a single AI card?" — the answer is: so we can optimize the prompt against real usage signal, not vibes.

## The autoresearch pattern (adapted)

Karpathy's repo gives an agent a single file to edit (`train.py`), runs it for a fixed time budget, scores it on `val_bpb` (bits per byte), and keeps/discards. The loop runs overnight and converges on a better model.

For a subjective recommendation, we can't use `val_bpb`. But the *loop structure* applies:

| Karpathy's autoresearch      | Zoe briefing loop                                         |
| ---------------------------- | --------------------------------------------------------- |
| `train.py` (file agent edits) | `zoe-daily-program.md` (prompt file agent edits)          |
| 5-minute training run         | Regenerate briefings against fixture set                  |
| `val_bpb` (auto metric)       | Composite: rank-correlation + LLM-as-judge                |
| Keep/discard based on metric  | Promote prompt version if composite improves             |
| Overnight = ~100 experiments  | Overnight = ~N prompt variants per fixture set            |

**The honest oracle** is real-user signal (acceptance rate, top-1 execution rate). The fixture-set + judge loop is the fast cheap thing; real-user metrics catch cases where the loop overfit to the judge.

## Data model

### `DailyBriefing`

One row per briefing generated. Multiple rows can share `(userId, date)` — most-recent-by-createdAt is "current" (see `zoeBriefing.getCurrent`).

| Field              | Purpose                                                             |
| ------------------ | ------------------------------------------------------------------- |
| `promptVersion`    | Every metric is sliced by this. Bump it whenever the prompt changes. |
| `modelId`          | So we can disentangle "new prompt" from "new model"                 |
| `inputSnapshot`    | **Frozen input** — actions list + any context fed to the agent. Replayable offline against new prompt variants. This is the key to the eval loop. |
| `outputText`       | What was shown to the user                                          |
| `outputStructured` | Ranked list: `[{actionId, rank, reason}]`. Lets us compute rank correlation against actual completion order. |
| `latencyMs`, `tokensIn`, `tokensOut` | Cost/perf tracking.                          |

### `BriefingInteraction`

Every user response. Types: `viewed | accepted | dismissed | refreshed | thumbs_up | thumbs_down`. `viewed` is auto-logged on render. The rest are explicit clicks.

### Action.completedAt (existing)

Used to derive **top-1 execution rate** and **rank correlation** without a dedicated `ActionEvent` table. Join `DailyBriefing.outputStructured[0].actionId` against `Action.completedAt == briefing.date` to answer "was the top pick actually done today."

## Prompt versioning

The prompt lives as a constant in `src/server/api/routers/zoeBriefing.ts`:

```ts
export const ZOE_DAILY_PROMPT_VERSION = "zoe-daily-v1";
```

**Bump the version every time the prompt changes.** Format: `zoe-daily-vN` or `zoe-daily-vN-experimentname`. Never reuse a version — that corrupts the metrics.

When the eval loop exists, it will edit `zoe-daily-program.md` (to be created) and the router will load the prompt from that file with the version derived from git SHA of the file.

## Metrics (per `promptVersion`, rolling weekly)

Computed by the admin page at `/admin/daily-briefing` (when built).

- **Acceptance rate** = `count(interactions where type=accepted) / count(briefings where viewed)`. Cheap. Noisy — people accept because it's the easy click.
- **Top-1 execution rate** = `count(briefings where outputStructured[0].actionId completed that day) / count(briefings)`. Most product-meaningful. **This is the primary optimization target.**
- **Rank correlation** = Spearman between `outputStructured` ranking and the user's actual completion order across the day. Measures whole-list quality.
- **Dismissal rate** = `dismissed / viewed`. Red flag if > ~20%.
- **Avg latency, tokens** = cost/perf tracking. Keep an eye on these when prompt grows.

**Pick one primary metric.** Default: top-1 execution rate. Acceptance rate is the fastest signal but easiest to goodhart.

## Current state

Verified 2026-08-04. An earlier revision of this file checked five of these
boxes; only the first was ever true. Re-verify before trusting it again.

- [x] Schema: `DailyBriefing` (`prisma/schema.prisma:1897`), `BriefingInteraction`
      (`:1920`), `NavigationPreference.showDailyBriefing` (`:1888`) — **all three
      exist and none is read or written anywhere in `src/`.** Dead tables.
- [ ] Opt-in toggle in `/settings` — `showDailyBriefing` appears zero times in `src/`.
- [ ] tRPC router `zoeBriefing` — does not exist. (`src/server/api/routers/briefing.ts`
      is the unrelated data-aggregation router; there is no `zoeBriefing.ts`.)
- [ ] `DailyBriefingCard` on `/today` — no such component.
- [ ] Admin page at `/admin/daily-briefing` — no such route.
- [ ] Eval harness, fixture set, prompt variant scoring.

### What shipped instead

The AI card on `/today` is a different implementation that bypasses everything
above: `scheduling.getSchedulingSuggestions`
(`src/server/api/routers/scheduling.ts`) → Mastra's `ashAgent`, rendered by
`ZoePanel`. Three ways it diverges from this design, each worth knowing before
you build on it:

- **It regenerates on page load** — a `useQuery` with `staleTime: 5min`, firing an
  LLM round-trip per render. That is precisely the first entry under
  [Gotchas](#gotchas) below.
- **Nothing is persisted.** No `DailyBriefing` row, no `promptVersion`, no
  `inputSnapshot`, no interaction log. Dismissal is React state and dies on
  reload. So none of the metrics below can currently be computed, and there is
  no replayable input for the autoresearch loop.
- **It is not Zoe.** `ashAgent` is a tool-less GPT-4o lean-startup persona whose
  instructions are overridden by a per-call system message. Model, prompt, and
  persona are all unrelated to the branding on the card.

## Roadmap to the autoresearch loop

1. **Collect signal (now through ~2 weeks out)** — let real users opt in. We need maybe 100+ briefings with interactions before any eval is meaningful. Watch the admin page.
2. **Build fixture set** — once we have briefings-with-accept-and-completion, export ~50 `inputSnapshot`s that have a clear ground-truth "correct" top-1 (user accepted AND completed it first). Save to `tests/zoe-briefing-fixtures/` as JSON.
3. **Build eval harness** — script: for each fixture, regenerate briefing with candidate prompt, score against ground truth (exact top-1 match + rank correlation) and LLM-as-judge rubric. Output composite score.
4. **Build the loop** — separate repo or `/scripts/zoe-autoresearch/`. Agent edits `zoe-daily-program.md`, runs eval, keeps/discards, commits. Fixed N iterations per night. Log every experiment.
5. **Promotion gate** — don't auto-promote to prod. Human review of top candidate + A/B in staging. Real-user metrics are the final oracle.

## Gotchas

- **Don't regenerate on page load.** Briefings are expensive (~2–5s, thousands of tokens). Must be user-triggered.
- **Don't reuse `promptVersion` strings.** Even a whitespace change in the prompt should bump the version.
- **The `inputSnapshot` must be deterministic** — sort actions by a stable order before serializing, or replayability breaks.
- **`workspaceId` is nullable** — user may have briefings across workspaces; the admin rollup should be able to filter or aggregate.

## Related

- [karpathy/autoresearch](https://github.com/karpathy/autoresearch) — inspiration
- `src/server/api/routers/briefing.ts` — unrelated existing morning-briefing router (data aggregation, not AI)
- `src/server/api/routers/mastra.ts` — the Mastra agent call pattern this router follows
