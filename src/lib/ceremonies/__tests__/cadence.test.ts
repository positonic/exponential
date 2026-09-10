import { describe, expect, it } from "vitest";
import { buildCadenceRule, describeCadence, parseCadenceRule, type CadenceConfig } from "../cadence";

const base: CadenceConfig = { preset: "weekly", weekday: "MO", ordinal: 1, time: "09:00" };

describe("buildCadenceRule", () => {
  it.each<[CadenceConfig, string]>([
    [{ ...base, preset: "daily", time: "08:30" }, "FREQ=DAILY;BYHOUR=8;BYMINUTE=30"],
    [{ ...base, preset: "weekdays" }, "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=9;BYMINUTE=0"],
    [{ ...base, preset: "weekly", weekday: "WE", time: "14:15" }, "FREQ=WEEKLY;BYDAY=WE;BYHOUR=14;BYMINUTE=15"],
    [{ ...base, preset: "fortnightly", weekday: "FR" }, "FREQ=WEEKLY;INTERVAL=2;BYDAY=FR;BYHOUR=9;BYMINUTE=0"],
    [{ ...base, preset: "monthly", weekday: "FR", ordinal: -1, time: "15:00" }, "FREQ=MONTHLY;BYDAY=-1FR;BYHOUR=15;BYMINUTE=0"],
  ])("builds %j", (cfg, expected) => {
    expect(buildCadenceRule(cfg)).toBe(expected);
  });

  it("falls back to 09:00 for an unparseable time", () => {
    expect(buildCadenceRule({ ...base, time: "noon" })).toBe("FREQ=WEEKLY;BYDAY=MO;BYHOUR=9;BYMINUTE=0");
  });
});

describe("parseCadenceRule", () => {
  it("round-trips every preset", () => {
    const configs: CadenceConfig[] = [
      { ...base, preset: "daily", time: "07:05" },
      { ...base, preset: "weekdays", time: "09:00" },
      { ...base, preset: "weekly", weekday: "TH", time: "16:30" },
      { ...base, preset: "fortnightly", weekday: "TU", time: "10:00" },
      { ...base, preset: "monthly", weekday: "MO", ordinal: 2, time: "11:00" },
      { ...base, preset: "monthly", weekday: "FR", ordinal: -1, time: "15:00" },
    ];
    for (const cfg of configs) {
      const parsed = parseCadenceRule(buildCadenceRule(cfg));
      expect(parsed?.preset).toBe(cfg.preset);
      expect(parsed?.time).toBe(cfg.time);
      if (cfg.preset === "weekly" || cfg.preset === "fortnightly" || cfg.preset === "monthly") {
        expect(parsed?.weekday).toBe(cfg.weekday);
      }
      if (cfg.preset === "monthly") expect(parsed?.ordinal).toBe(cfg.ordinal);
    }
  });

  it("accepts an RRULE: prefix and lower-case keys", () => {
    expect(parseCadenceRule("rrule:freq=weekly;byday=mo;byhour=9;byminute=0")?.preset).toBe("weekly");
  });

  it("returns null for rules the picker cannot express", () => {
    expect(parseCadenceRule("FREQ=WEEKLY;BYDAY=MO,WE;BYHOUR=9;BYMINUTE=0")).toBeNull();
    expect(parseCadenceRule("FREQ=WEEKLY;INTERVAL=3;BYDAY=MO")).toBeNull();
    expect(parseCadenceRule("FREQ=MONTHLY;BYMONTHDAY=1")).toBeNull();
    expect(parseCadenceRule("FREQ=DAILY;COUNT=3")).toBeNull();
    expect(parseCadenceRule("")).toBeNull();
  });
});

describe("describeCadence", () => {
  it("describes presets and echoes custom rules", () => {
    expect(describeCadence("FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=9;BYMINUTE=0")).toBe("Every weekday at 09:00");
    expect(describeCadence("FREQ=WEEKLY;INTERVAL=2;BYDAY=WE;BYHOUR=14;BYMINUTE=30")).toBe(
      "Every two weeks on Wednesday at 14:30",
    );
    expect(describeCadence("FREQ=MONTHLY;BYDAY=-1FR;BYHOUR=15;BYMINUTE=0")).toBe("Monthly on the last Friday at 15:00");
    expect(describeCadence("RRULE:FREQ=WEEKLY;BYDAY=MO,WE")).toBe("FREQ=WEEKLY;BYDAY=MO,WE");
  });
});
