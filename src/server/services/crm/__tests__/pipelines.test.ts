import { describe, it, expect, beforeEach } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";
import { requireStageOnPipeline } from "../pipelines";

const db: DeepMockProxy<PrismaClient> = mockDeep<PrismaClient>();

describe("requireStageOnPipeline", () => {
  beforeEach(() => mockReset(db));

  it("returns the stage when it belongs to the pipeline", async () => {
    db.pipelineStage.findUnique.mockResolvedValue({ id: "s1", projectId: "p1" } as never);
    await expect(requireStageOnPipeline(db, "s1", "p1")).resolves.toMatchObject({ id: "s1" });
  });

  it("rejects a stage from another pipeline", async () => {
    db.pipelineStage.findUnique.mockResolvedValue({ id: "s1", projectId: "p2" } as never);
    await expect(requireStageOnPipeline(db, "s1", "p1")).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("reports a missing stage", async () => {
    db.pipelineStage.findUnique.mockResolvedValue(null);
    await expect(requireStageOnPipeline(db, "nope", "p1")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});
