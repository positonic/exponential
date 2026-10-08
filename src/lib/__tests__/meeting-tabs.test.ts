import { describe, expect, it } from "vitest";
import { meetingTabFromParam, withMeetingTab } from "../meeting-tabs";

const PAGE = "https://app.test/recording/abc123";

describe("meetingTabFromParam", () => {
  it("opens the named tab", () => {
    expect(meetingTabFromParam("transcript")).toBe("transcript");
    expect(meetingTabFromParam("screenshots")).toBe("screenshots");
  });

  it("falls back to the summary for a missing or unknown tab", () => {
    expect(meetingTabFromParam(null)).toBe("summary");
    expect(meetingTabFromParam(undefined)).toBe("summary");
    expect(meetingTabFromParam("notes")).toBe("summary");
  });
});

describe("withMeetingTab", () => {
  it("names the tab in the query string", () => {
    expect(withMeetingTab(PAGE, "transcript").href).toBe(`${PAGE}?tab=transcript`);
    expect(withMeetingTab(`${PAGE}?tab=transcript`, "screenshots").href).toBe(
      `${PAGE}?tab=screenshots`,
    );
  });

  it("leaves the default tab implicit so the canonical link stays bare", () => {
    expect(withMeetingTab(`${PAGE}?tab=decisions`, "summary").href).toBe(PAGE);
  });

  it("keeps other query params", () => {
    expect(withMeetingTab(`${PAGE}?from=inbox`, "decisions").href).toBe(
      `${PAGE}?from=inbox&tab=decisions`,
    );
    expect(withMeetingTab(`${PAGE}?from=inbox&tab=decisions`, "summary").href).toBe(
      `${PAGE}?from=inbox`,
    );
  });

  it("drops a transcript turn anchor when leaving the tab", () => {
    expect(withMeetingTab(`${PAGE}?tab=transcript#turn-4`, "summary").href).toBe(PAGE);
    expect(withMeetingTab(`${PAGE}?tab=transcript#turn-4`, "decisions").href).toBe(
      `${PAGE}?tab=decisions`,
    );
  });
});
