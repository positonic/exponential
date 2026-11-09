/**
 * Unit tests for resolvePostmark — the resolver that decides whether a send uses
 * a workspace's own Postmark config or the instance-global env default — and
 * for the transport `sendEmail` picks (Postmark, then plain SMTP).
 * `~/server/db` is mocked so only findFirst behavior is exercised, and
 * nodemailer is mocked so no SMTP connection is ever opened.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.hoisted(() => {
  process.env.SKIP_ENV_VALIDATION ??= "true";
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
});

const { findFirst } = vi.hoisted(() => ({ findFirst: vi.fn() }));
vi.mock("~/server/db", () => ({
  db: { integration: { findFirst } },
}));

const { sendMail, createTransport } = vi.hoisted(() => {
  const sendMail = vi.fn();
  return { sendMail, createTransport: vi.fn(() => ({ sendMail })) };
});
vi.mock("nodemailer", () => ({ default: { createTransport } }));

import { resolvePostmark, sendMeetingInviteEmail, sendSignInCodeEmail } from "../EmailService";

const ENV_KEY = "env-server-token";
const ENV_FROM = "noreply@platform.test";

/** A workspace integration row with the given credential rows. */
function integrationWith(
  credentials: { key: string; keyType: string; isEncrypted: boolean }[],
) {
  return { id: "int_1", credentials };
}

beforeEach(() => {
  findFirst.mockReset();
  process.env.AUTH_POSTMARK_KEY = ENV_KEY;
  process.env.AUTH_POSTMARK_FROM = ENV_FROM;
  delete process.env.POSTMARK_SERVER_TOKEN;
  delete process.env.EMAIL_FROM;
  for (const name of SMTP_VARS) delete process.env[name];
  sendMail.mockReset().mockResolvedValue({ messageId: "m1" });
  createTransport.mockClear();
});

const SMTP_VARS = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASSWORD", "SMTP_SECURE"];

describe("resolvePostmark", () => {
  it("returns env config when no workspaceId is given (never queries the db)", async () => {
    const result = await resolvePostmark();
    expect(result).toEqual({ apiKey: ENV_KEY, from: ENV_FROM });
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("falls back to env config when the workspace has no postmark integration", async () => {
    findFirst.mockResolvedValue(null);
    const result = await resolvePostmark("ws_1");
    expect(result).toEqual({ apiKey: ENV_KEY, from: ENV_FROM });
  });

  it("uses the workspace config when both credentials are present", async () => {
    findFirst.mockResolvedValue(
      integrationWith([
        { key: "ws-token", keyType: "api_key", isEncrypted: false },
        { key: "hello@workspace.test", keyType: "from_address", isEncrypted: false },
      ]),
    );
    const result = await resolvePostmark("ws_1");
    expect(result).toEqual({ apiKey: "ws-token", from: "hello@workspace.test" });
  });

  it("falls back to env when the workspace config is missing the from-address", async () => {
    findFirst.mockResolvedValue(
      integrationWith([
        { key: "ws-token", keyType: "api_key", isEncrypted: false },
      ]),
    );
    const result = await resolvePostmark("ws_1");
    expect(result).toEqual({ apiKey: ENV_KEY, from: ENV_FROM });
  });

  it("looks up the integration by workspaceId only, not by user", async () => {
    findFirst.mockResolvedValue(null);
    await resolvePostmark("ws_1");
    const where = findFirst.mock.calls[0]?.[0]?.where as Record<string, unknown>;
    expect(where).toMatchObject({
      provider: "postmark",
      status: "ACTIVE",
      workspaceId: "ws_1",
    });
    expect(where).not.toHaveProperty("userId");
  });
});

describe("EMAIL_DELIVERY_DISABLED", () => {
  it("refuses every send before resolving a key or a workspace integration, and never calls Postmark", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    process.env.EMAIL_DELIVERY_DISABLED = "1";
    try {
      await expect(
        sendMeetingInviteEmail({
          to: "someone@example.com",
          method: "REQUEST",
          meetingTitle: "Launch scope",
          organizerName: "Org",
          startsAt: new Date("2026-10-12T09:00:00Z"),
          endsAt: new Date("2026-10-12T09:30:00Z"),
          icsContent: "BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n",
          workspaceId: "ws-with-its-own-postmark",
        }),
      ).rejects.toThrow(/EMAIL_DELIVERY_DISABLED/);
      expect(findFirst).not.toHaveBeenCalled();
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      delete process.env.EMAIL_DELIVERY_DISABLED;
      fetchSpy.mockRestore();
    }
  });
});

describe("transport selection", () => {
  const INVITE = {
    to: "guest@example.test",
    method: "REQUEST" as const,
    meetingTitle: "Launch scope",
    organizerName: "Org",
    startsAt: new Date("2026-10-12T09:00:00Z"),
    endsAt: new Date("2026-10-12T09:30:00Z"),
    icsContent: "BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n",
  };

  function configureSmtp() {
    process.env.SMTP_HOST = "smtp.example.test";
    process.env.SMTP_USER = "mailer";
    process.env.SMTP_PASSWORD = "hunter2";
    process.env.EMAIL_FROM = "auth@selfhost.test";
  }

  it("with Postmark and SMTP both configured, sends through Postmark and never touches SMTP", async () => {
    configureSmtp();
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 200 }));
    try {
      await sendSignInCodeEmail("someone@example.test", "ABCD2345");
      expect(fetchSpy).toHaveBeenCalledWith("https://api.postmarkapp.com/email", expect.anything());
      expect(createTransport).not.toHaveBeenCalled();
      expect(sendMail).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("Postmark sends from EMAIL_FROM when it is set", async () => {
    process.env.EMAIL_FROM = "auth@selfhost.test";
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 200 }));
    try {
      await sendSignInCodeEmail("someone@example.test", "ABCD2345");
      const body = JSON.parse(String(fetchSpy.mock.calls[0]![1]!.body)) as { From: string };
      expect(body.From).toBe("auth@selfhost.test");
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("with only SMTP configured, sends over SMTP from EMAIL_FROM with the .ics invite attached", async () => {
    delete process.env.AUTH_POSTMARK_KEY;
    configureSmtp();
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    try {
      await sendMeetingInviteEmail(INVITE);

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(createTransport).toHaveBeenCalledWith({
        host: "smtp.example.test",
        port: 587,
        secure: false,
        auth: { user: "mailer", pass: "hunter2" },
      });
      const mail = sendMail.mock.calls[0]![0] as {
        from: string;
        to: string;
        subject: string;
        attachments: { filename: string; content: Buffer; contentType: string }[];
      };
      expect(mail.from).toBe("auth@selfhost.test");
      expect(mail.to).toBe("guest@example.test");
      expect(mail.subject).toBe("Invitation: Launch scope");
      expect(mail.attachments).toHaveLength(1);
      expect(mail.attachments[0]!.filename).toMatch(/\.ics$/);
      expect(mail.attachments[0]!.contentType).toMatch(/^text\/calendar/);
      expect(mail.attachments[0]!.content.toString("utf8")).toBe(INVITE.icsContent);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("port 465 means implicit TLS unless SMTP_SECURE says otherwise", async () => {
    delete process.env.AUTH_POSTMARK_KEY;
    configureSmtp();
    process.env.SMTP_PORT = "465";
    await sendSignInCodeEmail("someone@example.test", "ABCD2345");
    expect(createTransport).toHaveBeenLastCalledWith(expect.objectContaining({ port: 465, secure: true }));
  });

  it("SMTP never sends as exponential.im: with no sender it is not configured", async () => {
    delete process.env.AUTH_POSTMARK_KEY;
    delete process.env.AUTH_POSTMARK_FROM;
    process.env.SMTP_HOST = "smtp.example.test";
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(sendSignInCodeEmail("someone@example.test", "ABCD2345")).rejects.toThrow(/not configured/);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("EMAIL_DELIVERY_DISABLED wins over SMTP too", async () => {
    delete process.env.AUTH_POSTMARK_KEY;
    configureSmtp();
    process.env.EMAIL_DELIVERY_DISABLED = "1";
    try {
      await expect(sendSignInCodeEmail("someone@example.test", "ABCD2345")).rejects.toThrow(
        /EMAIL_DELIVERY_DISABLED/,
      );
      expect(createTransport).not.toHaveBeenCalled();
    } finally {
      delete process.env.EMAIL_DELIVERY_DISABLED;
    }
  });
});
