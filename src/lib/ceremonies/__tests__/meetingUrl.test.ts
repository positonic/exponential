import { describe, expect, it } from "vitest";
import { meetingUrlKey } from "../meetingUrl";

describe("meetingUrlKey", () => {
  it("reduces a link to lowercase host and path", () => {
    expect(meetingUrlKey("https://talk.syntro.fi/rooms/RegularTouchpointJa")).toBe("talk.syntro.fi/rooms/regulartouchpointja");
  });

  it("ignores scheme, www, query, fragment and trailing slashes", () => {
    const key = "meet.google.com/abc-defg-hij";
    expect(meetingUrlKey("http://www.meet.google.com/abc-defg-hij/")).toBe(key);
    expect(meetingUrlKey("meet.google.com/abc-defg-hij?authuser=1#x")).toBe(key);
    expect(meetingUrlKey("  https://meet.google.com/abc-defg-hij  ")).toBe(key);
  });

  it("keeps a non-default port", () => {
    expect(meetingUrlKey("http://localhost:3000/rooms/test")).toBe("localhost:3000/rooms/test");
  });

  it("decodes percent-encoding so encoded and plain room names match", () => {
    expect(meetingUrlKey("https://talk.syntro.fi/rooms/team%20sync")).toBe(meetingUrlKey("talk.syntro.fi/rooms/Team Sync"));
  });

  it("rejects values that are not a room link", () => {
    expect(meetingUrlKey("")).toBeNull();
    expect(meetingUrlKey("https://talk.syntro.fi")).toBeNull();
    expect(meetingUrlKey("https://talk.syntro.fi/")).toBeNull();
    expect(meetingUrlKey("standup")).toBeNull();
    expect(meetingUrlKey("mailto:someone@example.com")).toBeNull();
    expect(meetingUrlKey("ftp://files.example.com/room")).toBeNull();
  });
});
