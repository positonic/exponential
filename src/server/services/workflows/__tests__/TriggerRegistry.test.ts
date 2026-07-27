import { describe, it, expect } from "vitest";

import {
  TriggerRegistry,
  createTriggerRegistry,
  SCHEDULED_TRIGGER,
} from "../TriggerRegistry";
import { CRM_CONTACT_TYPE_TRIGGER } from "../../crm/automation/triggerResolver";

describe("TriggerRegistry", () => {
  it("registers and retrieves a trigger", () => {
    const r = new TriggerRegistry();
    r.register({ type: "x", kind: "event" });
    expect(r.get("x")).toEqual({ type: "x", kind: "event" });
    expect(r.has("x")).toBe(true);
  });

  it("throws for an unregistered trigger", () => {
    expect(() => new TriggerRegistry().get("nope")).toThrow(/no trigger/i);
  });

  it("default registry exposes the core scheduled + CRM contact-type triggers", () => {
    const r = createTriggerRegistry();
    expect(r.has(SCHEDULED_TRIGGER)).toBe(true);
    expect(r.has(CRM_CONTACT_TYPE_TRIGGER)).toBe(true);
    expect(r.get(SCHEDULED_TRIGGER).kind).toBe("schedule");
    expect(r.get(CRM_CONTACT_TYPE_TRIGGER).kind).toBe("event");
  });

  it("lists schedule-kind triggers for the cron runner to poll", () => {
    const r = createTriggerRegistry();
    expect(r.listByKind("schedule").map((t) => t.type)).toEqual([
      SCHEDULED_TRIGGER,
    ]);
  });
});
