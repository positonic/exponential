# Agent tool input validation: tolerate the model's stringified scalars

**TL;DR — when an agent tool (or an agent-facing `mastra.*` tRPC proxy) takes a
numeric or boolean argument, the LLM will sometimes send it as a string
(`"19"`, `"false"`). A bare `z.number()` / `z.boolean()` rejects that *before*
`execute()` runs, the agent burns retries, and the action fails. Use the
tolerant helpers below on the input boundary.**

## Why this exists

Models — Haiku especially, and any model copying a value out of prompt text
like `Goal: … (ID: 19)` — emit JSON-stringified scalars instead of native
`number` / `boolean`. The AI-SDK validates a tool call against its `inputSchema`
**before** the tool body runs, so a strict primitive schema turns a perfectly
good call into a validation error. The model then retries the same call, often
several times, and frequently gives up and tells the user to do it by hand.

Two real incidents:

- **`getAllProjectsTool.includeAll`** fanned out to 3 calls because
  `includeAll: "false"` kept failing `z.boolean()`. (Documented in
  `../mastra/src/mastra/tools/zod-loose.ts`.)
- **`addObjectiveUpdateTool.goalId`** — Zoe could not post a Goal update at all:
  she looped on "goalId needs to be a number" / "different format" and fell back
  to "add it manually." `goalId` was the first numeric arg sourced straight from
  prompt text, so it was the first to trip strict `z.number()`. (See `CONTEXT.md`
  → "Thread cost", and the `okr-tools` fix.)

This is the same failure class as the `getAllProjectsTool includeAll`
string-vs-boolean retry called out in `CONTEXT.md`.

## The rule

### In `../mastra` tools — use the house helpers

`../mastra/src/mastra/tools/zod-loose.ts` exports `looseNumber()` and
`looseBoolean()`. They **preprocess** the value into the right type before
validation, and fall through (so the inner `z.number()`/`z.boolean()` still
rejects genuine garbage like `"banana"`).

```ts
import { looseNumber, looseBoolean } from "./zod-loose.js";

inputSchema: z.object({
  goalId: looseNumber().describe("…"),                          // "19" -> 19
  confidence: looseNumber(z.number().min(0).max(100)).optional(), // keep constraints inside
  includeAll: looseBoolean().optional().default(false),         // "false" -> false
})
```

- Constraints (`.min()/.max()`) go **inside** the helper; `.optional()/.default()/.describe()`
  go **outside**.
- **Never use `z.coerce.boolean()`** — it is `Boolean("false") === true`, which
  silently *inverts* the flag. `looseBoolean()` parses the string contents.
- `z.coerce.number()` is safe for numbers (no inversion footgun), but prefer
  `looseNumber()` for consistency and because it falls through on garbage
  instead of coercing `""`/`null` to `0`.

### In agent-facing `mastra.*` tRPC proxies (this repo) — coerce numerics

The proxies in `src/server/api/routers/mastra.ts` are called only by agent
tools, with the same model-fumbled arguments. Use `z.coerce.number()` for
numeric inputs there (safe — numbers only). If a boolean arg ever appears, use a
`z.preprocess` that parses the string (mirror `looseBoolean`), **not**
`z.coerce.boolean()`.

```ts
addGoalUpdate: protectedProcedure
  .input(z.object({ goalId: z.coerce.number(), /* … */ }))
```

### Output schemas stay strict

Only **input** schemas (what the model sends) get the tolerant treatment.
**Output** schemas describe the backend's response — keep them strict
(`z.number()`), so a backend contract drift is caught, not silently coerced.

### Human-facing routers stay strict

`goalUpdate.addUpdate`, `goalComment.addComment`, etc. are called from React with
real numbers. Leave them `z.number()`. The shared `goalService` functions they
call also stay strict — the coercion is a boundary concern, applied where the
model's arguments enter.

## Testing rule

Every primitive tool arg gets an `inputSchema.parse()` unit test that feeds the
**wrong-but-plausible** primitive (a string for a number, `"false"` for a
boolean) and asserts it is accepted and normalised — plus one test that genuine
garbage still throws. Test the **schema**, not `execute()`: the failure happens
at schema validation, so a test that calls `execute()` with already-clean data
(as the original `okr-tools` test did) passes while the real path is broken.

Prior art: `../mastra/src/mastra/tools/tool-input-coercion.test.ts` and the
coercion cases in `okr-tools.test.ts`.

```ts
// Mastra wraps inputSchema as a StandardSchema; the underlying zod .parse exists
// at runtime. Cast to exercise validation + coercion directly.
const parseInput = (tool, value) => (tool.inputSchema as z.ZodTypeAny).parse(value);
expect(parseInput(getAllProjectsTool, { includeAll: "false" }).includeAll).toBe(false);
```

A unit test guards the failure modes you **anticipate**. For the ones you don't,
add an eval (below) — it runs the real model and shows you what it actually
emits.

## Eval rule (behaviour, not just types)

A unit test can't catch "the model chose the wrong tool." For tool-choice and
other behavioural contracts, add an `EvalCase`. Cases normally auto-distil from
failed Threads (ADR-0013), but you can author a durable one as a `--cases`
fixture and run it offline against the candidate brain:

```bash
npm run eval-prompt -- --cases evals/cases/objective-comment-vs-update.json
```

Fixture format is `{ cases: ExportedEvalCase[] }` (see
`src/server/services/evalPromptOrchestrator.ts` for the shape). Prior art:
`evals/cases/objective-comment-vs-update.json` — guards "asked to add a narrative
strategy note → posts an Objective **comment**, not a health-bearing **update**."

## Remaining work

`okr-tools.ts` and `getAllProjectsTool` are converted. The same latent bug still
exists in several lower-traffic tools (Slack, document, CRM, calendar
`findAvailableTimeSlots`, `deleteProjectTool.confirmDeletion`). Tracked in beads
**exponential-jz4r** follow-up — convert their numeric/boolean input args to
`looseNumber()/looseBoolean()` and add the parse tests.
