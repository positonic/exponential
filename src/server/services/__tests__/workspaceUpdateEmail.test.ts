import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.SKIP_ENV_VALIDATION ??= "true";
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
});
vi.mock("~/server/db", () => ({ db: {} }));

import { buildUpdateSubscribeConfirmEmail, buildWorkspaceUpdateEmail } from "../EmailService";

describe("buildWorkspaceUpdateEmail", () => {
  const base = {
    subject: "Bulk edit lands",
    bodyHtml: "<p>Edit many tickets at once.</p>",
    bodyText: "Edit many tickets at once.",
    workspaceName: "Acme",
    unsubscribeUrl: "https://app.test/unsub/c1",
  };

  it("frames the sanitized body with the web link and a one-click unsubscribe", () => {
    const email = buildWorkspaceUpdateEmail({ ...base, webUrl: "https://app.test/updates/acme/u1", greetingName: "Ada" });

    expect(email.subject).toBe("Bulk edit lands");
    expect(email.htmlBody).toContain("<p>Edit many tickets at once.</p>");
    expect(email.htmlBody).toContain('href="https://app.test/updates/acme/u1"');
    expect(email.htmlBody).toContain('href="https://app.test/unsub/c1"');
    expect(email.htmlBody).toContain("Hi Ada,");
    expect(email.textBody).toContain("Read on the web: https://app.test/updates/acme/u1");
    expect(email.textBody).toContain("Unsubscribe: https://app.test/unsub/c1");
  });

  it("escapes record text in the frame", () => {
    const email = buildWorkspaceUpdateEmail({
      ...base,
      subject: "<img src=x onerror=alert(1)>",
      workspaceName: "Acme <b>&</b>",
      greetingName: "<script>",
    });
    expect(email.htmlBody).not.toContain("<img src=x");
    expect(email.htmlBody).not.toContain("<script>");
    expect(email.htmlBody).toContain("Acme &lt;b&gt;&amp;&lt;/b&gt;");
    expect(email.htmlBody).not.toContain("Read this update on the web");
  });
});

describe("buildUpdateSubscribeConfirmEmail", () => {
  it("links the confirmation and escapes what it adds", () => {
    const email = buildUpdateSubscribeConfirmEmail({
      workspaceName: "Acme <script>",
      confirmUrl: "https://app.test/updates/acme/confirm?token=a&b=\"x",
    });

    expect(email.subject).toBe("Confirm your subscription to Acme <script> updates");
    expect(email.htmlBody).toContain("Acme &lt;script&gt;");
    expect(email.htmlBody).not.toContain("<script>");
    expect(email.htmlBody).toContain('href="https://app.test/updates/acme/confirm?token=a&amp;b=&quot;x"');
    expect(email.textBody).toContain("https://app.test/updates/acme/confirm?token=a&b=\"x");
    expect(email.textBody).toContain("ignore this email and you won't be subscribed");
  });
});
