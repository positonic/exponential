import { describe, it, expect } from "vitest";
import { z } from "zod";

import {
  buildAgentProcedureContract,
  serializeContract,
  type ProcedureLike,
} from "../buildAgentProcedureContract";

function procedure(type: string, ...inputs: unknown[]): ProcedureLike {
  return { _def: { type, inputs } };
}

const ROUTER: Record<string, ProcedureLike> = {
  "mastra.search": procedure("query", z.object({ query: z.string(), workspaceId: z.string() })),
  "mastra.ping": procedure("query"),
  "action.update": procedure("mutation", z.object({ id: z.string() })),
  "action.internal": procedure("mutation", z.object({ id: z.string() })),
};

describe("buildAgentProcedureContract", () => {
  it("takes every procedure of a listed router and only the listed paths of the others", () => {
    const contract = buildAgentProcedureContract(ROUTER, {
      routers: ["mastra"],
      procedures: ["action.update"],
    });
    expect(Object.keys(contract.procedures)).toEqual(["action.update", "mastra.ping", "mastra.search"]);
  });

  it("records the type, the input schema and the required fields", () => {
    const contract = buildAgentProcedureContract(ROUTER, { routers: ["mastra"], procedures: [] });
    expect(contract.procedures["mastra.search"]).toEqual({
      type: "query",
      inputOptional: false,
      input: {
        type: "object",
        properties: { query: { type: "string" }, workspaceId: { type: "string" } },
        required: ["query", "workspaceId"],
      },
    });
  });

  it("a procedure with no input accepts a call with none", () => {
    const contract = buildAgentProcedureContract(ROUTER, { routers: ["mastra"], procedures: [] });
    expect(contract.procedures["mastra.ping"]).toEqual({ type: "query", inputOptional: true, input: null });
  });

  it("an optional input accepts a call with none", () => {
    const contract = buildAgentProcedureContract(
      { "x.list": procedure("query", z.object({ workspaceId: z.string() }).optional()) },
      { routers: [], procedures: ["x.list"] },
    );
    expect(contract.procedures["x.list"]!.inputOptional).toBe(true);
  });

  it("chained inputs must all hold", () => {
    const contract = buildAgentProcedureContract(
      {
        "x.create": procedure(
          "mutation",
          z.object({ workspaceId: z.string() }),
          z.object({ name: z.string() }),
        ),
      },
      { routers: [], procedures: ["x.create"] },
    );
    expect(contract.procedures["x.create"]!.input).toEqual({
      allOf: [
        { type: "object", properties: { workspaceId: { type: "string" } }, required: ["workspaceId"] },
        { type: "object", properties: { name: { type: "string" } }, required: ["name"] },
      ],
    });
  });

  it("fails on a listed procedure that no longer exists", () => {
    expect(() =>
      buildAgentProcedureContract(ROUTER, { routers: [], procedures: ["action.gone"] }),
    ).toThrow(/"action\.gone" does not exist/);
  });

  it("fails on a listed router with no procedures", () => {
    expect(() => buildAgentProcedureContract(ROUTER, { routers: ["agents"], procedures: [] })).toThrow(
      /Router "agents" has no procedures/,
    );
  });

  it("fails on a subscription", () => {
    expect(() =>
      buildAgentProcedureContract(
        { "x.watch": procedure("subscription") },
        { routers: [], procedures: ["x.watch"] },
      ),
    ).toThrow(/subscription/);
  });

  it("serializes the same contract to the same bytes", () => {
    const selection = { routers: ["mastra"], procedures: ["action.update"] };
    const first = serializeContract(buildAgentProcedureContract(ROUTER, selection));
    const second = serializeContract(buildAgentProcedureContract({ ...ROUTER }, selection));
    expect(first).toBe(second);
    expect(first.endsWith("\n")).toBe(true);
  });
});
