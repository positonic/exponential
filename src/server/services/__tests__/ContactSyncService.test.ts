import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient, ContactImportBatch } from "@prisma/client";
import crypto from "crypto";

vi.mock("~/server/db", () => ({ db: mockDeep<PrismaClient>() }));
vi.mock("~/server/utils/encryption", () => ({
  encryptString: (value: string) => Buffer.from(value),
}));
vi.mock("~/server/services/ConnectionStrengthCalculator", () => ({
  ConnectionStrengthCalculator: { calculateScore: vi.fn().mockResolvedValue(0) },
}));

import { db } from "~/server/db";
import {
  ContactSyncService,
  ImportBatchError,
} from "~/server/services/ContactSyncService";
import {
  GoogleContactsService,
  type GoogleCalendarEvent,
  type GoogleContact,
} from "~/server/services/GoogleContactsService";

const dbMock = db as unknown as DeepMockProxy<PrismaClient>;

const USER = "user-1";
const WORKSPACE = "ws-1";

function emailHash(email: string): string {
  return crypto
    .createHash("sha256")
    .update(email.toLowerCase().trim())
    .digest("hex");
}

function makeBatch(overrides: Partial<ContactImportBatch>): ContactImportBatch {
  return {
    id: "batch-1",
    workspaceId: WORKSPACE,
    createdById: USER,
    source: "CALENDAR",
    status: "IN_PROGRESS",
    totalContacts: 0,
    processedContacts: 0,
    newContacts: 0,
    updatedContacts: 0,
    errorCount: 0,
    metadata: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    completedAt: null,
    ...overrides,
  } as ContactImportBatch;
}

function calendarMetadata(cursor: Record<string, unknown>) {
  return {
    cursor,
    dateRange: {
      start: "2025-01-01T00:00:00.000Z",
      end: "2026-01-01T00:00:00.000Z",
    },
  };
}

function event(
  id: string,
  attendeeEmails: string[],
): GoogleCalendarEvent {
  return {
    id,
    summary: `Event ${id}`,
    start: { dateTime: "2025-06-01T10:00:00Z" },
    end: { dateTime: "2025-06-01T11:00:00Z" },
    attendees: attendeeEmails.map((email) => ({ email })),
  };
}

function lastUpdateManyData(): Record<string, unknown> {
  const calls = dbMock.contactImportBatch.updateMany.mock.calls;
  const last = calls[calls.length - 1]?.[0] as { data: Record<string, unknown> };
  return last.data;
}

beforeEach(() => {
  mockReset(dbMock);
  vi.restoreAllMocks();
  dbMock.contactImportBatch.updateMany.mockResolvedValue({ count: 1 });
  // No pre-existing contacts/interactions: every upsert takes the create path.
  dbMock.crmContact.findFirst.mockResolvedValue(null);
  dbMock.crmContact.create.mockResolvedValue({ id: "c-1" } as never);
  dbMock.crmContactInteraction.findFirst.mockResolvedValue(null);
});

describe("processImportStep — batch contract", () => {
  it("returns the final state (instead of throwing) when a finished batch is retried", async () => {
    dbMock.contactImportBatch.findUnique.mockResolvedValue(
      makeBatch({
        status: "PARTIAL_SUCCESS",
        totalContacts: 7,
        processedContacts: 7,
        newContacts: 5,
        errorCount: 2,
        metadata: { errors: ["A: no email address"] },
      }),
    );

    const result = await ContactSyncService.processImportStep(
      "batch-1",
      USER,
      WORKSPACE,
    );

    expect(result.completed).toBe(true);
    expect(result.status).toBe("PARTIAL_SUCCESS");
    expect(result.processedContacts).toBe(7);
    expect(result.errors).toEqual(["A: no email address"]);
    expect(dbMock.contactImportBatch.updateMany).not.toHaveBeenCalled();
  });

  it("rejects a batch created by someone else", async () => {
    dbMock.contactImportBatch.findUnique.mockResolvedValue(
      makeBatch({ createdById: "someone-else" }),
    );

    await expect(
      ContactSyncService.processImportStep("batch-1", USER, WORKSPACE),
    ).rejects.toThrow(ImportBatchError);
  });

  it("throws when another step raced the guarded batch write", async () => {
    dbMock.contactImportBatch.findUnique.mockResolvedValue(
      makeBatch({
        source: "GMAIL",
        metadata: { cursor: { phase: "GMAIL" } },
      }),
    );
    vi.spyOn(GoogleContactsService, "fetchContacts").mockResolvedValue({
      contacts: [],
      nextPageToken: undefined,
    });
    dbMock.contactImportBatch.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      ContactSyncService.processImportStep("batch-1", USER, WORKSPACE),
    ).rejects.toThrow(/already running/);
  });
});

describe("processImportStep — GMAIL phase", () => {
  function gmailContact(email: string | null, name: string): GoogleContact {
    return {
      resourceName: `people/${name}`,
      names: [{ displayName: name, givenName: name }],
      emailAddresses: email ? [{ value: email }] : [],
    };
  }

  it("processes one page, records no-email contacts as errors, and advances the page token", async () => {
    dbMock.contactImportBatch.findUnique.mockResolvedValue(
      makeBatch({ source: "GMAIL", metadata: { cursor: { phase: "GMAIL" } } }),
    );
    vi.spyOn(GoogleContactsService, "fetchContacts").mockResolvedValue({
      contacts: [gmailContact("a@x.com", "Ada"), gmailContact(null, "Bob")],
      nextPageToken: "page-2",
    });

    const result = await ContactSyncService.processImportStep(
      "batch-1",
      USER,
      WORKSPACE,
    );

    expect(result).toMatchObject({
      completed: false,
      phase: "GMAIL",
      processedContacts: 2,
      newContacts: 1,
      errorCount: 1,
    });
    expect(result.errors).toEqual(["Bob: no email address"]);
    expect(lastUpdateManyData().metadata).toMatchObject({
      cursor: { phase: "GMAIL", pageToken: "page-2" },
    });
  });

  it("hands over to the CALENDAR phase after the last page when source is BOTH", async () => {
    dbMock.contactImportBatch.findUnique.mockResolvedValue(
      makeBatch({
        source: "BOTH",
        metadata: calendarMetadata({ phase: "GMAIL", pageToken: "last" }),
      }),
    );
    vi.spyOn(GoogleContactsService, "fetchContacts").mockResolvedValue({
      contacts: [gmailContact("a@x.com", "Ada")],
      nextPageToken: undefined,
    });

    const result = await ContactSyncService.processImportStep(
      "batch-1",
      USER,
      WORKSPACE,
    );

    expect(result.completed).toBe(false);
    expect(result.phase).toBe("CALENDAR");
  });

  it("completes after the last page when source is GMAIL only", async () => {
    dbMock.contactImportBatch.findUnique.mockResolvedValue(
      makeBatch({ source: "GMAIL", metadata: { cursor: { phase: "GMAIL" } } }),
    );
    vi.spyOn(GoogleContactsService, "fetchContacts").mockResolvedValue({
      contacts: [gmailContact("a@x.com", "Ada")],
      nextPageToken: undefined,
    });

    const result = await ContactSyncService.processImportStep(
      "batch-1",
      USER,
      WORKSPACE,
    );

    expect(result).toMatchObject({ completed: true, status: "COMPLETED" });
    expect(lastUpdateManyData().completedAt).toBeInstanceOf(Date);
  });
});

describe("processImportStep — CALENDAR phase", () => {
  it("splits a page whose first contact alone exceeds the pair budget, still advancing by one contact", async () => {
    // 301 events with heavy@x.com (over the 300-pair budget on its own),
    // one trailing event introducing light@x.com.
    const events = Array.from({ length: 301 }, (_, i) =>
      event(`e${i}`, ["heavy@x.com"]),
    );
    events.push(event("e-last", ["light@x.com"]));

    dbMock.contactImportBatch.findUnique.mockResolvedValue(
      makeBatch({ metadata: calendarMetadata({ phase: "CALENDAR" }) }),
    );
    vi.spyOn(
      GoogleContactsService,
      "fetchCalendarEventsPage",
    ).mockResolvedValue({ events, nextPageToken: undefined });

    const result = await ContactSyncService.processImportStep(
      "batch-1",
      USER,
      WORKSPACE,
      "me@x.com",
    );

    expect(result.completed).toBe(false);
    expect(result.processedContacts).toBe(1);
    expect(lastUpdateManyData().metadata).toMatchObject({
      cursor: {
        phase: "CALENDAR",
        lastContactHash: emailHash("heavy@x.com"),
      },
    });
  });

  it("resumes a split page after the stored contact hash and completes it", async () => {
    const events = [
      event("e1", ["heavy@x.com"]),
      event("e2", ["light@x.com"]),
    ];
    dbMock.contactImportBatch.findUnique.mockResolvedValue(
      makeBatch({
        totalContacts: 1,
        processedContacts: 1,
        newContacts: 1,
        metadata: calendarMetadata({
          phase: "CALENDAR",
          lastContactHash: emailHash("heavy@x.com"),
        }),
      }),
    );
    vi.spyOn(
      GoogleContactsService,
      "fetchCalendarEventsPage",
    ).mockResolvedValue({ events, nextPageToken: undefined });

    const result = await ContactSyncService.processImportStep(
      "batch-1",
      USER,
      WORKSPACE,
      "me@x.com",
    );

    // Only light@x.com is processed on the resumed step.
    expect(result.processedContacts).toBe(2);
    expect(result.completed).toBe(true);
    expect(result.status).toBe("COMPLETED");
  });

  it("re-processes from the top of a shifted page when the stored hash no longer matches", async () => {
    const events = [event("e1", ["a@x.com"]), event("e2", ["b@x.com"])];
    dbMock.contactImportBatch.findUnique.mockResolvedValue(
      makeBatch({
        metadata: calendarMetadata({
          phase: "CALENDAR",
          lastContactHash: emailHash("vanished@x.com"),
        }),
      }),
    );
    vi.spyOn(
      GoogleContactsService,
      "fetchCalendarEventsPage",
    ).mockResolvedValue({ events, nextPageToken: undefined });

    const result = await ContactSyncService.processImportStep(
      "batch-1",
      USER,
      WORKSPACE,
      "me@x.com",
    );

    // Unknown hash → start of page: idempotent re-processing, never skipping.
    expect(result.processedContacts).toBe(2);
    expect(result.completed).toBe(true);
  });

  it("advances to the next page token once a page's contacts are exhausted", async () => {
    dbMock.contactImportBatch.findUnique.mockResolvedValue(
      makeBatch({ metadata: calendarMetadata({ phase: "CALENDAR" }) }),
    );
    vi.spyOn(
      GoogleContactsService,
      "fetchCalendarEventsPage",
    ).mockResolvedValue({
      events: [event("e1", ["a@x.com"])],
      nextPageToken: "cal-page-2",
    });

    const result = await ContactSyncService.processImportStep(
      "batch-1",
      USER,
      WORKSPACE,
      "me@x.com",
    );

    expect(result.completed).toBe(false);
    expect(lastUpdateManyData().metadata).toMatchObject({
      cursor: { phase: "CALENDAR", pageToken: "cal-page-2" },
    });
  });
});
