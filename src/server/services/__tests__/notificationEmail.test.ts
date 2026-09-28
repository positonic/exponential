/**
 * Unit tests for `buildAssignmentNotificationEmail` and
 * `buildMentionNotificationEmail` — the pure content builders behind the
 * assignment and @mention notification emails.
 *
 * The point of these tests is the HTML-escaping boundary: every name, action
 * title, comment body and URL in these emails is written by another user and
 * lands in the recipient's inbox, where injected markup reads as part of a
 * legitimate email. The HTML body must escape them; the plain-text body and the
 * subject must not (there is no markup to break out of, and `sendEmail` strips
 * CR/LF from subjects).
 *
 * `~/server/db` is mocked because the module imports it for `resolvePostmark`.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.hoisted(() => {
  process.env.SKIP_ENV_VALIDATION ??= "true";
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
});

const findFirst = vi.fn();
vi.mock("~/server/db", () => ({
  db: { integration: { findFirst: (...args: unknown[]) => findFirst(...args) } },
}));

import {
  buildAssignmentNotificationEmail,
  buildMentionNotificationEmail,
  sendAssignmentNotificationEmail,
  sendMentionNotificationEmail,
} from "../EmailService";

const XSS = `<img src=x onerror="alert(1)">`;
const ESCAPED_XSS =
  "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;";

const assignmentParams = {
  to: "assignee@example.com",
  assigneeName: "Alex",
  assignerName: "James",
  actionName: "Ship the thing",
  actionUrl: "https://app.test/actions/abc",
  workspaceName: "Syntrofi",
  personalSettingsUrl: "https://app.test/settings/notifications",
  workspaceSettingsUrl: "https://app.test/w/syntrofi/settings",
};

const mentionParams = {
  to: "mentioned@example.com",
  mentionedName: "Alex",
  authorName: "James",
  actionName: "Ship the thing",
  commentPreview: "Can you take a look?",
  actionUrl: "https://app.test/actions/abc",
  workspaceName: "Syntrofi",
  personalSettingsUrl: "https://app.test/settings/notifications",
  workspaceSettingsUrl: "https://app.test/w/syntrofi/settings",
};

describe("buildAssignmentNotificationEmail", () => {
  it("renders the assigner, action and workspace in both bodies", () => {
    const { subject, htmlBody, textBody } =
      buildAssignmentNotificationEmail(assignmentParams);

    expect(subject).toBe("[Exponential] You've been assigned to: Ship the thing");
    expect(htmlBody).toContain("Hi Alex,");
    expect(htmlBody).toContain(
      "<strong>James</strong> assigned you to <strong>Ship the thing</strong> in Syntrofi.",
    );
    expect(htmlBody).toContain(`href="https://app.test/actions/abc"`);
    expect(textBody).toContain("Hi Alex,");
    expect(textBody).toContain(
      `James assigned you to "Ship the thing" in Syntrofi.`,
    );
    expect(textBody).toContain("View Action: https://app.test/actions/abc");
  });

  it("falls back to a generic greeting when the assignee has no name", () => {
    const { htmlBody, textBody } = buildAssignmentNotificationEmail({
      ...assignmentParams,
      assigneeName: "",
    });
    expect(htmlBody).toContain("Hi there,");
    expect(textBody).toContain("Hi there,");
  });

  it("escapes the assigner name, action name and workspace name in the HTML body", () => {
    const { htmlBody } = buildAssignmentNotificationEmail({
      ...assignmentParams,
      assignerName: XSS,
      actionName: XSS,
      workspaceName: XSS,
    });

    expect(htmlBody).not.toContain("<img src=x");
    expect(htmlBody).not.toContain("onerror=\"alert(1)\"");
    // Three interpolations in the body plus the footer's workspace line.
    expect(htmlBody.split(ESCAPED_XSS).length - 1).toBe(4);
  });

  it("escapes the assignee name in the greeting", () => {
    const { htmlBody } = buildAssignmentNotificationEmail({
      ...assignmentParams,
      assigneeName: XSS,
    });
    expect(htmlBody).toContain(`Hi ${ESCAPED_XSS},`);
    expect(htmlBody).not.toContain("<img src=x");
  });

  it("escapes URLs so they cannot break out of the href attribute", () => {
    const { htmlBody } = buildAssignmentNotificationEmail({
      ...assignmentParams,
      actionUrl: `https://app.test/"><script>alert(1)</script>`,
      personalSettingsUrl: `https://app.test/"onmouseover="alert(1)`,
      workspaceSettingsUrl: `https://app.test/"onmouseover="alert(2)`,
    });

    expect(htmlBody).not.toContain("<script>");
    expect(htmlBody).not.toContain(`"onmouseover="`);
    expect(htmlBody).toContain(
      `href="https://app.test/&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;"`,
    );
  });

  it("leaves the plain-text body and subject unescaped", () => {
    const { subject, textBody } = buildAssignmentNotificationEmail({
      ...assignmentParams,
      assignerName: "Tom & Jerry",
      actionName: XSS,
      workspaceName: "A <b>bold</b> workspace",
    });

    expect(subject).toBe(`[Exponential] You've been assigned to: ${XSS}`);
    expect(textBody).toContain(`Tom & Jerry assigned you to "${XSS}"`);
    expect(textBody).toContain("A <b>bold</b> workspace");
    expect(textBody).not.toContain("&amp;");
    expect(textBody).not.toContain("&lt;");
  });
});

describe("buildMentionNotificationEmail", () => {
  it("renders the author, action and comment preview in both bodies", () => {
    const { subject, htmlBody, textBody } =
      buildMentionNotificationEmail(mentionParams);

    expect(subject).toBe("[Exponential] James mentioned you in: Ship the thing");
    expect(htmlBody).toContain("Hi Alex,");
    expect(htmlBody).toContain(
      "<strong>James</strong> mentioned you in a comment on <strong>Ship the thing</strong>:",
    );
    expect(htmlBody).toContain(`"Can you take a look?"`);
    expect(htmlBody).toContain(`href="https://app.test/actions/abc"`);
    expect(textBody).toContain(`"Can you take a look?"`);
    expect(textBody).toContain("View Comment: https://app.test/actions/abc");
  });

  it("falls back to a generic greeting when the mentioned user has no name", () => {
    const { htmlBody, textBody } = buildMentionNotificationEmail({
      ...mentionParams,
      mentionedName: "",
    });
    expect(htmlBody).toContain("Hi there,");
    expect(textBody).toContain("Hi there,");
  });

  it("escapes the author name, action name and comment preview in the HTML body", () => {
    const { htmlBody } = buildMentionNotificationEmail({
      ...mentionParams,
      authorName: XSS,
      actionName: XSS,
      commentPreview: XSS,
    });

    expect(htmlBody).not.toContain("<img src=x");
    expect(htmlBody).not.toContain("onerror=\"alert(1)\"");
    // Three interpolations in the body — the footer names the workspace, not these.
    expect(htmlBody.split(ESCAPED_XSS).length - 1).toBe(3);
  });

  it("escapes the mentioned name in the greeting", () => {
    const { htmlBody } = buildMentionNotificationEmail({
      ...mentionParams,
      mentionedName: XSS,
    });
    expect(htmlBody).toContain(`Hi ${ESCAPED_XSS},`);
    expect(htmlBody).not.toContain("<img src=x");
  });

  it("escapes a comment that tries to close the surrounding markup", () => {
    const { htmlBody } = buildMentionNotificationEmail({
      ...mentionParams,
      commentPreview: `</p></div><script>fetch("//evil.test")</script>`,
    });

    expect(htmlBody).not.toContain("<script>");
    expect(htmlBody).not.toContain("</p></div>");
    expect(htmlBody).toContain(
      "&lt;/p&gt;&lt;/div&gt;&lt;script&gt;fetch(&quot;//evil.test&quot;)&lt;/script&gt;",
    );
  });

  it("keeps line breaks in a multi-line comment preview as <br>", () => {
    const { htmlBody, textBody } = buildMentionNotificationEmail({
      ...mentionParams,
      commentPreview: "First line\nsecond line\r\nthird <b>line</b>",
    });

    expect(htmlBody).toContain(
      "First line<br>second line<br>third &lt;b&gt;line&lt;/b&gt;",
    );
    // The <br> we insert is the only markup that survives.
    expect(htmlBody).not.toContain("<b>line</b>");
    expect(textBody).toContain("First line\nsecond line\r\nthird <b>line</b>");
  });

  it("escapes the workspace name and settings URLs in the footer", () => {
    const { htmlBody } = buildMentionNotificationEmail({
      ...mentionParams,
      workspaceName: XSS,
      personalSettingsUrl: `https://app.test/"onmouseover="alert(1)`,
    });

    expect(htmlBody).toContain(`<strong>${ESCAPED_XSS}</strong> workspace.`);
    expect(htmlBody).not.toContain(`"onmouseover="`);
  });

  it("leaves the plain-text body and subject unescaped", () => {
    const { subject, textBody } = buildMentionNotificationEmail({
      ...mentionParams,
      authorName: "Tom & Jerry",
      actionName: XSS,
      commentPreview: `see <b>this</b> & that`,
    });

    expect(subject).toBe(`[Exponential] Tom & Jerry mentioned you in: ${XSS}`);
    expect(textBody).toContain(`Tom & Jerry mentioned you in a comment on "${XSS}"`);
    expect(textBody).toContain(`"see <b>this</b> & that"`);
    expect(textBody).not.toContain("&amp;");
    expect(textBody).not.toContain("&lt;");
  });
});

/**
 * The send wrappers are thin, but they are where `to` and `workspaceId` are
 * plumbed from `params` into `sendEmail` — and a mistake there is invisible to
 * the builder tests above. Dropping `workspaceId` would silently fall back to
 * the instance-global Postmark sender instead of the workspace's own (see
 * `resolvePostmark`), and a wrong `to` would deliver someone else's
 * notification to the wrong inbox. Both typecheck cleanly, so assert them.
 */
describe("notification email send wrappers", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    findFirst.mockReset();
    // No workspace Postmark integration -> resolvePostmark falls back to env.
    findFirst.mockResolvedValue(null);
    process.env.AUTH_POSTMARK_KEY = "test-postmark-token";
    fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => "" });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.AUTH_POSTMARK_KEY;
  });

  const postmarkPayload = () =>
    JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as {
      To: string;
      Subject: string;
      HtmlBody: string;
      TextBody: string;
    };

  it("sendAssignmentNotificationEmail passes to/workspaceId through and ships the escaped HTML", async () => {
    await sendAssignmentNotificationEmail({
      ...assignmentParams,
      actionName: XSS,
      workspaceId: "ws_assign",
    });

    // workspaceId reached resolvePostmark, so a workspace-configured sender
    // would have been honoured.
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ workspaceId: "ws_assign" }),
      }),
    );

    const body = postmarkPayload();
    expect(body.To).toBe("assignee@example.com");
    expect(body.HtmlBody).toContain(ESCAPED_XSS);
    expect(body.HtmlBody).not.toContain("<img src=x");
    // Subject and text body stay raw.
    expect(body.Subject).toBe(`[Exponential] You've been assigned to: ${XSS}`);
    expect(body.TextBody).toContain(XSS);
  });

  it("sendMentionNotificationEmail passes to/workspaceId through and ships the escaped HTML", async () => {
    await sendMentionNotificationEmail({
      ...mentionParams,
      commentPreview: XSS,
      workspaceId: "ws_mention",
    });

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ workspaceId: "ws_mention" }),
      }),
    );

    const body = postmarkPayload();
    expect(body.To).toBe("mentioned@example.com");
    expect(body.HtmlBody).toContain(ESCAPED_XSS);
    expect(body.HtmlBody).not.toContain("<img src=x");
    expect(body.TextBody).toContain(XSS);
  });

  it("omitting workspaceId skips the workspace Postmark lookup entirely", async () => {
    await sendMentionNotificationEmail(mentionParams);

    expect(findFirst).not.toHaveBeenCalled();
    expect(postmarkPayload().To).toBe("mentioned@example.com");
  });
});
