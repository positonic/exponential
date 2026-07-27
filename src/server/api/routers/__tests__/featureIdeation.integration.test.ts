/**
 * Integration test for the feature-ideation ACCEPT path
 * (`transcription.publishSelectedDraftFeatures`).
 *
 * Integration tests are deliberately rare here (see CLAUDE.md "Test database
 * safety") — the mocked-Prisma suite in `featureIdeation.test.ts` covers the
 * guard rails. This one earns a real database because accepting a draft routes
 * ticket creation through `createTicketWithNumber`, which atomically increments
 * the product's `ticketCounter`. Sequential ticket numbering continuing an
 * existing counter is genuine DB behaviour that a mock cannot demonstrate.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { getTestDb } from "~/test/test-db";
import { createTestCaller } from "~/test/trpc-helpers";
import { createUser, createWorkspace, createProduct } from "~/test/factories";

describe("transcription.publishSelectedDraftFeatures", () => {
  let db: ReturnType<typeof getTestDb>;

  beforeEach(() => {
    db = getTestDb();
  });

  it("materialises the draft into one Feature plus tickets numbered off the product counter, and drains the draft", async () => {
    const user = await createUser(db);
    const ws = await createWorkspace(db, {
      ownerId: user.id,
      slug: "feature-ideation-accept",
    });
    const product = await createProduct(db, {
      workspaceId: ws.id,
      createdById: user.id,
    });

    // Pretend the product already issued 5 tickets, so the new ones must
    // continue at 6 rather than restart.
    await db.product.update({
      where: { id: product.id },
      data: { ticketCounter: 5 },
    });

    const meeting = await db.transcriptionSession.create({
      data: {
        sessionId: `s-${Math.random().toString(36).slice(2, 10)}`,
        title: "Roadmap sync",
        transcription: "We should build bulk CSV import.",
        userId: user.id,
        workspaceId: ws.id,
      },
    });

    // No factory covers MeetingFeatureDraft — create the holding row directly.
    const draft = await db.meetingFeatureDraft.create({
      data: {
        transcriptionSessionId: meeting.id,
        createdById: user.id,
        name: "Bulk CSV import",
        description: "Import contacts from a CSV file.",
        vision: "Nobody types a contact in by hand again.",
        tickets: [
          { title: "Parse the CSV", body: null, type: "FEATURE" },
          { title: "Wire the upload button", body: "Front end only", type: "CHORE" },
        ],
      },
    });

    const caller = createTestCaller(user.id);
    const result = await caller.transcription.publishSelectedDraftFeatures({
      transcriptionId: meeting.id,
      draftIds: [draft.id],
      productId: product.id,
    });

    expect(result).toMatchObject({ featuresCreated: 1, ticketsCreated: 2 });

    // Exactly one Feature, in the chosen product, carrying the draft's name.
    const features = await db.feature.findMany({
      where: { productId: product.id },
    });
    expect(features).toHaveLength(1);
    expect(features[0]?.name).toBe("Bulk CSV import");
    expect(features[0]?.description).toBe("Import contacts from a CSV file.");

    // Tickets continue the product's counter, land in BACKLOG, and hang off
    // the new Feature.
    const tickets = await db.ticket.findMany({
      where: { productId: product.id },
      orderBy: { number: "asc" },
    });
    expect(tickets.map((t) => t.number)).toEqual([6, 7]);
    expect(tickets.map((t) => t.title)).toEqual([
      "Parse the CSV",
      "Wire the upload button",
    ]);
    expect(tickets.map((t) => t.status)).toEqual(["BACKLOG", "BACKLOG"]);
    expect(tickets.every((t) => t.featureId === features[0]?.id)).toBe(true);

    // The holding row is gone — the real Feature carries it now.
    const remainingDrafts = await db.meetingFeatureDraft.findMany({
      where: { transcriptionSessionId: meeting.id },
    });
    expect(remainingDrafts).toHaveLength(0);
  });
});
