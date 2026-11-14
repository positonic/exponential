/**
 * The decisions producer: a pure renderer (what the room sees) and a loader that
 * refuses drafts.
 */

import { describe, it, expect } from "vitest";
import { mockDeep } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

import {
  decisionEventForStatus,
  decisionProducer,
  renderDecisionMessage,
  type DecisionSubject,
} from "~/server/services/outboundPosts/producers/decision";

function subject(overrides: Partial<DecisionSubject> = {}): DecisionSubject {
  return {
    id: "dec-1",
    number: 30,
    statement: "Bid on the NRC/IDMC tender?",
    status: "OPEN",
    workspaceId: "ws-1",
    projectId: null,
    workspaceSlug: "syntrofi",
    deciders: [
      { userId: "user-james", name: "James" },
      { userId: "user-andi", name: "Andi" },
      { userId: null, name: "Pat (NRC)" },
    ],
    supersededByNumber: null,
    mentionUserIds: ["user-james", "user-andi"],
    ...overrides,
  };
}

const ctx = (mentions: Record<string, string> = {}) => ({
  baseUrl: "https://app.test/",
  mentions: new Map(Object.entries(mentions)),
});

describe("renderDecisionMessage", () => {
  it("publishes an open question with the D-number, statement, deciders and an absolute link", () => {
    const m = renderDecisionMessage(subject(), "published", ctx({ "user-james": "@james:example.org" }));

    expect(m.text).toBe(
      [
        "D-0030 · Open question",
        "Bid on the NRC/IDMC tender?",
        "Deciders: James, Andi, Pat (NRC)",
        "https://app.test/w/syntrofi/decisions/d/dec-1",
      ].join("\n"),
    );
    expect(m.html).toContain("<strong>D-0030 · Open question</strong>");
    expect(m.html).toContain('<a href="https://matrix.to/#/%40james%3Aexample.org">James</a>');
    expect(m.html).toContain("Andi, Pat (NRC)");
    expect(m.html).toContain('href="https://app.test/w/syntrofi/decisions/d/dec-1"');
    expect(m.markdown).toContain("[James](https://matrix.to/#/%40james%3Aexample.org)");
    expect(m.markdown).toContain("**D-0030 · Open question**");
  });

  it("pings mapped deciders on publish only, never on a status change", () => {
    const mapped = ctx({ "user-james": "@james:example.org", "user-andi": "@andi:example.org" });

    expect(renderDecisionMessage(subject(), "published", mapped).mentions).toEqual([
      "@james:example.org",
      "@andi:example.org",
    ]);
    expect(renderDecisionMessage(subject({ status: "ACCEPTED" }), "accepted", mapped).mentions).toEqual([]);
  });

  it("names an unmapped or external decider without a pill", () => {
    const m = renderDecisionMessage(subject(), "published", ctx());

    expect(m.html).not.toContain("matrix.to");
    expect(m.html).toContain("Deciders: James, Andi, Pat (NRC)");
    expect(m.mentions).toEqual([]);
  });

  it("omits the deciders line when there are none", () => {
    const m = renderDecisionMessage(subject({ deciders: [] }), "published", ctx());

    expect(m.text).not.toContain("Deciders");
    expect(m.html).not.toContain("Deciders");
  });

  it("headlines a transition, and names the successor on supersession", () => {
    expect(renderDecisionMessage(subject({ status: "ACCEPTED" }), "accepted", ctx()).text).toMatch(/^D-0030 · Accepted\n/);
    expect(
      renderDecisionMessage(subject({ status: "SUPERSEDED", supersededByNumber: 41 }), "superseded", ctx()).text,
    ).toMatch(/^D-0030 · Superseded by D-0041\n/);
    expect(renderDecisionMessage(subject({ status: "DEPRECATED" }), "deprecated", ctx()).text).toMatch(/^D-0030 · Deprecated\n/);
  });

  it("escapes HTML in the statement and names, and keeps the plain text clean", () => {
    const m = renderDecisionMessage(
      subject({ statement: "Use <b>bold</b> & co", deciders: [{ userId: null, name: "A & B" }] }),
      "published",
      ctx(),
    );

    expect(m.html).toContain("Use &lt;b&gt;bold&lt;/b&gt; &amp; co");
    expect(m.html).toContain("Deciders: A &amp; B");
    expect(m.text).toContain("Use <b>bold</b> & co");
    expect(m.text).not.toMatch(/<\/?p>|<strong>/);
  });
});

describe("decisionEventForStatus", () => {
  it("maps the posting statuses and nothing else", () => {
    expect(decisionEventForStatus("ACCEPTED")).toBe("accepted");
    expect(decisionEventForStatus("SUPERSEDED")).toBe("superseded");
    expect(decisionEventForStatus("DEPRECATED")).toBe("deprecated");
    expect(decisionEventForStatus("OPEN")).toBeNull();
    expect(decisionEventForStatus("PROPOSED")).toBeNull();
  });
});

describe("decisionProducer.load", () => {
  it("loads a confirmed decision with its scope, slug, deciders and successor", async () => {
    const db = mockDeep<PrismaClient>();
    db.decision.findFirst.mockResolvedValue({
      id: "dec-1",
      number: 30,
      statement: "s",
      status: "SUPERSEDED",
      workspaceId: "ws-1",
      projectId: "proj-1",
      workspace: { slug: "syntrofi" },
      deciders: [{ userId: "u1", name: "James" }, { userId: null, name: "Pat" }],
      supersededBy: { number: 41 },
    } as never);

    const loaded = await decisionProducer.load(db, "dec-1");

    expect(loaded).toMatchObject({
      workspaceId: "ws-1",
      projectId: "proj-1",
      workspaceSlug: "syntrofi",
      supersededByNumber: 41,
      mentionUserIds: ["u1"],
    });
    expect(db.decision.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "dec-1", reviewState: "CONFIRMED" } }),
    );
  });

  it("returns null for a draft or a missing decision", async () => {
    const db = mockDeep<PrismaClient>();
    db.decision.findFirst.mockResolvedValue(null as never);

    await expect(decisionProducer.load(db, "draft-1")).resolves.toBeNull();
  });
});
