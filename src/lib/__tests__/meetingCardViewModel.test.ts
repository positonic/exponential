import { describe, it, expect } from "vitest";
import {
  buildMeetingCardViewModel,
  type MeetingCardParticipant,
  type MeetingCardSession,
} from "../meetingCardViewModel";

function baseSession(overrides: Partial<MeetingCardSession> = {}): MeetingCardSession {
  return {
    id: "sess-1",
    sessionId: "external-1",
    title: "Weekly sync",
    summary: null,
    transcription: null,
    project: null,
    actions: [],
    ...overrides,
  };
}

function makeParticipant(
  overrides: Partial<MeetingCardParticipant> & { email: string },
): MeetingCardParticipant {
  return {
    id: `p-${overrides.email}`,
    name: null,
    user: null,
    contact: null,
    ...overrides,
  };
}

describe("buildMeetingCardViewModel — highlight resolution", () => {
  it("uses Fireflies overview when present", () => {
    const session = baseSession({
      summary: JSON.stringify({
        overview: "We aligned on the Q3 roadmap.",
        shorthand_bullet: ["Roadmap reviewed"],
      }),
    });
    const vm = buildMeetingCardViewModel(session, []);
    expect(vm.highlight).toBe("We aligned on the Q3 roadmap.");
  });

  it("falls back to shorthand_bullet[0] when overview is missing", () => {
    const session = baseSession({
      summary: JSON.stringify({
        // `overview` left empty so parseFirefliesSummary still recognises
        // the JSON as Fireflies-shaped.
        overview: "",
        shorthand_bullet: ["Discussed launch blockers", "Followups assigned"],
      }),
    });
    const vm = buildMeetingCardViewModel(session, []);
    expect(vm.highlight).toBe("Discussed launch blockers");
  });

  it("returns null when overview and shorthand_bullet are both missing", () => {
    const session = baseSession({
      summary: JSON.stringify({ keywords: ["x"] }),
    });
    const vm = buildMeetingCardViewModel(session, []);
    expect(vm.highlight).toBeNull();
  });

  it("returns null when summary is null", () => {
    const vm = buildMeetingCardViewModel(baseSession({ summary: null }), []);
    expect(vm.highlight).toBeNull();
  });

  it("treats whitespace-only overview as missing", () => {
    const session = baseSession({
      summary: JSON.stringify({
        overview: "   ",
        shorthand_bullet: ["Real fallback"],
      }),
    });
    const vm = buildMeetingCardViewModel(session, []);
    expect(vm.highlight).toBe("Real fallback");
  });
});

describe("buildMeetingCardViewModel — participants → avatars", () => {
  it("maps linked User participants using user.name and image", () => {
    const participant = makeParticipant({
      email: "alice@example.com",
      user: { id: "user-1", name: "Alice Anderson", image: "https://x/y.png" },
    });
    const vm = buildMeetingCardViewModel(baseSession(), [participant]);
    expect(vm.avatars).toHaveLength(1);
    expect(vm.avatars[0]!.displayName).toBe("Alice Anderson");
    expect(vm.avatars[0]!.initials).toBe("AA");
    expect(vm.avatars[0]!.image).toBe("https://x/y.png");
    expect(vm.avatars[0]!.key).toBe("u:user-1");
  });

  it("maps linked CrmContact participants using firstName+lastName when no user link", () => {
    const participant = makeParticipant({
      email: "ben@example.com",
      contact: { id: "contact-9", firstName: "Benjamin", lastName: "Bright" },
    });
    const vm = buildMeetingCardViewModel(baseSession(), [participant]);
    expect(vm.avatars[0]!.displayName).toBe("Benjamin Bright");
    expect(vm.avatars[0]!.initials).toBe("BB");
    expect(vm.avatars[0]!.image).toBeNull();
    expect(vm.avatars[0]!.key).toBe("c:contact-9");
  });

  it("maps email-only participants using email local part", () => {
    const participant = makeParticipant({ email: "carla.dee@example.com" });
    const vm = buildMeetingCardViewModel(baseSession(), [participant]);
    expect(vm.avatars[0]!.displayName).toBe("carla.dee");
    expect(vm.avatars[0]!.initials).toBe("CA");
    expect(vm.avatars[0]!.key).toBe("e:carla.dee@example.com");
  });

  it("falls back to invite display name when neither user nor contact is linked", () => {
    const participant = makeParticipant({
      email: "dan@example.com",
      name: "Dan Davenport",
    });
    const vm = buildMeetingCardViewModel(baseSession(), [participant]);
    expect(vm.avatars[0]!.displayName).toBe("Dan Davenport");
    expect(vm.avatars[0]!.initials).toBe("DD");
  });

  it("assigns the same colour class to the same stable key across renders", () => {
    const participant = makeParticipant({
      email: "alice@example.com",
      user: { id: "user-1", name: "Alice Anderson", image: null },
    });
    const first = buildMeetingCardViewModel(baseSession(), [participant]);
    const second = buildMeetingCardViewModel(baseSession(), [participant]);
    expect(first.avatars[0]!.colorClass).toBe(second.avatars[0]!.colorClass);
  });

  it("attendeeCount reflects participants.length and counts silent attendees", () => {
    const participants = [
      makeParticipant({ email: "a@x.com" }),
      makeParticipant({ email: "b@x.com" }),
      makeParticipant({ email: "c@x.com" }),
    ];
    const vm = buildMeetingCardViewModel(baseSession(), participants);
    expect(vm.attendeeCount).toBe(3);
    expect(vm.avatars).toHaveLength(3);
  });
});

describe("buildMeetingCardViewModel — action count", () => {
  it("reflects session.actions.length when actions exist", () => {
    const vm = buildMeetingCardViewModel(
      baseSession({ actions: [{ id: "a1" }, { id: "a2" }, { id: "a3" }] }),
      [],
    );
    expect(vm.actionCount).toBe(3);
  });

  it("returns 0 when there are no actions", () => {
    const vm = buildMeetingCardViewModel(baseSession({ actions: [] }), []);
    expect(vm.actionCount).toBe(0);
  });
});

describe("buildMeetingCardViewModel — title fallback and project pill", () => {
  it("falls back to `Meeting ${sessionId}` when title is null", () => {
    const vm = buildMeetingCardViewModel(
      baseSession({ title: null, sessionId: "EXT-42" }),
      [],
    );
    expect(vm.title).toBe("Meeting EXT-42");
  });

  it("exposes a project pill when project is set", () => {
    const vm = buildMeetingCardViewModel(
      baseSession({ project: { id: "proj-1", name: "Launch" } }),
      [],
    );
    expect(vm.projectPill).toEqual({ id: "proj-1", name: "Launch" });
  });

  it("projectPill is null when project is null", () => {
    const vm = buildMeetingCardViewModel(baseSession({ project: null }), []);
    expect(vm.projectPill).toBeNull();
  });
});

describe("buildMeetingCardViewModel — peek lines", () => {
  it("returns the first two parsed sentences with formatted timestamps", () => {
    const session = baseSession({
      transcription: JSON.stringify({
        sentences: [
          { start_time: 5, speaker_name: "Alice", text: "Hi everyone." },
          { start_time: 65, speaker_name: "Ben", text: "Let's start." },
          { start_time: 120, speaker_name: "Carla", text: "Third line." },
        ],
      }),
    });
    const vm = buildMeetingCardViewModel(session, []);
    expect(vm.peekLines).toEqual([
      { time: "00:00:05", speaker: "Alice", text: "Hi everyone." },
      { time: "00:01:05", speaker: "Ben", text: "Let's start." },
    ]);
  });

  it("returns null when transcription is null", () => {
    const vm = buildMeetingCardViewModel(baseSession({ transcription: null }), []);
    expect(vm.peekLines).toBeNull();
  });

  it("returns null when transcription JSON is invalid", () => {
    const vm = buildMeetingCardViewModel(
      baseSession({ transcription: "not-json" }),
      [],
    );
    expect(vm.peekLines).toBeNull();
  });

  it("returns null when sentences array is empty", () => {
    const vm = buildMeetingCardViewModel(
      baseSession({ transcription: JSON.stringify({ sentences: [] }) }),
      [],
    );
    expect(vm.peekLines).toBeNull();
  });
});
