import { describe, expect, it } from "vitest";
import { extractTalkTime } from "../talkTime";

describe("extractTalkTime", () => {
  it("turns Fireflies speaker durations into rounded percentages", () => {
    expect(
      extractTalkTime({
        speakers: [
          { name: "Ana", duration: 10 },
          { name: "Ben", duration: 20 },
        ],
      }),
    ).toEqual({ Ana: "33%", Ben: "67%" });
  });

  it("accepts duration_pct and skips malformed rows", () => {
    expect(
      extractTalkTime({
        speakers: [{ name: "Ana", duration_pct: 40 }, { duration: 5 }, null, { name: "Ben", duration_pct: 60 }],
      }),
    ).toEqual({ Ana: "40%", Ben: "60%" });
  });

  it("returns an empty record when there is nothing to derive", () => {
    expect(extractTalkTime(null)).toEqual({});
    expect(extractTalkTime({ speakers: "nope" })).toEqual({});
    expect(extractTalkTime({ speakers: [{ name: "Ana", duration: 0 }] })).toEqual({});
  });
});
