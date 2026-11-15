/**
 * `BILLING_MODE` is the one switch that turns metering and limits on. A
 * self-hosted install sets nothing and must resolve to "off"; a typo must
 * never switch limits on. The accepted values are the same three exact words
 * `src/env.js` validates, so the two never disagree about what is valid.
 */

import { describe, expect, it } from "vitest";
import { isMeteringOn, resolveBillingMode } from "../config";

describe("resolveBillingMode", () => {
  it("is off when nothing is set, which is how a self-hosted install runs", () => {
    expect(resolveBillingMode({})).toBe("off");
    expect(resolveBillingMode({ BILLING_MODE: "" })).toBe("off");
  });

  it("reads the three modes", () => {
    expect(resolveBillingMode({ BILLING_MODE: "off" })).toBe("off");
    expect(resolveBillingMode({ BILLING_MODE: "meter" })).toBe("meter");
    expect(resolveBillingMode({ BILLING_MODE: "enforce" })).toBe("enforce");
  });

  it("treats anything else as off, never as a limit", () => {
    expect(resolveBillingMode({ BILLING_MODE: "enforced" })).toBe("off");
    expect(resolveBillingMode({ BILLING_MODE: "true" })).toBe("off");
    // The same strictness as env validation: no case or whitespace tolerance.
    expect(resolveBillingMode({ BILLING_MODE: "Enforce" })).toBe("off");
    expect(resolveBillingMode({ BILLING_MODE: " meter" })).toBe("off");
  });
});

describe("isMeteringOn", () => {
  it("records usage in meter and enforce, and not when off", () => {
    expect(isMeteringOn("off")).toBe(false);
    expect(isMeteringOn("meter")).toBe(true);
    expect(isMeteringOn("enforce")).toBe(true);
  });
});
