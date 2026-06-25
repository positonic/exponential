/**
 * Unit tests for assignParticipantFlavors — the owner-anchored identity-tone
 * resolver that keeps the participants panel and the transcript in agreement on
 * who is "me" (ADR-0032 identity tone, resolved from the meeting owner).
 */

import { describe, expect, it } from "vitest";
import { assignParticipantFlavors } from "../meeting-view-model";

describe("assignParticipantFlavors", () => {
  it("marks the owner-by-userId as me and rotates the rest by order", () => {
    // The James/Melissa interview: owner James is a participant linked by userId.
    const flavors = assignParticipantFlavors(
      [
        { userId: "u_james", email: "james@x.com", isHost: false },
        { userId: null, email: "melissa@x.com", isHost: false },
      ],
      { userId: "u_james", email: "james@x.com" },
    );
    expect(flavors).toEqual(["me", "them"]);
  });

  it("matches the owner by email (case-insensitive) when userId is absent", () => {
    const flavors = assignParticipantFlavors(
      [
        { userId: null, email: "Melissa@X.com", isHost: false },
        { userId: null, email: "JAMES@x.com", isHost: false },
      ],
      { userId: null, email: "james@x.com" },
    );
    expect(flavors).toEqual(["them", "me"]);
  });

  it("rotates a third+ participant them/alt by appearance", () => {
    const flavors = assignParticipantFlavors(
      [
        { userId: "u_owner", email: null, isHost: false },
        { userId: "u_a", email: null, isHost: false },
        { userId: "u_b", email: null, isHost: false },
        { userId: "u_c", email: null, isHost: false },
      ],
      { userId: "u_owner", email: null },
    );
    expect(flavors).toEqual(["me", "them", "alt", "them"]);
  });

  it("marks exactly one me when a userId-linked and an email-duplicate row both match", () => {
    // A manually-added row and the user-linked row share the owner's email.
    // The userId match must win and only one participant becomes "me".
    const flavors = assignParticipantFlavors(
      [
        { userId: null, email: "james@x.com", isHost: false },
        { userId: "u_james", email: "james@x.com", isHost: false },
      ],
      { userId: "u_james", email: "james@x.com" },
    );
    expect(flavors).toEqual(["them", "me"]);
    expect(flavors.filter((f) => f === "me")).toHaveLength(1);
  });

  it("marks at most one me when the owner matches by email only", () => {
    const flavors = assignParticipantFlavors(
      [
        { userId: null, email: "james@x.com", isHost: false },
        { userId: null, email: "james@x.com", isHost: false },
      ],
      { userId: null, email: "james@x.com" },
    );
    expect(flavors.filter((f) => f === "me")).toHaveLength(1);
    expect(flavors).toEqual(["me", "them"]);
  });

  it("ignores a stray isHost flag once the owner is identified", () => {
    const flavors = assignParticipantFlavors(
      [
        { userId: "u_host", email: null, isHost: true },
        { userId: "u_owner", email: null, isHost: false },
      ],
      { userId: "u_owner", email: null },
    );
    // Only the owner is "me"; the DB host flag does not override it.
    expect(flavors).toEqual(["them", "me"]);
  });

  it("falls back to the isHost flag when no participant matches the owner", () => {
    const flavors = assignParticipantFlavors(
      [
        { userId: "u_a", email: "a@x.com", isHost: false },
        { userId: "u_b", email: "b@x.com", isHost: true },
      ],
      { userId: "u_ghost", email: "ghost@x.com" },
    );
    expect(flavors).toEqual(["them", "me"]);
  });

  it("assigns no me when there is neither an owner match nor a host", () => {
    const flavors = assignParticipantFlavors(
      [
        { userId: "u_a", email: null, isHost: false },
        { userId: "u_b", email: null, isHost: false },
      ],
      { userId: null, email: null },
    );
    expect(flavors).toEqual(["them", "alt"]);
  });
});
