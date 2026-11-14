// @vitest-environment node
/**
 * Route-handler tests for the notification cron: it must fail closed without
 * CRON_SECRET, and the outbound-post sweep (ADR-0075) it now also runs must never
 * take the person-keyed retries down with it.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const {
  headersMock,
  retryPendingDeliveriesMock,
  generateDueDateRemindersMock,
  generateScheduledSummariesMock,
  deliverPendingOutboundPostsMock,
} = vi.hoisted(() => ({
  headersMock: vi.fn(),
  retryPendingDeliveriesMock: vi.fn(),
  generateDueDateRemindersMock: vi.fn(),
  generateScheduledSummariesMock: vi.fn(),
  deliverPendingOutboundPostsMock: vi.fn(),
}));

vi.mock("next/headers", () => ({ headers: headersMock }));
vi.mock("~/server/db", () => ({ db: { __stub: "db" } }));
vi.mock("~/server/services/notifications/emit/processNotifications", () => ({
  retryPendingDeliveries: retryPendingDeliveriesMock,
}));
vi.mock("~/server/services/notifications/emit/dueDateReminders", () => ({
  generateDueDateReminders: generateDueDateRemindersMock,
}));
vi.mock("~/server/services/notifications/emit/summaries", () => ({
  generateScheduledSummaries: generateScheduledSummariesMock,
}));
vi.mock("~/server/services/outboundPosts/deliver", () => ({
  deliverPendingOutboundPosts: deliverPendingOutboundPostsMock,
}));

import { GET } from "../process-notifications/route";

const request = {} as NextRequest;

function authHeader(value: string | null) {
  headersMock.mockResolvedValue(new Headers(value === null ? {} : { authorization: value }));
}

describe("/api/cron/process-notifications", () => {
  const originalSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    process.env.CRON_SECRET = "test-secret";
    generateDueDateRemindersMock.mockResolvedValue({ created: 0 });
    generateScheduledSummariesMock.mockResolvedValue({ created: 0 });
    retryPendingDeliveriesMock.mockResolvedValue({ retried: 0 });
    deliverPendingOutboundPostsMock.mockResolvedValue({ scanned: 1, sent: 1, failed: 0, cancelled: 0 });
    authHeader("Bearer test-secret");
  });

  afterEach(() => {
    process.env.CRON_SECRET = originalSecret;
    vi.restoreAllMocks();
  });

  it("fails closed with 503 when CRON_SECRET is not configured", async () => {
    delete process.env.CRON_SECRET;
    authHeader(null);

    const response = await GET(request);

    expect(response.status).toBe(503);
    expect(deliverPendingOutboundPostsMock).not.toHaveBeenCalled();
  });

  it("rejects a wrong bearer", async () => {
    authHeader("Bearer nope");

    const response = await GET(request);

    expect(response.status).toBe(401);
    expect(retryPendingDeliveriesMock).not.toHaveBeenCalled();
  });

  it("runs the outbound sweep after the notification retries and reports its counts", async () => {
    const response = await GET(request);
    const body = (await response.json()) as { ok: boolean; outbound: unknown };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(deliverPendingOutboundPostsMock).toHaveBeenCalledWith({ __stub: "db" });
    expect(body.outbound).toEqual({ scanned: 1, sent: 1, failed: 0, cancelled: 0 });
  });

  it("keeps the run green when the outbound sweep throws", async () => {
    deliverPendingOutboundPostsMock.mockRejectedValue(new Error("sweep exploded"));

    const response = await GET(request);
    const body = (await response.json()) as { ok: boolean; retry: unknown; outbound: { error: string } };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.retry).toEqual({ retried: 0 });
    expect(body.outbound).toEqual({ error: "sweep exploded" });
  });
});
