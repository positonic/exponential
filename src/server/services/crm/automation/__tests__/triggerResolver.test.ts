import { describe, it, expect } from "vitest";

import {
  resolveAutomationsToFire,
  type CrmAutomationDefinition,
} from "../triggerResolver";

const channelPartner: CrmAutomationDefinition = {
  id: "def-cp",
  targetCustomerType: "Channel Partner",
};
const advisor: CrmAutomationDefinition = {
  id: "def-adv",
  targetCustomerType: "Advisor",
};
const DEFS = [channelPartner, advisor];

describe("resolveAutomationsToFire", () => {
  it("fires the matching automation when the type transitions to a target type", () => {
    const fired = resolveAutomationsToFire({
      change: { oldProfileType: null, newProfileType: "Channel Partner" },
      definitions: DEFS,
      alreadyFiredDefinitionIds: [],
    });
    expect(fired).toEqual([channelPartner]);
  });

  it("fires when an existing contact is re-tagged from one type to another", () => {
    const fired = resolveAutomationsToFire({
      change: { oldProfileType: "Developer", newProfileType: "Advisor" },
      definitions: DEFS,
      alreadyFiredDefinitionIds: [],
    });
    expect(fired).toEqual([advisor]);
  });

  it("does nothing on a no-op re-save (type unchanged)", () => {
    const fired = resolveAutomationsToFire({
      change: {
        oldProfileType: "Channel Partner",
        newProfileType: "Channel Partner",
      },
      definitions: DEFS,
      alreadyFiredDefinitionIds: [],
    });
    expect(fired).toEqual([]);
  });

  it("does nothing when the new type is null, empty, or whitespace", () => {
    for (const newProfileType of [null, "", "   "]) {
      const fired = resolveAutomationsToFire({
        change: { oldProfileType: "Channel Partner", newProfileType },
        definitions: DEFS,
        alreadyFiredDefinitionIds: [],
      });
      expect(fired).toEqual([]);
    }
  });

  it("does nothing when no automation targets the new type", () => {
    const fired = resolveAutomationsToFire({
      change: { oldProfileType: null, newProfileType: "Investor" },
      definitions: DEFS,
      alreadyFiredDefinitionIds: [],
    });
    expect(fired).toEqual([]);
  });

  it("is idempotent — excludes an automation that already fired for this contact", () => {
    const fired = resolveAutomationsToFire({
      change: { oldProfileType: null, newProfileType: "Channel Partner" },
      definitions: DEFS,
      alreadyFiredDefinitionIds: ["def-cp"],
    });
    expect(fired).toEqual([]);
  });

  it("suppresses all firing during a bulk import, even for a valid transition", () => {
    const fired = resolveAutomationsToFire({
      change: {
        oldProfileType: null,
        newProfileType: "Channel Partner",
        importBatchId: "batch-123",
      },
      definitions: DEFS,
      alreadyFiredDefinitionIds: [],
    });
    expect(fired).toEqual([]);
  });
});
