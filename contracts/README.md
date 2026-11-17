# Agent procedure contract

`agent-procedures.json` holds the input of every tRPC procedure an agent tool calls, as JSON Schema. It is generated. Do not edit it by hand.

The Mastra repo keeps a copy and checks each tool's request against it, with no model and no network. A tool that sends a payload the procedure would reject fails the Mastra suite.

## When you change an input

A unit test (`src/server/agentContract/__tests__/agentProcedureContract.test.ts`) fails when the file is stale. Its message names the procedures that changed.

1. Run `npm run contracts:generate`.
2. Commit `contracts/agent-procedures.json`. The diff is the contract change.
3. In the Mastra repo, run `npm run contracts:sync`, then `npm test`.
4. Fix any tool that now fails, in the Mastra repo.

Mastra CI compares its copy with this file on `main`. It fails until step 3 is done.

## Which procedures are in the file

- Every procedure of the `mastra` router.
- The paths listed in `src/server/agentContract/agentProcedures.ts`.

To add a procedure, add its path to that list and regenerate.

## Rules for an input an agent tool sends

Agent tools post `{ json: input, meta: {} }`. Superjson revives nothing, so a value arrives as plain JSON.

- Use `z.coerce.date()` for a date. `z.date()` rejects every request, and the contract marks it as a field that cannot be sent.
- The same applies to `z.bigint()`, `z.map()`, `z.set()` and `z.nan()`.
- Extra keys pass unless the object is `.strict()`.

The contract holds the shape only. It does not check `.refine()` or `.transform()` rules.
