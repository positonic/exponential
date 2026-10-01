/**
 * Unit tests for `buildAssignmentNotificationEmail`,
 * `buildMentionNotificationEmail` and `buildNotificationEmail` — the pure
 * content builders behind the assignment, @mention and generic (ADR-0045
 * unified dispatch) notification emails.
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
  buildNotificationEmail,
  sendAssignmentNotificationEmail,
  sendMentionNotificationEmail,
  sendNotificationEmail,
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

const notificationParams = {
  to: "recipient@example.com",
  title: "Ship the thing is due today",
  message: "This one has been sitting in triage a while.",
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

  it("sendNotificationEmail passes to/workspaceId through and ships the escaped HTML", async () => {
    await sendNotificationEmail({
      ...notificationParams,
      title: XSS,
      workspaceId: "ws_generic",
    });

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ workspaceId: "ws_generic" }),
      }),
    );

    const body = postmarkPayload();
    expect(body.To).toBe("recipient@example.com");
    expect(body.HtmlBody).toContain(ESCAPED_XSS);
    expect(body.HtmlBody).not.toContain("<img src=x");
    expect(body.Subject).toBe(`[Exponential] ${XSS}`);
    expect(body.TextBody).toContain(XSS);
  });

  it("omitting workspaceId skips the workspace Postmark lookup entirely", async () => {
    await sendMentionNotificationEmail(mentionParams);

    expect(findFirst).not.toHaveBeenCalled();
    expect(postmarkPayload().To).toBe("mentioned@example.com");
  });
});

describe("buildNotificationEmail", () => {
  it("renders the title, message and CTA in both bodies", () => {
    const { subject, htmlBody, textBody } =
      buildNotificationEmail(notificationParams);

    expect(subject).toBe("[Exponential] Ship the thing is due today");
    expect(htmlBody).toContain("<title>Ship the thing is due today</title>");
    expect(htmlBody).toContain("Ship the thing is due today");
    expect(htmlBody).toContain("This one has been sitting in triage a while.");
    expect(htmlBody).toContain(`href="https://app.test/actions/abc"`);
    expect(htmlBody).toContain("View in Exponential");
    expect(textBody).toContain("Ship the thing is due today");
    expect(textBody).toContain("This one has been sitting in triage a while.");
    expect(textBody).toContain("View in Exponential: https://app.test/actions/abc");
  });

  it("omits the CTA when there is no action URL", () => {
    const { htmlBody, textBody } = buildNotificationEmail({
      ...notificationParams,
      actionUrl: undefined,
    });

    expect(htmlBody).not.toContain("View in Exponential");
    expect(htmlBody).not.toContain("copy and paste this link");
    expect(textBody).not.toContain("View in Exponential:");
  });

  it("omits the footer when there is no workspace context", () => {
    const { htmlBody, textBody } = buildNotificationEmail({
      to: notificationParams.to,
      title: notificationParams.title,
      message: notificationParams.message,
    });

    expect(htmlBody).not.toContain("notification preferences");
    expect(textBody).not.toContain("notification preferences");
  });

  it("escapes the title everywhere it lands in the HTML body", () => {
    const { htmlBody } = buildNotificationEmail({
      ...notificationParams,
      title: XSS,
    });

    expect(htmlBody).not.toContain("<img src=x");
    expect(htmlBody).not.toContain("onerror=\"alert(1)\"");
    // The document <title> and the <h1> heading.
    expect(htmlBody.split(ESCAPED_XSS).length - 1).toBe(2);
  });

  it("escapes the message in the HTML body", () => {
    const { htmlBody } = buildNotificationEmail({
      ...notificationParams,
      message: `</p><script>fetch("//evil.test")</script>`,
    });

    expect(htmlBody).not.toContain("<script>");
    expect(htmlBody).not.toContain("</p><script");
    expect(htmlBody).toContain(
      "&lt;/p&gt;&lt;script&gt;fetch(&quot;//evil.test&quot;)&lt;/script&gt;",
    );
  });

  it("keeps line breaks in a multi-line message as <br>", () => {
    const { htmlBody, textBody } = buildNotificationEmail({
      ...notificationParams,
      message: "First line\nsecond line\r\nthird <b>line</b>",
    });

    expect(htmlBody).toContain(
      "First line<br>second line<br>third &lt;b&gt;line&lt;/b&gt;",
    );
    // The <br> we insert is the only markup that survives.
    expect(htmlBody).not.toContain("<b>line</b>");
    expect(textBody).toContain("First line\nsecond line\r\nthird <b>line</b>");
  });

  describe("with a markdown variant", () => {
    const markdownParams = {
      ...notificationParams,
      message: "Up next\n1. C-643 Hotline\n   https://app.test/tickets/1",
      markdown: "**⏭ Up next**\n1. [C-643 Hotline](https://app.test/tickets/1)\n- Pick sources",
    };

    it("renders links as linked text and headings as bold in the HTML body", () => {
      const { htmlBody } = buildNotificationEmail(markdownParams);

      expect(htmlBody).toContain("<strong>⏭ Up next</strong><br>");
      expect(htmlBody).toMatch(
        /1\. <a href="https:\/\/app\.test\/tickets\/1"[^>]*>C-643 Hotline<\/a><br>• Pick sources/,
      );
      // The bare URL from the plain message does not appear as body text.
      expect(htmlBody).not.toContain(">https://app.test/tickets/1<");
    });

    it("keeps the plain message, bare URLs and all, in the text body", () => {
      const { textBody } = buildNotificationEmail(markdownParams);

      expect(textBody).toContain(markdownParams.message);
      expect(textBody).not.toContain("**");
    });

    it("escapes user text in the markdown, labels included", () => {
      const { htmlBody } = buildNotificationEmail({
        ...markdownParams,
        markdown: `- ${XSS}\n1. [${XSS}](https://app.test/x?a=1&b=2)`,
      });

      expect(htmlBody).not.toContain("<img src=x");
      expect(htmlBody).toContain(`• ${ESCAPED_XSS}`);
      expect(htmlBody).toContain(`href="https://app.test/x?a=1&amp;b=2"`);
    });

    it("links labels with brackets and URLs with balanced parentheses", () => {
      const { htmlBody } = buildNotificationEmail({
        ...markdownParams,
        markdown:
          "1. [C-9 [Bug] Login fails](https://app.test/t/9) · [wiki](https://en.test/Foo_(bar))",
      });

      expect(htmlBody).toMatch(/<a href="https:\/\/app\.test\/t\/9"[^>]*>C-9 \[Bug\] Login fails<\/a>/);
      expect(htmlBody).toMatch(/<a href="https:\/\/en\.test\/Foo_\(bar\)"[^>]*>wiki<\/a>/);
      expect(htmlBody).not.toContain("](");
    });

    it("renders non-http links as their label, never as an anchor", () => {
      const { htmlBody } = buildNotificationEmail({
        ...markdownParams,
        markdown: `[click](javascript:void(0)) and [x](data:text/html,hi)`,
      });

      expect(htmlBody).not.toContain("javascript:void");
      expect(htmlBody).not.toContain(`href="data:`);
      expect(htmlBody).toContain("click and x");
    });

    it("cannot break out of the href attribute", () => {
      const { htmlBody } = buildNotificationEmail({
        ...markdownParams,
        markdown: `[x](https://app.test/"onmouseover="alert(1))`,
      });

      expect(htmlBody).not.toContain(`"onmouseover="`);
      expect(htmlBody).toContain(`href="https://app.test/&quot;onmouseover=&quot;alert(1)"`);
    });
  });

  it("escapes the action URL so it cannot break out of the href attribute", () => {
    const { htmlBody } = buildNotificationEmail({
      ...notificationParams,
      actionUrl: `https://app.test/"><script>alert(1)</script>`,
    });

    expect(htmlBody).not.toContain("<script>");
    expect(htmlBody).toContain(
      `href="https://app.test/&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;"`,
    );
  });

  it("escapes the workspace name and settings URLs in the footer", () => {
    const { htmlBody } = buildNotificationEmail({
      ...notificationParams,
      workspaceName: XSS,
      personalSettingsUrl: `https://app.test/"onmouseover="alert(1)`,
    });

    expect(htmlBody).toContain(`<strong>${ESCAPED_XSS}</strong> workspace.`);
    expect(htmlBody).not.toContain(`"onmouseover="`);
  });

  it("leaves the plain-text body and subject unescaped", () => {
    const { subject, textBody } = buildNotificationEmail({
      ...notificationParams,
      title: XSS,
      message: `see <b>this</b> & that`,
      workspaceName: "A <b>bold</b> workspace",
    });

    expect(subject).toBe(`[Exponential] ${XSS}`);
    expect(textBody).toContain(XSS);
    expect(textBody).toContain(`see <b>this</b> & that`);
    expect(textBody).toContain("A <b>bold</b> workspace");
    expect(textBody).not.toContain("&amp;");
    expect(textBody).not.toContain("&lt;");
  });
});
