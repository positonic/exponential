/**
 * Unit tests for the Sentry ingest service. Mocks `createTicketWithNumber` (the
 * shared create path) and uses `mockDeep<PrismaClient>()` so no real DB is
 * touched. Slice 2 has no dedup yet — every ingest creates exactly one ticket.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

vi.hoisted(() => {
  process.env.SKIP_ENV_VALIDATION ??= "true";
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
});

vi.mock("~/plugins/product/server/services/createTicket", () => ({
  createTicketWithNumber: vi.fn(() =>
    Promise.resolve({ id: "ticket-1", number: 7 }),
  ),
}));

// Zulip notify is exercised in its own test; here we just assert it's invoked
// (or not) with the right deep link.
vi.mock("../sentryZulip", () => ({
  notifyZulipOfSentryBug: vi.fn(() => Promise.resolve()),
}));

import { createTicketWithNumber } from "~/plugins/product/server/services/createTicket";
import { notifyZulipOfSentryBug } from "../sentryZulip";
import { ingestSentryBug, sourceLabel } from "../SentryBugService";
import { type SentryBug } from "../sentryPayload";

const dbMock: DeepMockProxy<PrismaClient> = mockDeep<PrismaClient>();

const bug: SentryBug = {
  issueId: "42",
  title: "Boom",
  level: "error",
  culprit: "app/page.tsx",
  url: "https://sentry.io/issues/42",
  shortId: "EXPONENTIAL-1AB",
  projectSlug: "exponential-frontend",
};

beforeEach(() => {
  mockReset(dbMock);
  vi.clearAllMocks();
  delete process.env.SENTRY_BUG_PRODUCT_ID;
  delete process.env.SENTRY_BOT_EMAIL;
  delete process.env.SENTRY_BOT_NAME;
  delete process.env.NEXT_PUBLIC_APP_URL;
  delete process.env.SENTRY_AI_FIXABLE_PROJECTS;
  dbMock.product.findUnique.mockResolvedValue(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    {
      id: "prod-1",
      workspaceId: "ws-1",
      slug: "exponential",
      workspace: { slug: "syntrofi" },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
  );
  // No existing ticket by default — each test opts into a dedup hit.
  dbMock.ticket.findFirst.mockResolvedValue(null);
  dbMock.user.upsert.mockResolvedValue(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { id: "errol-id" } as any,
  );
  dbMock.tag.upsert.mockResolvedValue(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { id: "tag-1" } as any,
  );
  dbMock.ticketTag.upsert.mockResolvedValue(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { id: "tt-1" } as any,
  );
});

describe("ingestSentryBug", () => {
  it("creates exactly one BUG/BACKLOG ticket via the shared service, authored by Errol", async () => {
    const result = await ingestSentryBug(dbMock, bug);

    expect(createTicketWithNumber).toHaveBeenCalledTimes(1);
    expect(createTicketWithNumber).toHaveBeenCalledWith(
      dbMock,
      expect.objectContaining({
        productId: "prod-1",
        workspaceId: "ws-1",
        createdById: "errol-id",
        title: "Boom",
        type: "BUG",
        status: "BACKLOG",
        links: { sentryIssueId: "42", sentryUrl: "https://sentry.io/issues/42" },
      }),
    );
    expect(result).toEqual({ created: true, ticketId: "ticket-1" });
  });

  it("find-or-creates Errol via upsert keyed on the bot email (no duplicate users)", async () => {
    process.env.SENTRY_BOT_EMAIL = "errol@bots.exponential.im";
    process.env.SENTRY_BOT_NAME = "Errol";

    await ingestSentryBug(dbMock, bug);

    expect(dbMock.user.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: "errol@bots.exponential.im" },
        create: { email: "errol@bots.exponential.im", name: "Errol" },
        update: {},
        select: { id: true },
      }),
    );
  });

  it("does not set a priority — left for human triage", async () => {
    await ingestSentryBug(dbMock, bug);
    const arg = vi.mocked(createTicketWithNumber).mock.calls[0]![1];
    expect(arg.priority).toBeUndefined();
  });

  describe("ai-fixable label", () => {
    it("is not applied when the allowlist is unset (opt-in only)", async () => {
      await ingestSentryBug(dbMock, bug);

      const slugs = dbMock.tag.upsert.mock.calls.map(
        (c) => c[0].where.slug_workspaceId?.slug,
      );
      expect(slugs).not.toContain("ai-fixable");
    });

    it("is applied when the issue's Sentry project is allowlisted", async () => {
      process.env.SENTRY_AI_FIXABLE_PROJECTS = "exponential-frontend";

      await ingestSentryBug(dbMock, bug);

      expect(dbMock.tag.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            slug_workspaceId: { slug: "ai-fixable", workspaceId: "ws-1" },
          },
          create: expect.objectContaining({
            name: "ai-fixable",
            slug: "ai-fixable",
            category: "label",
          }),
        }),
      );
    });

    it("is withheld for a project outside the allowlist (e.g. the backend service)", async () => {
      process.env.SENTRY_AI_FIXABLE_PROJECTS = "exponential-frontend";

      await ingestSentryBug(dbMock, { ...bug, projectSlug: "mastra-agents" });

      const slugs = dbMock.tag.upsert.mock.calls.map(
        (c) => c[0].where.slug_workspaceId?.slug,
      );
      expect(slugs).not.toContain("ai-fixable");
    });
  });

  it("find-or-creates the 'Sentry' and 'bug' workspace labels and attaches them", async () => {
    await ingestSentryBug(dbMock, bug);

    // Two standard labels plus the source label derived from the project slug
    // (see the "source label" suite below).
    expect(dbMock.tag.upsert).toHaveBeenCalledTimes(3);
    expect(dbMock.tag.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { slug_workspaceId: { slug: "sentry", workspaceId: "ws-1" } },
        create: expect.objectContaining({
          name: "Sentry",
          slug: "sentry",
          category: "label",
          workspaceId: "ws-1",
        }),
      }),
    );
    expect(dbMock.tag.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { slug_workspaceId: { slug: "bug", workspaceId: "ws-1" } },
        create: expect.objectContaining({
          name: "bug",
          slug: "bug",
          category: "label",
          workspaceId: "ws-1",
        }),
      }),
    );
    expect(dbMock.ticketTag.upsert).toHaveBeenCalledTimes(3);
    expect(dbMock.ticketTag.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { ticketId_tagId: { ticketId: "ticket-1", tagId: "tag-1" } },
        create: { ticketId: "ticket-1", tagId: "tag-1" },
      }),
    );
  });

  it("notifies Zulip on creation with a deep link to the new ticket", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example";

    await ingestSentryBug(dbMock, bug);

    expect(notifyZulipOfSentryBug).toHaveBeenCalledTimes(1);
    expect(notifyZulipOfSentryBug).toHaveBeenCalledWith(
      dbMock,
      expect.objectContaining({
        workspaceId: "ws-1",
        authorId: "errol-id",
        title: "Boom",
        sentryUrl: "https://sentry.io/issues/42",
        ticketUrl:
          "https://app.example/w/syntrofi/products/exponential/tickets/7",
      }),
    );
  });

  it("throws when the configured product does not exist", async () => {
    dbMock.product.findUnique.mockResolvedValue(null);
    await expect(ingestSentryBug(dbMock, bug)).rejects.toThrow(
      /Sentry bug product not found/,
    );
    expect(createTicketWithNumber).not.toHaveBeenCalled();
  });

  describe("dedup", () => {
    it("creates no new ticket for an already-seen issue id and returns the existing one", async () => {
      dbMock.ticket.findFirst.mockResolvedValue(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { id: "existing-ticket" } as any,
      );

      const result = await ingestSentryBug(dbMock, bug);

      expect(createTicketWithNumber).not.toHaveBeenCalled();
      // Recurring errors that dedup onto an existing ticket do not re-tag or re-notify.
      expect(dbMock.tag.upsert).not.toHaveBeenCalled();
      expect(notifyZulipOfSentryBug).not.toHaveBeenCalled();
      expect(result).toEqual({ created: false, ticketId: "existing-ticket" });
    });

    it("scopes the dedup lookup to the product and the Sentry issue id", async () => {
      await ingestSentryBug(dbMock, bug);

      expect(dbMock.ticket.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            productId: "prod-1",
            links: { path: ["sentryIssueId"], equals: "42" },
          },
        }),
      );
    });

    it("creates exactly one ticket for a previously-unseen issue id", async () => {
      dbMock.ticket.findFirst.mockResolvedValue(null);

      const result = await ingestSentryBug(dbMock, bug);

      expect(createTicketWithNumber).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ created: true, ticketId: "ticket-1" });
    });
  });

  describe("source label", () => {
    /** Slugs passed to tag.upsert for the current call. */
    function labelSlugs(): (string | undefined)[] {
      return dbMock.tag.upsert.mock.calls.map(
        (c) => c[0].where.slug_workspaceId?.slug,
      );
    }

    it("labels the ticket from an explicit ?service= value", async () => {
      await ingestSentryBug(dbMock, bug, { sourceSlug: "clear-pipeline" });
      expect(labelSlugs()).toContain("clear-pipeline");
    });

    it("falls back to the sender's project slug when none is given", async () => {
      await ingestSentryBug(dbMock, bug);
      // `bug.projectSlug` is exponential-frontend in this fixture.
      expect(labelSlugs()).toContain("exponential-frontend");
    });

    it("prefers the explicit value over the payload's project slug", async () => {
      await ingestSentryBug(dbMock, bug, { sourceSlug: "clear-api" });
      const slugs = labelSlugs();
      expect(slugs).toContain("clear-api");
      expect(slugs).not.toContain("exponential-frontend");
    });

    it("adds no source label when neither is available", async () => {
      await ingestSentryBug(
        dbMock,
        { ...bug, projectSlug: null },
        { sourceSlug: null },
      );
      // Only the two standard labels.
      expect(labelSlugs()).toEqual(["sentry", "bug"]);
    });
  });
});

describe("sourceLabel", () => {
  it("passes through an already-clean slug", () => {
    expect(sourceLabel("clear-pipeline")).toEqual({
      name: "clear-pipeline",
      slug: "clear-pipeline",
      color: "avatar-blue",
    });
  });

  it("normalizes case and separators", () => {
    expect(sourceLabel("  CLEAR Context_Pipeline  ")?.slug).toBe(
      "clear-context-pipeline",
    );
  });

  it("strips characters that would be unsafe or ugly in a tag", () => {
    expect(sourceLabel("../../etc/passwd")?.slug).toBe("etc-passwd");
    expect(sourceLabel("<script>alert(1)</script>")?.slug).toBe(
      "script-alert-1-script",
    );
  });

  it("bounds the length and leaves no trailing dash", () => {
    const slug = sourceLabel("a".repeat(40) + " tail")!.slug;
    expect(slug).toHaveLength(32);
    expect(slug.endsWith("-")).toBe(false);
  });

  it("returns null for empty or punctuation-only input", () => {
    expect(sourceLabel(null)).toBeNull();
    expect(sourceLabel("")).toBeNull();
    expect(sourceLabel("   ")).toBeNull();
    expect(sourceLabel("---")).toBeNull();
  });
});
