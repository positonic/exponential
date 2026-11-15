/**
 * The allowance rule, as a workspace experiences it: which Assistant turns are
 * allowed, downgraded to the fast tier or refused at each level of usage, in
 * each billing mode, with and without the workspace's own key.
 *
 * `decideAssistantAccess` is pure, so these tests use no mocks.
 */

import { describe, expect, it, vi } from "vitest";
import { FREE_ALLOWANCE_MICROS } from "../config";
import {
  decideAssistantAccess,
  getEntitlements,
  usedPercent,
  type AssistantUseKind,
  type Entitlements,
} from "../entitlements";

const ALLOWANCE = 1_000_000;
const KINDS: AssistantUseKind[] = ["chat", "agentRun"];

/** A Free workspace that has used `percent` of its allowance this month. */
function workspace(percent: number, overrides: Partial<Entitlements> = {}): Entitlements {
  return {
    mode: "enforce",
    plan: "FREE",
    allowanceMicros: ALLOWANCE,
    usedMicros: (ALLOWANCE * percent) / 100,
    hasWorkingKey: false,
    ...overrides,
  };
}

describe("when the allowance is enforced", () => {
  it.each([0, 50, 79.9])("allows chat and agent runs at %s% with no warning", (percent) => {
    for (const kind of KINDS) {
      expect(decideAssistantAccess(workspace(percent), kind)).toEqual({ allow: true, forceFastTier: false });
    }
  });

  it.each([80, 99.9])("allows both at %s% and reports the 80% warning level", (percent) => {
    for (const kind of KINDS) {
      expect(decideAssistantAccess(workspace(percent), kind)).toEqual({
        allow: true,
        forceFastTier: false,
        warnLevel: 80,
      });
    }
  });

  it.each([100, 150, 199.9])("at %s% answers chat on the fast tier", (percent) => {
    expect(decideAssistantAccess(workspace(percent), "chat")).toEqual({
      allow: true,
      forceFastTier: true,
      reason: "OVER_ALLOWANCE",
      warnLevel: 100,
    });
  });

  it.each([100, 150, 199.9])("at %s% refuses a new agent run", (percent) => {
    expect(decideAssistantAccess(workspace(percent), "agentRun")).toEqual({
      allow: false,
      forceFastTier: false,
      reason: "OVER_ALLOWANCE",
      warnLevel: 100,
    });
  });

  it.each([200, 350])("at %s% refuses chat and agent runs alike", (percent) => {
    for (const kind of KINDS) {
      expect(decideAssistantAccess(workspace(percent), kind)).toEqual({
        allow: false,
        forceFastTier: false,
        reason: "HARD_CAP",
        warnLevel: 100,
      });
    }
  });
});

describe("a workspace on its own working key", () => {
  it.each([0, 100, 250])("is never limited or warned, even at %s% of the hosted allowance", (percent) => {
    for (const kind of KINDS) {
      expect(decideAssistantAccess(workspace(percent, { hasWorkingKey: true }), kind)).toEqual({
        allow: true,
        forceFastTier: false,
      });
    }
  });
});

describe("while the allowance is only metered", () => {
  it.each([0, 100, 150, 200, 1_000])("never blocks or downgrades a turn, at %s%", (percent) => {
    for (const kind of KINDS) {
      const access = decideAssistantAccess(workspace(percent, { mode: "meter" }), kind);

      expect(access.allow).toBe(true);
      expect(access.forceFastTier).toBe(false);
      expect(access.reason).toBeUndefined();
    }
  });

  it("still reports the warning level, for the usage bar", () => {
    const level = (percent: number) => decideAssistantAccess(workspace(percent, { mode: "meter" }), "chat").warnLevel;

    expect(level(79)).toBeUndefined();
    expect(level(80)).toBe(80);
    expect(level(100)).toBe(100);
    expect(level(400)).toBe(100);
  });
});

describe("on an install that does not meter", () => {
  it("applies no allowance at all, whatever the numbers say", () => {
    for (const kind of KINDS) {
      expect(decideAssistantAccess(workspace(500, { mode: "off" }), kind)).toEqual({
        allow: true,
        forceFastTier: false,
      });
    }
  });
});

describe("usedPercent", () => {
  it("is the share of the allowance used, in whole percent", () => {
    expect(usedPercent(workspace(0))).toBe(0);
    expect(usedPercent(workspace(62.4))).toBe(62);
    expect(usedPercent(workspace(250))).toBe(250);
  });
});

describe("getEntitlements", () => {
  const NOVEMBER = new Date("2026-11-15T10:00:00Z");

  /** A workspace's month counter and, optionally, its saved key's state. */
  function monthCounter(costMicros: number | null, keyStatus?: "valid" | "failing") {
    const findUnique = vi.fn(async () => (costMicros === null ? null : { costMicros }));
    const findKey = vi.fn(async () =>
      keyStatus
        ? { providerConfig: { last4: "7Q4x", status: keyStatus, checkedAt: "2026-11-15T10:00:00.000Z" } }
        : null,
    );
    return {
      db: { workspaceUsagePeriod: { findUnique }, integration: { findFirst: findKey } } as never,
      findUnique,
      findKey,
    };
  }

  it("gives a metered workspace the Free allowance and its spend so far this month", async () => {
    const { db, findUnique } = monthCounter(420_000);

    const entitlements = await getEntitlements(db, "ws-1", { env: { BILLING_MODE: "meter" }, now: NOVEMBER });

    expect(entitlements).toEqual({
      mode: "meter",
      plan: "FREE",
      allowanceMicros: FREE_ALLOWANCE_MICROS,
      usedMicros: 420_000,
      hasWorkingKey: false,
    });
    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId_periodStart: { workspaceId: "ws-1", periodStart: new Date("2026-11-01T00:00:00.000Z") },
        },
      }),
    );
  });

  it("reads zero for a workspace with no Assistant use this month", async () => {
    const { db } = monthCounter(null);

    const entitlements = await getEntitlements(db, "ws-1", { env: { BILLING_MODE: "enforce" }, now: NOVEMBER });

    expect(entitlements).toMatchObject({ mode: "enforce", usedMicros: 0 });
  });

  it("knows a workspace with a working key of its own, which is then never limited", async () => {
    const { db } = monthCounter(FREE_ALLOWANCE_MICROS * 3, "valid");

    const entitlements = await getEntitlements(db, "ws-1", { env: { BILLING_MODE: "enforce" }, now: NOVEMBER });

    expect(entitlements.hasWorkingKey).toBe(true);
    expect(decideAssistantAccess(entitlements, "agentRun")).toEqual({ allow: true, forceFastTier: false });
  });

  it("treats a key that has stopped working as no key: the allowance applies again", async () => {
    const { db } = monthCounter(FREE_ALLOWANCE_MICROS * 3, "failing");

    const entitlements = await getEntitlements(db, "ws-1", { env: { BILLING_MODE: "enforce" }, now: NOVEMBER });

    expect(entitlements.hasWorkingKey).toBe(false);
    expect(decideAssistantAccess(entitlements, "agentRun")).toMatchObject({ allow: false, reason: "HARD_CAP" });
  });

  it("uses a key status the caller already loaded instead of reading it again", async () => {
    const { db, findKey } = monthCounter(0);

    const entitlements = await getEntitlements(db, "ws-1", {
      env: { BILLING_MODE: "meter" },
      now: NOVEMBER,
      modelKey: { last4: "7Q4x", status: "valid", checkedAt: NOVEMBER },
    });

    expect(entitlements.hasWorkingKey).toBe(true);
    expect(findKey).not.toHaveBeenCalled();
  });

  it("does not touch the database on an install that does not meter", async () => {
    const { db, findUnique, findKey } = monthCounter(999_999_999, "valid");

    const entitlements = await getEntitlements(db, "ws-1", { env: {} });

    expect(entitlements.mode).toBe("off");
    expect(findKey).not.toHaveBeenCalled();
    expect(findUnique).not.toHaveBeenCalled();
    expect(decideAssistantAccess(entitlements, "agentRun")).toEqual({ allow: true, forceFastTier: false });
  });
});
