import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { MatrixNotificationService } from "~/server/services/notifications/MatrixNotificationService";

const OK = (body: unknown) =>
  ({ ok: true, status: 200, json: async () => body }) as unknown as Response;
const ERR = (status: number, body: unknown = {}) =>
  ({ ok: false, status, json: async () => body }) as unknown as Response;

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  process.env.GATEWAY_SECRET = "test-secret";
  process.env.MATRIX_GATEWAY_URL = "https://gw.example.com";
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.GATEWAY_SECRET;
  delete process.env.MATRIX_GATEWAY_URL;
});

describe("MatrixNotificationService", () => {
  it("POSTs userId + payload to the gateway /notify with the gateway secret", async () => {
    fetchMock.mockResolvedValue(OK({ delivered: true, roomId: "!dm:server" }));
    const svc = new MatrixNotificationService({ userId: "u1" });

    const result = await svc.sendNotification({ title: "Due soon", message: "Pay Malte" });

    expect(result).toEqual({ success: true, messageId: "!dm:server" });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("https://gw.example.com/notify");
    expect((init as RequestInit).method).toBe("POST");
    expect((init as Record<string, Record<string, string>>).headers["X-Gateway-Secret"]).toBe("test-secret");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      userId: "u1",
      title: "Due soon",
      message: "Pay Malte",
    });
  });

  it("appends the deeplink as an absolute URL to the message body", async () => {
    fetchMock.mockResolvedValue(OK({ delivered: true, roomId: "!dm:server" }));
    const svc = new MatrixNotificationService({ userId: "u1" });

    await svc.sendNotification({
      title: "Reminder: Gather medical bills",
      message: "Due in 1 hour",
      metadata: { deeplink: "/w/acme/actions/a1" },
    });

    const [, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse((init as RequestInit).body as string) as {
      message: string;
    };
    // Original message is preserved and the workspace-relative path is turned
    // into an absolute, clickable link. Origin comes from env-based resolution.
    expect(body.message.startsWith("Due in 1 hour")).toBe(true);
    expect(body.message).toMatch(/View action: https?:\/\/\S+\/w\/acme\/actions\/a1$/);
  });

  it("leaves the message untouched when there is no deeplink", async () => {
    fetchMock.mockResolvedValue(OK({ delivered: true, roomId: "!dm:server" }));
    const svc = new MatrixNotificationService({ userId: "u1" });

    await svc.sendNotification({
      title: "t",
      message: "Due in 1 hour",
      metadata: { category: "due_date" },
    });

    const [, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse((init as RequestInit).body as string) as {
      message: string;
    };
    expect(body.message).toBe("Due in 1 hour");
  });

  it("fails cleanly when the gateway secret is missing (no fetch)", async () => {
    delete process.env.GATEWAY_SECRET;
    const svc = new MatrixNotificationService({ userId: "u1" });
    const result = await svc.sendNotification({ title: "t", message: "m" });
    expect(result.success).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces a 404 (unpaired user) as a failure with the gateway's error", async () => {
    fetchMock.mockResolvedValue(ERR(404, { error: "User has no paired Matrix DM" }));
    const svc = new MatrixNotificationService({ userId: "u1" });
    const result = await svc.sendNotification({ title: "t", message: "m" });
    expect(result).toEqual({ success: false, error: "User has no paired Matrix DM" });
  });

  it("reports success:false when the gateway says delivered:false", async () => {
    fetchMock.mockResolvedValue(OK({ delivered: false }));
    const svc = new MatrixNotificationService({ userId: "u1" });
    const result = await svc.sendNotification({ title: "t", message: "m" });
    expect(result.success).toBe(false);
  });

  it("validateConfig flags missing userId / secret / url", async () => {
    delete process.env.MATRIX_GATEWAY_URL;
    delete process.env.GATEWAY_SECRET;
    const svc = new MatrixNotificationService({ userId: "" });
    const { valid, errors } = await svc.validateConfig();
    expect(valid).toBe(false);
    expect(errors).toHaveLength(3);
  });

  it("testConnection reflects the gateway /health matrixConnected flag", async () => {
    fetchMock.mockResolvedValue(OK({ status: "ok", matrixConnected: true }));
    const svc = new MatrixNotificationService({ userId: "u1" });
    await expect(svc.testConnection()).resolves.toEqual({ connected: true, error: undefined });

    fetchMock.mockResolvedValue(OK({ status: "ok", matrixConnected: false }));
    const down = await svc.testConnection();
    expect(down.connected).toBe(false);
  });
});
