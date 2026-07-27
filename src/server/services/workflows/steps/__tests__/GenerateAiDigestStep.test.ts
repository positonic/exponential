import { describe, it, expect } from "vitest";

import { GenerateAiDigestStep } from "../GenerateAiDigestStep";

const ctx = { userId: "u1", workspaceId: "w1", runId: "r1" };

describe("GenerateAiDigestStep", () => {
  it("skips (no LLM call) when no user-facing changes shipped", async () => {
    const step = new GenerateAiDigestStep();
    // chore/ci/merge only → nothing user-facing; the early return happens
    // before any ChatOpenAI construction, so this needs no API key/network.
    const out = await step.execute(
      {
        commits: [
          { sha: "a", message: "chore: bump deps", author: "x", date: "", url: "" },
          { sha: "b", message: "Merge branch 'main'", author: "x", date: "", url: "" },
        ],
      },
      {},
      ctx,
    );

    expect(out.skip).toBe(true);
    expect(out.digest).toBeNull();
  });

  it("skips on an empty commit list", async () => {
    const step = new GenerateAiDigestStep();
    const out = await step.execute({ commits: [] }, {}, ctx);
    expect(out.skip).toBe(true);
  });
});
