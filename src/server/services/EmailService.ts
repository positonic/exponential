/**
 * Email Service for transactional emails via Postmark
 *
 * NOTE: This file uses hardcoded colors because email clients do not support
 * CSS variables. Inline styles with actual color values are required for
 * email compatibility across Gmail, Outlook, Apple Mail, etc.
 */

/* eslint-disable no-restricted-syntax */

import { colorTokens } from "~/styles/colors";
import { PRODUCT_NAME } from "~/lib/brand";
import { getPublicBaseUrlFromEnv } from "~/lib/urls";
import { db } from "~/server/db";
import { getDecryptedKey } from "~/server/utils/credentialHelper";
import {
  formatSignInCode,
  SIGN_IN_CODE_TTL_MINUTES,
} from "~/lib/signInCode";

const POSTMARK_API_URL = "https://api.postmarkapp.com/email";

/**
 * Escape a value before interpolating it into an email's HTML body.
 *
 * Workspace and person names are attacker-writable text that lands in someone
 * else's inbox, where injected markup reads as part of a legitimate email.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

interface PostmarkConfig {
  apiKey: string | null;
  from: string;
}

/**
 * Resolve which Postmark server token + from-address to use for a send.
 *
 * When a `workspaceId` is provided and that workspace has an ACTIVE `postmark`
 * integration with both an api key and a from-address, the workspace's own
 * Postmark config is used so its email ships from its own sender. Otherwise we
 * fall back to the instance-global env vars — the historical behavior — which is
 * also what pre-login emails (magic link / welcome) always use since they carry
 * no workspace context.
 *
 * Looked up by `workspaceId` only (no `userId` filter): notification / CRM /
 * broadcast sends run in a background context with no session user.
 */
export async function resolvePostmark(
  workspaceId?: string
): Promise<PostmarkConfig> {
  const envConfig: PostmarkConfig = {
    apiKey: process.env.AUTH_POSTMARK_KEY ?? process.env.POSTMARK_SERVER_TOKEN ?? null,
    from: process.env.AUTH_POSTMARK_FROM ?? "noreply@exponential.im",
  };

  if (!workspaceId) return envConfig;

  const integration = await db.integration.findFirst({
    where: { provider: "postmark", status: "ACTIVE", workspaceId },
    include: { credentials: true },
  });

  if (!integration) return envConfig;

  const apiKeyCred = integration.credentials.find((c) => c.keyType === "api_key");
  const fromCred = integration.credentials.find((c) => c.keyType === "from_address");

  // A corrupted/tampered credential must not break the send — fall back to env.
  let apiKey: string | null = null;
  try {
    apiKey = apiKeyCred ? getDecryptedKey(apiKeyCred) : null;
  } catch (error) {
    console.error(
      "[EmailService] Failed to decrypt workspace Postmark API key; falling back to env config.",
      error,
    );
    return envConfig;
  }
  const from = fromCred?.key;

  // Use the workspace config only when both parts are present; a partial config
  // must not mix a workspace key with the platform from-address (or vice versa).
  if (apiKey && from) {
    return { apiKey, from };
  }

  return envConfig;
}

// Email clients don't support CSS variables, so we inline the brand hex here.
// Source of truth is `colorTokens.light.brand.primary` in `src/styles/colors.ts`.
const EMAIL_BRAND_COLOR = colorTokens.light.brand.primary;

interface EmailAttachment {
  Name: string;
  /** Base64-encoded file content. */
  Content: string;
  ContentType: string;
}

interface SendEmailParams {
  to: string;
  subject: string;
  htmlBody: string;
  textBody: string;
  /**
   * When set, a workspace-configured Postmark server token + from-address is
   * preferred over the env default. Omit for pre-login / non-workspace emails.
   */
  workspaceId?: string;
  /** Postmark Attachments array — e.g. an iCalendar invite. */
  attachments?: EmailAttachment[];
}

async function sendEmail({ to, subject, htmlBody, textBody, workspaceId, attachments }: SendEmailParams): Promise<void> {
  const { apiKey, from } = await resolvePostmark(workspaceId);

  if (!apiKey) {
    console.error(
      "[EmailService] Postmark API key not configured. Set AUTH_POSTMARK_KEY or POSTMARK_SERVER_TOKEN environment variable, or configure a workspace Postmark integration."
    );
    throw new Error("Email service not configured: missing AUTH_POSTMARK_KEY or POSTMARK_SERVER_TOKEN");
  }

  // Subjects can carry user-authored text (workspace, project, person names).
  // Postmark's JSON API builds the MIME itself, but strip header-control
  // characters anyway so no caller can ever smuggle CR/LF into a header.
  const safeSubject = subject.replace(/[\r\n\0]/g, " ");

  const response = await fetch(POSTMARK_API_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Postmark-Server-Token": apiKey,
    },
    body: JSON.stringify({
      From: from,
      To: to,
      Subject: safeSubject,
      HtmlBody: htmlBody,
      TextBody: textBody,
      MessageStream: "outbound",
      ...(attachments && attachments.length > 0 ? { Attachments: attachments } : {}),
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error("[EmailService] Failed to send email:", error);
    throw new Error(`Failed to send email: ${error}`);
  }
}

/**
 * Send the Sign-in code email (for returning users).
 *
 * Contains no link, deliberately — see
 * [ADR-0056](../../../docs/adr/0056-sign-in-codes-replace-magic-links.md).
 * Corporate mail scanners follow URLs in email and the token is single-use, so
 * a link here gets spent before the human ever clicks it.
 */
export async function sendSignInCodeEmail(
  email: string,
  code: string
): Promise<void> {
  const appName = PRODUCT_NAME;

  const htmlBody = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>Sign in to ${appName}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f9fafb;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="min-width: 100%; background-color: #f9fafb;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 480px; background-color: #ffffff; border-radius: 8px; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 32px 32px 24px; text-align: center;">
              <h1 style="margin: 0; font-size: 20px; font-weight: 600; color: #111827;">
                Sign in to ${appName}
              </h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 0 32px;">
              <p style="margin: 0 0 24px; font-size: 15px; line-height: 1.6; color: #4b5563;">
                Enter this code on the sign-in page to access your account.
              </p>

              <!-- Sign-in code -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center" style="padding: 8px 0 24px;">
                    <div style="display: inline-block; padding: 16px 32px; background-color: #f3f4f6; border: 1px solid #e5e7eb; border-radius: 6px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 28px; font-weight: 600; letter-spacing: 4px; color: #111827;">
                      ${formatSignInCode(code)}
                    </div>
                  </td>
                </tr>
              </table>

              <!-- Expiration Notice -->
              <p style="margin: 0; padding: 12px 16px; background-color: #f3f4f6; border-radius: 6px; font-size: 13px; color: #6b7280;">
                This code expires in ${SIGN_IN_CODE_TTL_MINUTES} minutes.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 32px 32px;">
              <p style="margin: 0; font-size: 13px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 24px;">
                Didn't request this? You can safely ignore this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`.trim();

  const textBody = `
Sign in to ${appName}

Enter this code on the sign-in page to access your account:

${formatSignInCode(code)}

This code expires in ${SIGN_IN_CODE_TTL_MINUTES} minutes.

Didn't request this? You can safely ignore this email.
`.trim();

  await sendEmail({
    to: email,
    subject: `Your sign-in code for ${appName}`,
    htmlBody,
    textBody,
  });
}

/**
 * Send the Sign-in code email for a brand-new email address (first sign-in).
 *
 * Deliberately as minimal as the returning-user variant above — greeting, code,
 * expiry, nothing else — so the code is visible in preview panes and
 * notification banners. All onboarding content waits for the **Welcome email**
 * (`sendFirstLoginWelcomeEmail`), sent after the first successful sign-in.
 * Workspace-agnostic on purpose: an invitee already received the invite email
 * naming the workspace, and this path must not grow DB lookups for flavor text.
 * Carries a code rather than a link — see ADR-0056.
 */
export async function sendWelcomeWithSignInCodeEmail(
  email: string,
  code: string
): Promise<void> {
  const appName = PRODUCT_NAME;

  const htmlBody = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>Welcome to ${appName}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f9fafb;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="min-width: 100%; background-color: #f9fafb;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 480px; background-color: #ffffff; border-radius: 8px; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 32px 32px 24px; text-align: center;">
              <h1 style="margin: 0; font-size: 20px; font-weight: 600; color: #111827;">
                Welcome to ${appName}
              </h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 0 32px;">
              <p style="margin: 0 0 16px; font-size: 15px; line-height: 1.6; color: #4b5563;">
                Hi there,
              </p>
              <p style="margin: 0 0 24px; font-size: 15px; line-height: 1.6; color: #4b5563;">
                Sign in &amp; start planning — enter this code on the sign-in page:
              </p>

              <!-- Sign-in code -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center" style="padding: 8px 0 24px;">
                    <div style="display: inline-block; padding: 16px 32px; background-color: #f3f4f6; border: 1px solid #e5e7eb; border-radius: 6px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 28px; font-weight: 600; letter-spacing: 4px; color: #111827;">
                      ${formatSignInCode(code)}
                    </div>
                  </td>
                </tr>
              </table>

              <!-- Expiration Notice -->
              <p style="margin: 0; padding: 12px 16px; background-color: #f3f4f6; border-radius: 6px; font-size: 13px; color: #6b7280;">
                This sign-in code expires in ${SIGN_IN_CODE_TTL_MINUTES} minutes.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 32px 32px;">
              <p style="margin: 0; font-size: 13px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 24px;">
                Didn't request this? You can safely ignore this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`.trim();

  const textBody = `
Welcome to ${appName}

Hi there,

Sign in & start planning — enter this code on the sign-in page:

${formatSignInCode(code)}

This sign-in code expires in ${SIGN_IN_CODE_TTL_MINUTES} minutes.

Didn't request this? You can safely ignore this email.
`.trim();

  await sendEmail({
    to: email,
    subject: `Welcome to ${appName} — your sign-in code`,
    htmlBody,
    textBody,
  });
}

/** Invited-workspace frame for the Welcome email. */
export interface FirstLoginWelcomeInvited {
  workspaceName: string;
  /** Inviter's display name; null renders a nameless "You've been added" opening. */
  inviterName: string | null;
}

export interface FirstLoginWelcomeParams {
  to: string;
  name?: string | null;
  invited?: FirstLoginWelcomeInvited;
  chatTools?: { slack: boolean; matrix: boolean };
}

/**
 * Build the **Welcome email** — the single onboarding email a user ever
 * receives, fired once from `events.createUser` after the first successful
 * sign-in on any provider. Replaces both the OAuth-only welcome and the long
 * welcome-with-code email: the sign-in code emails stay minimal, and the pitch
 * waits until the person is actually in (see CONTEXT.md, "Welcome email").
 *
 * One shared body with a variant frame: with `invited` set, the frame names
 * the first accepted invited workspace (subject and heading) and the inviter
 * (opening line). Tailoring is deterministic only — `chatTools` decides which
 * chat tool the task-layer bullet names (Matrix only when the invited
 * workspace demonstrably uses it; Slack is the default, including for organic
 * signups).
 *
 * Pure content builder, no I/O — exported so the branch matrix
 * (invited × inviter × chatTools × name) is unit-testable without a Postmark
 * stub. `sendFirstLoginWelcomeEmail` below is the thin send wrapper.
 */
export function buildFirstLoginWelcomeEmail(params: FirstLoginWelcomeParams): {
  subject: string;
  htmlBody: string;
  textBody: string;
} {
  const { name, invited, chatTools } = params;
  const brandColor = EMAIL_BRAND_COLOR;
  const appName = PRODUCT_NAME;
  // NEXTAUTH_URL is commonly configured with a trailing slash; strip it so
  // the CTA link isn't `https://host//daily-plan`.
  const appUrl = (process.env.NEXTAUTH_URL ?? getPublicBaseUrlFromEnv()).replace(/\/+$/, "");
  const dailyPlannerUrl = `${appUrl}/daily-plan`;

  const chatToolPhrase = chatTools?.matrix
    ? chatTools.slack
      ? "Slack or Matrix"
      : "Matrix"
    : "Slack";

  // `??` alone would let a whitespace-only stored name through and render
  // "Hi  ," — treat blank as missing (same guard as `resolveInvitedContext`).
  const trimmedName = name?.trim();
  const greetingHtml = trimmedName ? `Hi ${escapeHtml(trimmedName)},` : "Hi there,";
  const greetingText = trimmedName ? `Hi ${trimmedName},` : "Hi there,";

  const heading = invited
    ? `You've joined ${invited.workspaceName}`
    : `Welcome to ${appName}`;

  const openingHtml = invited
    ? invited.inviterName
      ? `<strong>${escapeHtml(invited.inviterName)}</strong> added you to <strong>${escapeHtml(invited.workspaceName)}</strong> — you're in.`
      : `You've been added to <strong>${escapeHtml(invited.workspaceName)}</strong> — you're in.`
    : `Thanks for signing up for ${appName}.`;
  const openingText = invited
    ? invited.inviterName
      ? `${invited.inviterName} added you to ${invited.workspaceName} — you're in.`
      : `You've been added to ${invited.workspaceName} — you're in.`
    : `Thanks for signing up for ${appName}.`;

  const subject = invited
    ? `Welcome to ${invited.workspaceName} on ${appName}`
    : `Welcome to ${appName} — here's the only thing you need to do`;

  const htmlBody = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>${escapeHtml(heading)}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f9fafb;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="min-width: 100%; background-color: #f9fafb;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 560px; background-color: #ffffff; border-radius: 8px; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 32px 32px 24px; text-align: center;">
              <h1 style="margin: 0; font-size: 22px; font-weight: 600; color: #111827;">
                ${escapeHtml(heading)}
              </h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 0 32px;">
              <p style="margin: 0 0 16px; font-size: 15px; line-height: 1.6; color: #4b5563;">
                ${greetingHtml}
              </p>
              <p style="margin: 0 0 16px; font-size: 15px; line-height: 1.6; color: #4b5563;">
                ${openingHtml}
              </p>
              <p style="margin: 0 0 16px; font-size: 15px; line-height: 1.6; color: #4b5563;">
                I'm not going to pretend you need to watch 12 tutorial videos and set up the "perfect workflow" before you can use it. That's procrastination dressed up as productivity.
              </p>

              <!-- What matters section -->
              <p style="margin: 0 0 8px; font-size: 15px; font-weight: 600; color: #111827;">
                Here's what actually matters:
              </p>
              <p style="margin: 0 0 16px; font-size: 15px; line-height: 1.6; color: #4b5563;">
                ${appName} isn't a to-do list. It's a coordination layer for AI-first teams. The difference is simple: to-do lists help you track what you're doing. ${appName} helps humans and AI work toward what actually matters.
              </p>

              <!-- Today section -->
              <p style="margin: 0 0 8px; font-size: 15px; font-weight: 600; color: #111827;">
                Today, do one thing:
              </p>
              <p style="margin: 0 0 16px; font-size: 15px; line-height: 1.6; color: #4b5563;">
                Open ${appName} and go through <a href="${dailyPlannerUrl}" style="color: ${brandColor}; text-decoration: none;">Daily Planning</a>. In a few minutes, you'll connect your day's work to actual outcomes—not just tasks to check off.
              </p>

              <!-- CTA Button -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center" style="padding: 8px 0 24px;">
                    <a href="${dailyPlannerUrl}" target="_blank" style="display: inline-block; padding: 14px 32px; background-color: ${brandColor}; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 600; border-radius: 6px;">
                      Start today's plan
                    </a>
                  </td>
                </tr>
              </table>

              <!-- After that section -->
              <div style="padding: 20px; background-color: #f3f4f6; border-radius: 6px; margin-bottom: 24px;">
                <p style="margin: 0 0 12px; font-size: 14px; font-weight: 600; color: #374151;">
                  After that, if you want to go deeper:
                </p>
                <ul style="margin: 0; padding-left: 20px; font-size: 14px; line-height: 1.8; color: #4b5563;">
                  <li><strong>Let AI handle your task layer.</strong> Connect a meeting, voice note, or ${chatToolPhrase} thread. Watch it become actions automatically.</li>
                  <li><strong>Set personal goals and goals for the projects you're working on, not tasks.</strong> What result do you want this week? ${appName} works backward from there.</li>
                  <li><strong>Run a weekly plan.</strong> Five minutes to see which projects are healthy and which need attention.</li>
                  <li><strong>Connect your tools.</strong> Slack, Notion, GitHub, Google Calendar. One workspace with a single page which tells you what you should work on today - instead of six browser tabs!</li>
                </ul>
              </div>

              <p style="margin: 0 0 24px; font-size: 15px; line-height: 1.6; color: #4b5563;">
                AI handles execution. You handle intent. That's the deal.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 0 32px 32px;">
              <p style="margin: 0 0 16px; font-size: 14px; color: #4b5563; border-top: 1px solid #e5e7eb; padding-top: 24px;">
                I'll check in with ideas on getting the most from ${appName}. Reply anytime—I read everything.
              </p>
              <p style="margin: 0; font-size: 14px; color: #374151;">
                — James
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`.trim();

  const textBody = `
${heading}

${greetingText}

${openingText}

I'm not going to pretend you need to watch 12 tutorial videos and set up the "perfect workflow" before you can use it. That's procrastination dressed up as productivity.

HERE'S WHAT ACTUALLY MATTERS:

${appName} isn't a to-do list. It's a coordination layer for AI-first teams. The difference is simple: to-do lists help you track what you're doing. ${appName} helps humans and AI work toward what actually matters.

TODAY, DO ONE THING:

Open ${appName} and go through Daily Planning (${dailyPlannerUrl}). In a few minutes, you'll connect your day's work to actual outcomes—not just tasks to check off.

---

AFTER THAT, IF YOU WANT TO GO DEEPER:

• Let AI handle your task layer. Connect a meeting, voice note, or ${chatToolPhrase} thread. Watch it become actions automatically.

• Set personal goals and goals for the projects you're working on, not tasks. What result do you want this week? ${appName} works backward from there.

• Run a weekly plan. Five minutes to see which projects are healthy and which need attention.

• Connect your tools. Slack, Notion, GitHub, Google Calendar. One workspace with a single page which tells you what you should work on today - instead of six browser tabs!

---

AI handles execution. You handle intent. That's the deal.

---

I'll check in with ideas on getting the most from ${appName}. Reply anytime—I read everything.

— James
`.trim();

  return { subject, htmlBody, textBody };
}

/** Send the Welcome email — thin wrapper over the pure builder above. */
export async function sendFirstLoginWelcomeEmail(
  params: FirstLoginWelcomeParams
): Promise<void> {
  const { subject, htmlBody, textBody } = buildFirstLoginWelcomeEmail(params);
  await sendEmail({ to: params.to, subject, htmlBody, textBody });
}

/**
 * Send team invitation email to invitee (used by both team and workspace invite flows
 * when the recipient does not yet have an account).
 */
export async function sendTeamInvitationEmail(params: {
  to: string;
  teamName: string;
  inviterName: string;
  inviteUrl: string;
}): Promise<void> {
  const { to, teamName, inviterName, inviteUrl } = params;
  const brandColor = EMAIL_BRAND_COLOR;
  const appName = PRODUCT_NAME;

  const htmlBody = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>You've been added to ${teamName} on ${appName}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f9fafb;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="min-width: 100%; background-color: #f9fafb;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 480px; background-color: #ffffff; border-radius: 8px; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 32px 32px 24px; text-align: center;">
              <h1 style="margin: 0; font-size: 20px; font-weight: 600; color: #111827;">
                You've been added to ${teamName}
              </h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 0 32px;">
              <p style="margin: 0 0 24px; font-size: 15px; line-height: 1.6; color: #4b5563;">
                <strong>${inviterName}</strong> has added you to <strong>${teamName}</strong> on ${appName}. Set up your account to start collaborating.
              </p>

              <!-- CTA Button -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center" style="padding: 8px 0 24px;">
                    <a href="${inviteUrl}" target="_blank" style="display: inline-block; padding: 14px 32px; background-color: ${brandColor}; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 600; border-radius: 6px;">
                      Accept Invitation
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Fallback Link -->
              <p style="margin: 0 0 8px; font-size: 13px; color: #6b7280;">
                Or copy and paste this link into your browser:
              </p>
              <p style="margin: 0 0 24px; font-size: 12px; color: #9ca3af; word-break: break-all;">
                ${inviteUrl}
              </p>

              <!-- Expiration Notice -->
              <p style="margin: 0; padding: 12px 16px; background-color: #f3f4f6; border-radius: 6px; font-size: 13px; color: #6b7280;">
                This invitation expires in 7 days.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 32px 32px;">
              <p style="margin: 0; font-size: 13px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 24px;">
                If you weren't expecting this invitation, you can safely ignore this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`.trim();

  const textBody = `
You've been added to ${teamName}

${inviterName} has added you to ${teamName} on ${appName}. Set up your account to start collaborating.

Accept the invitation: ${inviteUrl}

This invitation expires in 7 days.

If you weren't expecting this invitation, you can safely ignore this email.
`.trim();

  await sendEmail({
    to,
    subject: `You've been added to ${teamName} on ${appName}`,
    htmlBody,
    textBody,
  });
}

/**
 * Send a notification email to an existing user who has just been added to a workspace.
 * Unlike the invitation email, the recipient already has an account. The CTA still goes
 * through the /invite/<token> landing page (not the bare workspace URL): they're usually
 * signed out where they read email, and the landing page prefills their address and
 * offers a one-click sign-in code instead of an anonymous /signin wall.
 */
export async function sendWorkspaceMemberAddedEmail(params: {
  to: string;
  workspaceName: string;
  inviterName: string;
  ctaUrl: string;
}): Promise<void> {
  const { to, workspaceName, inviterName, ctaUrl } = params;
  const brandColor = EMAIL_BRAND_COLOR;
  const appName = PRODUCT_NAME;
  // Names come from whoever did the adding; the address is validated but still
  // interpolated into markup. Escape everything that reaches the HTML body.
  const safeTo = escapeHtml(to);
  const safeWorkspaceName = escapeHtml(workspaceName);
  const safeInviterName = escapeHtml(inviterName);

  const htmlBody = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>You've been added to ${safeWorkspaceName} on ${appName}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f9fafb;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="min-width: 100%; background-color: #f9fafb;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 480px; background-color: #ffffff; border-radius: 8px; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 32px 32px 24px; text-align: center;">
              <h1 style="margin: 0; font-size: 20px; font-weight: 600; color: #111827;">
                You've been added to ${safeWorkspaceName}
              </h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 0 32px;">
              <p style="margin: 0 0 24px; font-size: 15px; line-height: 1.6; color: #4b5563;">
                <strong>${safeInviterName}</strong> has added you to the <strong>${safeWorkspaceName}</strong> workspace on ${appName}.
              </p>

              <!-- CTA Button -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center" style="padding: 8px 0 24px;">
                    <a href="${ctaUrl}" target="_blank" style="display: inline-block; padding: 14px 32px; background-color: ${brandColor}; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 600; border-radius: 6px;">
                      Open Workspace
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 0 0 24px; font-size: 13px; line-height: 1.6; color: #6b7280;">
                If you're not signed in on this device, sign in as <strong>${safeTo}</strong> — we'll email you a short sign-in code, or use Google or Microsoft.
              </p>

              <!-- Fallback Link -->
              <p style="margin: 0 0 8px; font-size: 13px; color: #6b7280;">
                Or copy and paste this link into your browser:
              </p>
              <p style="margin: 0 0 24px; font-size: 12px; color: #9ca3af; word-break: break-all;">
                ${ctaUrl}
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 32px 32px;">
              <p style="margin: 0; font-size: 13px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 24px;">
                If you weren't expecting to be added to this workspace, you can ignore this email or contact ${safeInviterName} to be removed.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`.trim();

  const textBody = `
You've been added to ${workspaceName}

${inviterName} has added you to the ${workspaceName} workspace on ${appName}.

Open the workspace: ${ctaUrl}

If you're not signed in on this device, sign in as ${to} — we'll email you a short sign-in code, or use Google or Microsoft.

If you weren't expecting to be added to this workspace, you can ignore this email or contact ${inviterName} to be removed.
`.trim();

  await sendEmail({
    to,
    subject: `You've been added to ${workspaceName} on ${appName}`,
    htmlBody,
    textBody,
  });
}

/**
 * Generate the notification footer HTML shared by assignment and mention emails
 *
 * `workspaceName` is attacker-writable text and the two settings URLs land in
 * `href` attributes, so both are escaped in the HTML half. The text half is
 * left raw — plain text has no markup to break out of.
 */
function generateNotificationFooter(params: {
  workspaceName: string;
  personalSettingsUrl: string;
  workspaceSettingsUrl: string;
}): { html: string; text: string } {
  const { workspaceName, personalSettingsUrl, workspaceSettingsUrl } = params;

  const html = `
          <!-- Footer -->
          <tr>
            <td style="padding: 24px 32px 32px;">
              <p style="margin: 0 0 8px; font-size: 12px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 24px;">
                You're receiving this because email notifications are enabled for the <strong>${escapeHtml(workspaceName)}</strong> workspace.
              </p>
              <p style="margin: 0; font-size: 12px; color: #9ca3af;">
                <a href="${escapeHtml(personalSettingsUrl)}" style="color: #6b7280; text-decoration: underline;">Manage your notification preferences</a>
                &nbsp;&middot;&nbsp;
                <a href="${escapeHtml(workspaceSettingsUrl)}" style="color: #6b7280; text-decoration: underline;">Workspace notification settings</a>
              </p>
            </td>
          </tr>`;

  const text = `---
You're receiving this because email notifications are enabled for the ${workspaceName} workspace.
Manage your notification preferences: ${personalSettingsUrl}
Workspace notification settings: ${workspaceSettingsUrl}`;

  return { html, text };
}

export interface AssignmentNotificationParams {
  to: string;
  assigneeName: string;
  assignerName: string;
  actionName: string;
  actionUrl: string;
  workspaceName: string;
  personalSettingsUrl: string;
  workspaceSettingsUrl: string;
  workspaceId?: string;
}

/**
 * Build the assignment notification email — sent when someone assigns the
 * recipient to an action.
 *
 * The assigner's display name, the action's name and the workspace name are all
 * attacker-writable text landing in someone else's inbox, so they are escaped
 * for the HTML body along with the action URL that goes into `href`. The
 * plain-text body and the subject stay unescaped — there is no markup to break
 * out of, and `sendEmail` strips CR/LF from subjects.
 *
 * Pure content builder, no I/O — exported so the escaping is unit-testable
 * without a Postmark stub. `sendAssignmentNotificationEmail` below is the thin
 * send wrapper.
 */
export function buildAssignmentNotificationEmail(
  params: AssignmentNotificationParams
): {
  subject: string;
  htmlBody: string;
  textBody: string;
} {
  const { assigneeName, assignerName, actionName, actionUrl, workspaceName, personalSettingsUrl, workspaceSettingsUrl } = params;
  const brandColor = EMAIL_BRAND_COLOR;
  const appName = PRODUCT_NAME;
  const footer = generateNotificationFooter({ workspaceName, personalSettingsUrl, workspaceSettingsUrl });
  const greeting = assigneeName ? `Hi ${assigneeName},` : "Hi there,";

  const safeGreeting = assigneeName
    ? `Hi ${escapeHtml(assigneeName)},`
    : "Hi there,";
  const safeAssignerName = escapeHtml(assignerName);
  const safeActionName = escapeHtml(actionName);
  const safeWorkspaceName = escapeHtml(workspaceName);
  const safeActionUrl = escapeHtml(actionUrl);

  const htmlBody = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>New Action Assignment</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f9fafb;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="min-width: 100%; background-color: #f9fafb;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 480px; background-color: #ffffff; border-radius: 8px; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 32px 32px 24px; text-align: center;">
              <h1 style="margin: 0; font-size: 20px; font-weight: 600; color: #111827;">
                New Action Assignment
              </h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 0 32px;">
              <p style="margin: 0 0 8px; font-size: 15px; line-height: 1.6; color: #4b5563;">
                ${safeGreeting}
              </p>
              <p style="margin: 0 0 24px; font-size: 15px; line-height: 1.6; color: #4b5563;">
                <strong>${safeAssignerName}</strong> assigned you to <strong>${safeActionName}</strong> in ${safeWorkspaceName}.
              </p>

              <!-- CTA Button -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center" style="padding: 8px 0 24px;">
                    <a href="${safeActionUrl}" target="_blank" style="display: inline-block; padding: 14px 32px; background-color: ${brandColor}; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 600; border-radius: 6px;">
                      View Action
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Fallback Link -->
              <p style="margin: 0 0 8px; font-size: 13px; color: #6b7280;">
                Or copy and paste this link into your browser:
              </p>
              <p style="margin: 0 0 24px; font-size: 12px; color: #9ca3af; word-break: break-all;">
                ${safeActionUrl}
              </p>
            </td>
          </tr>

          ${footer.html}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`.trim();

  const textBody = `
New Action Assignment

${greeting}

${assignerName} assigned you to "${actionName}" in ${workspaceName}.

View Action: ${actionUrl}

${footer.text}
`.trim();

  return {
    subject: `[${appName}] You've been assigned to: ${actionName}`,
    htmlBody,
    textBody,
  };
}

/**
 * Send email notification when a user is assigned to an action — thin wrapper
 * over the pure builder above.
 */
export async function sendAssignmentNotificationEmail(
  params: AssignmentNotificationParams
): Promise<void> {
  const { subject, htmlBody, textBody } =
    buildAssignmentNotificationEmail(params);
  await sendEmail({
    to: params.to,
    subject,
    htmlBody,
    textBody,
    workspaceId: params.workspaceId,
  });
}

export interface NotificationEmailParams {
  to: string;
  title: string;
  message: string;
  actionUrl?: string;
  workspaceName?: string;
  personalSettingsUrl?: string;
  workspaceSettingsUrl?: string;
  workspaceId?: string;
  /**
   * Optional markdown rendering of `message` (the notification's
   * `metadata.markdown`, ADR-0059). When present the HTML body renders it —
   * links as linked text, `**bold**` as bold — while the plain-text body keeps
   * `message` with its bare URLs.
   */
  markdown?: string;
}

// One level of balanced brackets in the label ("[Bug] Login fails") and of
// balanced parentheses in the URL (Wikipedia-style), as CommonMark allows.
const MARKDOWN_LINK = /\[((?:[^[\]]|\[[^[\]]*\])*)\]\(((?:[^()\s]|\([^()\s]*\))*)\)/g;
const MARKDOWN_BOLD = /\*\*(.+?)\*\*/g;
const EMAIL_SAFE_HREF = /^(https?:|mailto:)/i;

function boldToHtml(escaped: string): string {
  return escaped.replace(MARKDOWN_BOLD, "<strong>$1</strong>");
}

/**
 * Render the small markdown subset notification digests use — `**bold**`,
 * `[label](url)` links, `- ` bullets and line breaks — as email HTML.
 *
 * The markdown carries user-authored text (action names are themselves
 * markdown), so every line is escaped before any markup is added. Only
 * http(s) and mailto links become anchors; anything else (`javascript:` …)
 * renders as its label. Bold is applied to the text and link labels only,
 * never inside an `href`.
 */
function markdownToEmailHtml(markdown: string): string {
  return markdown
    .split(/\r?\n/)
    .map((line) => {
      // split() with two capture groups yields [text, label, href, text, …].
      const parts = escapeHtml(line.replace(/^- /, "• ")).split(MARKDOWN_LINK);
      let html = "";
      for (let i = 0; i < parts.length; i += 3) {
        html += boldToHtml(parts[i] ?? "");
        if (i + 2 >= parts.length) continue;
        const label = boldToHtml(parts[i + 1] ?? "");
        const href = parts[i + 2] ?? "";
        html += EMAIL_SAFE_HREF.test(href)
          ? `<a href="${href}" target="_blank" style="color: ${EMAIL_BRAND_COLOR}; text-decoration: underline;">${label}</a>`
          : label;
      }
      return html;
    })
    .join("<br>");
}

/**
 * Build the generic, category-agnostic notification email used by the unified
 * dispatch Email channel (ADR-0045). Renders a title, a message line, and an
 * optional CTA button; includes the workspace footer when workspace context is
 * supplied.
 *
 * The title and message come straight off the `NotificationPayload`, which
 * emitters build from user-authored project / action / comment names and
 * content, so both are attacker-writable text landing in someone else's inbox.
 * They are escaped for the HTML body along with the action URL, which lands in
 * an `href` attribute. The plain-text body and the subject stay unescaped —
 * there is no markup to break out of, and `sendEmail` strips CR/LF from
 * subjects.
 *
 * Pure content builder, no I/O — exported so the escaping is unit-testable
 * without a Postmark stub. `sendNotificationEmail` below is the thin send
 * wrapper.
 */
export function buildNotificationEmail(params: NotificationEmailParams): {
  subject: string;
  htmlBody: string;
  textBody: string;
} {
  const {
    title,
    message,
    actionUrl,
    workspaceName,
    personalSettingsUrl,
    workspaceSettingsUrl,
    markdown,
  } = params;
  const brandColor = EMAIL_BRAND_COLOR;
  const appName = PRODUCT_NAME;

  const footer =
    workspaceName && personalSettingsUrl && workspaceSettingsUrl
      ? generateNotificationFooter({ workspaceName, personalSettingsUrl, workspaceSettingsUrl })
      : { html: "", text: "" };

  const safeTitle = escapeHtml(title);
  const safeActionUrl = actionUrl ? escapeHtml(actionUrl) : undefined;
  // A notification message can be multi-line prose, so escape first and only
  // then turn the newlines into markup — otherwise it collapses into one
  // run-on line. A markdown variant, when supplied, gets linked text instead
  // of bare URLs.
  const safeMessage = markdown
    ? markdownToEmailHtml(markdown)
    : escapeHtml(message).replace(/\r?\n/g, "<br>");

  const ctaHtml = safeActionUrl
    ? `
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center" style="padding: 8px 0 24px;">
                    <a href="${safeActionUrl}" target="_blank" style="display: inline-block; padding: 14px 32px; background-color: ${brandColor}; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 600; border-radius: 6px;">
                      View in ${appName}
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 0 0 8px; font-size: 13px; color: #6b7280;">
                Or copy and paste this link into your browser:
              </p>
              <p style="margin: 0 0 24px; font-size: 12px; color: #9ca3af; word-break: break-all;">
                ${safeActionUrl}
              </p>`
    : "";

  const htmlBody = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>${safeTitle}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f9fafb;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="min-width: 100%; background-color: #f9fafb;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 480px; background-color: #ffffff; border-radius: 8px; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);">
          <tr>
            <td style="padding: 32px 32px 24px; text-align: center;">
              <h1 style="margin: 0; font-size: 20px; font-weight: 600; color: #111827;">
                ${safeTitle}
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 32px;">
              <p style="margin: 0 0 24px; font-size: 15px; line-height: 1.6; color: #4b5563;">
                ${safeMessage}
              </p>
              ${ctaHtml}
            </td>
          </tr>
          ${footer.html}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`.trim();

  const textBody = `
${title}

${message}
${actionUrl ? `\nView in ${appName}: ${actionUrl}\n` : ""}
${footer.text}
`.trim();

  return {
    subject: `[${appName}] ${title}`,
    htmlBody,
    textBody,
  };
}

/**
 * Send the generic notification email — thin wrapper over the pure builder
 * above.
 */
export async function sendNotificationEmail(
  params: NotificationEmailParams
): Promise<void> {
  const { subject, htmlBody, textBody } = buildNotificationEmail(params);
  await sendEmail({
    to: params.to,
    subject,
    htmlBody,
    textBody,
    workspaceId: params.workspaceId,
  });
}

export interface MentionNotificationParams {
  to: string;
  mentionedName: string;
  authorName: string;
  actionName: string;
  commentPreview: string;
  actionUrl: string;
  workspaceName: string;
  personalSettingsUrl: string;
  workspaceSettingsUrl: string;
  workspaceId?: string;
}

/**
 * Build the mention notification email — sent when someone @mentions the
 * recipient in a comment.
 *
 * Everything interpolated here is attacker-writable: the author's display name,
 * the commented-on action's name, and above all the comment preview, which is
 * raw text the mentioning user typed. All of it is escaped for the HTML body,
 * including the URLs that land in `href` attributes. The plain-text body and
 * the subject stay unescaped — there is no markup to break out of, and
 * `sendEmail` strips CR/LF from subjects.
 *
 * Pure content builder, no I/O — exported so the escaping is unit-testable
 * without a Postmark stub. `sendMentionNotificationEmail` below is the thin
 * send wrapper.
 */
export function buildMentionNotificationEmail(
  params: MentionNotificationParams
): {
  subject: string;
  htmlBody: string;
  textBody: string;
} {
  const { mentionedName, authorName, actionName, commentPreview, actionUrl, workspaceName, personalSettingsUrl, workspaceSettingsUrl } = params;
  const brandColor = EMAIL_BRAND_COLOR;
  const appName = PRODUCT_NAME;
  const footer = generateNotificationFooter({ workspaceName, personalSettingsUrl, workspaceSettingsUrl });
  const greeting = mentionedName ? `Hi ${mentionedName},` : "Hi there,";

  const safeGreeting = mentionedName
    ? `Hi ${escapeHtml(mentionedName)},`
    : "Hi there,";
  const safeAuthorName = escapeHtml(authorName);
  const safeActionName = escapeHtml(actionName);
  const safeActionUrl = escapeHtml(actionUrl);
  // A comment is multi-line prose, so escape first and only then turn the
  // newlines into markup — otherwise the preview collapses into one run-on line.
  const safeCommentPreview = escapeHtml(commentPreview).replace(/\r?\n/g, "<br>");

  const htmlBody = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>You were mentioned in a comment</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f9fafb;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="min-width: 100%; background-color: #f9fafb;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 480px; background-color: #ffffff; border-radius: 8px; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 32px 32px 24px; text-align: center;">
              <h1 style="margin: 0; font-size: 20px; font-weight: 600; color: #111827;">
                You were mentioned in a comment
              </h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 0 32px;">
              <p style="margin: 0 0 8px; font-size: 15px; line-height: 1.6; color: #4b5563;">
                ${safeGreeting}
              </p>
              <p style="margin: 0 0 16px; font-size: 15px; line-height: 1.6; color: #4b5563;">
                <strong>${safeAuthorName}</strong> mentioned you in a comment on <strong>${safeActionName}</strong>:
              </p>

              <!-- Comment Preview -->
              <div style="margin: 0 0 24px; padding: 12px 16px; background-color: #f3f4f6; border-left: 3px solid ${brandColor}; border-radius: 0 6px 6px 0;">
                <p style="margin: 0; font-size: 14px; line-height: 1.6; color: #4b5563; font-style: italic;">
                  "${safeCommentPreview}"
                </p>
              </div>

              <!-- CTA Button -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center" style="padding: 8px 0 24px;">
                    <a href="${safeActionUrl}" target="_blank" style="display: inline-block; padding: 14px 32px; background-color: ${brandColor}; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 600; border-radius: 6px;">
                      View Comment
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Fallback Link -->
              <p style="margin: 0 0 8px; font-size: 13px; color: #6b7280;">
                Or copy and paste this link into your browser:
              </p>
              <p style="margin: 0 0 24px; font-size: 12px; color: #9ca3af; word-break: break-all;">
                ${safeActionUrl}
              </p>
            </td>
          </tr>

          ${footer.html}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`.trim();

  const textBody = `
You were mentioned in a comment

${greeting}

${authorName} mentioned you in a comment on "${actionName}":

"${commentPreview}"

View Comment: ${actionUrl}

${footer.text}
`.trim();

  return {
    subject: `[${appName}] ${authorName} mentioned you in: ${actionName}`,
    htmlBody,
    textBody,
  };
}

/**
 * Send email notification when a user is mentioned in a comment — thin wrapper
 * over the pure builder above.
 */
export async function sendMentionNotificationEmail(
  params: MentionNotificationParams
): Promise<void> {
  const { subject, htmlBody, textBody } = buildMentionNotificationEmail(params);
  await sendEmail({
    to: params.to,
    subject,
    htmlBody,
    textBody,
    workspaceId: params.workspaceId,
  });
}

/**
 * Welcome email for a new CRM Customer (Channel Partner / Advisor) onboarded by
 * a CRM Automation. Deliberately distinct from Adobe Sign's own "review & sign"
 * email — this is the branded "you're signed up" note (CONTEXT.md → Recipient
 * email experience). Returns the composed content so the caller can log it as a
 * CrmCommunication.
 */
export async function sendCrmOnboardingWelcomeEmail(params: {
  to: string;
  name?: string | null;
  customerType: string;
  workspaceId?: string;
}): Promise<{ subject: string; htmlBody: string; textBody: string }> {
  const { to, name, customerType, workspaceId } = params;
  const appName = PRODUCT_NAME;
  const greeting = name ? `Hi ${name},` : "Hi there,";
  const subject = `Welcome — you're signed up as a ${customerType}`;

  const htmlBody = `
<!DOCTYPE html>
<html lang="en">
  <body style="font-family: Arial, Helvetica, sans-serif; color: #1a1a1a; line-height: 1.6; padding: 24px;">
    <p>${greeting}</p>
    <p>Welcome to ${appName}! You've been signed up as a <strong>${customerType}</strong>.</p>
    <p>We're preparing your ${customerType} agreement now. You'll receive a separate
       email shortly with a secure link to review and sign it electronically.</p>
    <p style="color: ${EMAIL_BRAND_COLOR};">Thanks,<br />The ${appName} team</p>
  </body>
</html>`;

  const textBody = `${greeting}

Welcome to ${appName}! You've been signed up as a ${customerType}.

We're preparing your ${customerType} agreement now. You'll receive a separate email shortly with a secure link to review and sign it electronically.

Thanks,
The ${appName} team`;

  await sendEmail({ to, subject, htmlBody, textBody, workspaceId });
  return { subject, htmlBody, textBody };
}

/**
 * Send a CRM Automation email with **user-authored** content (subject + body)
 * from the Automation builder. The body HTML is already rendered + escaped by
 * the caller (`contentRendering`); here we only wrap it in the branded shell.
 * Returns the composed content so the caller can log it as a CrmCommunication.
 */
export async function sendCrmAutomationEmail(params: {
  to: string;
  subject: string;
  bodyHtml: string;
  bodyText: string;
  workspaceId?: string;
}): Promise<{ subject: string; htmlBody: string; textBody: string }> {
  const appName = PRODUCT_NAME;
  const htmlBody = `
<!DOCTYPE html>
<html lang="en">
  <body style="font-family: Arial, Helvetica, sans-serif; color: #1a1a1a; line-height: 1.6; padding: 24px;">
    ${params.bodyHtml}
    <p style="color: ${EMAIL_BRAND_COLOR}; margin-top: 24px;">— The ${appName} team</p>
  </body>
</html>`;

  await sendEmail({
    to: params.to,
    subject: params.subject,
    htmlBody,
    textBody: params.bodyText,
    workspaceId: params.workspaceId,
  });
  return { subject: params.subject, htmlBody, textBody: params.bodyText };
}

function escapeDigestHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** For values inside a double-quoted attribute (hrefs): text escaping plus quotes. */
function escapeEmailAttr(s: string): string {
  return escapeDigestHtml(s).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/**
 * Renders + sends a "What Shipped Today" Broadcast digest email. The body leads
 * with the AI prose summary, then the structured per-category list; the footer
 * carries the mandatory one-click unsubscribe link (CONTEXT.md → Broadcast).
 */
export async function sendBroadcastDigestEmail(params: {
  to: string;
  subject: string;
  summary: string;
  sections: { category: string; items: string[] }[];
  unsubscribeUrl: string;
  greetingName?: string | null;
  workspaceId?: string;
}): Promise<{ subject: string; htmlBody: string; textBody: string }> {
  const appName = PRODUCT_NAME;
  const greeting = params.greetingName
    ? `Hi ${escapeDigestHtml(params.greetingName)},`
    : "Hi,";

  const summaryHtml = params.summary
    ? `<div style="white-space: pre-wrap; color: #1a1a1a; margin: 16px 0;">${escapeDigestHtml(
        params.summary,
      )}</div>`
    : "";

  const sectionsHtml = params.sections
    .map(
      (s) => `
    <h3 style="margin: 24px 0 8px; color: #1a1a1a;">${escapeDigestHtml(s.category)}</h3>
    <ul style="margin: 0; padding-left: 20px; color: #1a1a1a;">
      ${s.items.map((i) => `<li style="margin: 4px 0;">${escapeDigestHtml(i)}</li>`).join("")}
    </ul>`,
    )
    .join("");

  const htmlBody = `
<!DOCTYPE html>
<html lang="en">
  <body style="margin: 0; padding: 24px; font-family: Arial, Helvetica, sans-serif; color: #1a1a1a; line-height: 1.6; background-color: #f9fafb;">
    <h2 style="color: ${EMAIL_BRAND_COLOR}; margin: 0 0 8px;">${escapeDigestHtml(
      params.subject,
    )}</h2>
    <p style="margin: 0 0 8px;">${greeting}</p>
    ${summaryHtml}
    ${sectionsHtml}
    <p style="color: ${EMAIL_BRAND_COLOR}; margin-top: 24px;">— The ${appName} team</p>
    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
    <p style="font-size: 12px; color: #6b7280;">
      You received this because you're on a list in our CRM.
      <a href="${params.unsubscribeUrl}" style="color: #6b7280;">Unsubscribe</a>.
    </p>
  </body>
</html>`;

  const textBody = `${params.subject}

${params.greetingName ? `Hi ${params.greetingName},` : "Hi,"}

${params.summary}

${params.sections
  .map((s) => `${s.category}\n${s.items.map((i) => `- ${i}`).join("\n")}`)
  .join("\n\n")}

— The ${appName} team

Unsubscribe: ${params.unsubscribeUrl}`;

  await sendEmail({
    to: params.to,
    subject: params.subject,
    htmlBody,
    textBody,
    workspaceId: params.workspaceId,
  });

  return { subject: params.subject, htmlBody, textBody };
}

/**
 * Build a Workspace update email: the approved update's already-sanitized HTML
 * (rendered from the approval snapshot by the shared document schema and the
 * published-Page sanitizer), framed with the workspace name, a "read on the
 * web" link when the update is public, and the mandatory one-click
 * unsubscribe. Colours come from the design tokens. Pure, so the framing and
 * escaping are unit-testable without a Postmark stub.
 */
export function buildWorkspaceUpdateEmail(params: {
  subject: string;
  /** Sanitized HTML of the approved body. */
  bodyHtml: string;
  /** Plain-text fallback (the approved Markdown). */
  bodyText: string;
  workspaceName: string;
  unsubscribeUrl: string;
  webUrl?: string | null;
  greetingName?: string | null;
}): { subject: string; htmlBody: string; textBody: string } {
  const t = colorTokens.light;
  const greeting = params.greetingName ? `Hi ${escapeDigestHtml(params.greetingName)},` : "Hi,";
  const webLink = params.webUrl
    ? `<p style="margin: 0 0 16px; font-size: 13px;"><a href="${escapeEmailAttr(params.webUrl)}" style="color: ${EMAIL_BRAND_COLOR};">Read this update on the web</a></p>`
    : "";

  const htmlBody = `
<!DOCTYPE html>
<html lang="en">
  <body style="margin: 0; padding: 24px; font-family: Arial, Helvetica, sans-serif; color: ${t.text.primary}; line-height: 1.6; background-color: ${t.background.secondary};">
    <div style="max-width: 640px; margin: 0 auto; background-color: ${t.background.primary}; border: 1px solid ${t.border.primary}; border-radius: 8px; padding: 24px;">
      <p style="margin: 0 0 4px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; color: ${t.text.muted};">${escapeDigestHtml(params.workspaceName)} update</p>
      <h1 style="margin: 0 0 16px; font-size: 22px; color: ${t.text.primary};">${escapeDigestHtml(params.subject)}</h1>
      <p style="margin: 0 0 8px;">${greeting}</p>
      ${webLink}
      <div>${params.bodyHtml}</div>
      <hr style="border: none; border-top: 1px solid ${t.border.primary}; margin: 24px 0;" />
      <p style="font-size: 12px; color: ${t.text.muted};">
        You are receiving this because you subscribed to updates from ${escapeDigestHtml(params.workspaceName)}.
        <a href="${escapeEmailAttr(params.unsubscribeUrl)}" style="color: ${t.text.muted};">Unsubscribe</a>.
      </p>
    </div>
  </body>
</html>`;

  const textBody = `${params.subject}

${params.greetingName ? `Hi ${params.greetingName},` : "Hi,"}
${params.webUrl ? `\nRead on the web: ${params.webUrl}\n` : ""}
${params.bodyText}

—
You are receiving this because you subscribed to updates from ${params.workspaceName}.
Unsubscribe: ${params.unsubscribeUrl}`;

  return { subject: params.subject, htmlBody, textBody };
}

/** Render + send a Workspace update email; returns what was sent for the CRM log. */
export async function sendWorkspaceUpdateEmail(
  params: Parameters<typeof buildWorkspaceUpdateEmail>[0] & { to: string; workspaceId?: string },
): Promise<{ subject: string; htmlBody: string; textBody: string }> {
  const rendered = buildWorkspaceUpdateEmail(params);
  await sendEmail({
    to: params.to,
    subject: rendered.subject,
    htmlBody: rendered.htmlBody,
    textBody: rendered.textBody,
    workspaceId: params.workspaceId,
  });
  return rendered;
}

/**
 * The double-opt-in email for a workspace's update newsletter: one button that
 * confirms the signup. Says plainly what happens if they ignore it, since the
 * address was typed by whoever filled the form, not necessarily its owner.
 */
export function buildUpdateSubscribeConfirmEmail(params: {
  workspaceName: string;
  confirmUrl: string;
}): { subject: string; htmlBody: string; textBody: string } {
  const t = colorTokens.light;
  const name = escapeDigestHtml(params.workspaceName);
  const url = escapeEmailAttr(params.confirmUrl);
  const subject = `Confirm your subscription to ${params.workspaceName} updates`;

  const htmlBody = `
<!DOCTYPE html>
<html lang="en">
  <body style="margin: 0; padding: 24px; font-family: Arial, Helvetica, sans-serif; color: ${t.text.primary}; line-height: 1.6; background-color: ${t.background.secondary};">
    <div style="max-width: 560px; margin: 0 auto; background-color: ${t.background.primary}; border: 1px solid ${t.border.primary}; border-radius: 8px; padding: 24px;">
      <h1 style="margin: 0 0 16px; font-size: 20px; color: ${t.text.primary};">Confirm your subscription</h1>
      <p style="margin: 0 0 16px;">Someone, hopefully you, asked to get ${name} updates at this address. Confirm and you'll get a short update when there's news.</p>
      <p style="margin: 0 0 24px;"><a href="${url}" style="display: inline-block; padding: 10px 18px; background-color: ${EMAIL_BRAND_COLOR}; color: ${t.background.primary}; text-decoration: none; border-radius: 6px; font-weight: bold;">Confirm subscription</a></p>
      <p style="margin: 0; font-size: 12px; color: ${t.text.muted};">If you didn't ask for this, ignore this email and you won't be subscribed. The link expires in 7 days.</p>
    </div>
  </body>
</html>`;

  const textBody = `Confirm your subscription

Someone, hopefully you, asked to get ${params.workspaceName} updates at this address. Confirm and you'll get a short update when there's news:

${params.confirmUrl}

If you didn't ask for this, ignore this email and you won't be subscribed. The link expires in 7 days.`;

  return { subject, htmlBody, textBody };
}

export async function sendUpdateSubscribeConfirmEmail(params: {
  to: string;
  workspaceName: string;
  confirmUrl: string;
  workspaceId?: string;
}): Promise<void> {
  const rendered = buildUpdateSubscribeConfirmEmail(params);
  await sendEmail({
    to: params.to,
    subject: rendered.subject,
    htmlBody: rendered.htmlBody,
    textBody: rendered.textBody,
    workspaceId: params.workspaceId,
  });
}

/**
 * Send a meeting invite (or cancellation) with the iCalendar payload as a
 * Postmark attachment. The .ics IS the write path to the attendee's real
 * calendar — Outlook and Gmail render METHOD:REQUEST natively with
 * Accept/Decline, and METHOD:CANCEL against the same UID removes it.
 */
export async function sendMeetingInviteEmail(params: {
  to: string;
  method: "REQUEST" | "CANCEL";
  meetingTitle: string;
  organizerName: string;
  startsAt: Date;
  endsAt: Date;
  location?: string | null;
  icsContent: string;
  workspaceId?: string;
}): Promise<void> {
  const { to, method, meetingTitle, organizerName, startsAt, endsAt, location, icsContent, workspaceId } = params;

  const cancelled = method === "CANCEL";
  const subject = cancelled
    ? `Cancelled: ${meetingTitle}`
    : `Invitation: ${meetingTitle}`;
  const when = `${startsAt.toUTCString()} – ${endsAt.toUTCString()}`;

  const textBody = [
    cancelled
      ? `${organizerName} cancelled the meeting "${meetingTitle}".`
      : `${organizerName} invited you to "${meetingTitle}".`,
    ``,
    `When: ${when}`,
    ...(location ? [`Where: ${location}`] : []),
    ``,
    cancelled
      ? `The attached calendar file removes the event from your calendar.`
      : `Open the attached calendar file or use your mail client's Accept/Decline buttons to respond.`,
  ].join("\n");

  const htmlBody = `
    <div style="font-family: sans-serif; max-width: 560px;">
      <h2 style="color: ${EMAIL_BRAND_COLOR};">${cancelled ? "Meeting cancelled" : "Meeting invitation"}</h2>
      <p>${organizerName} ${cancelled ? "cancelled" : "invited you to"} <strong>${meetingTitle}</strong>.</p>
      <p><strong>When:</strong> ${when}</p>
      ${location ? `<p><strong>Where:</strong> ${location}</p>` : ""}
      <p style="color: #4b5563;">${
        cancelled
          ? "The attached calendar file removes the event from your calendar."
          : "Your mail client should offer Accept / Decline directly; otherwise open the attached invite."
      }</p>
    </div>
  `;

  await sendEmail({
    to,
    subject,
    htmlBody,
    textBody,
    workspaceId,
    attachments: [
      {
        Name: "invite.ics",
        Content: Buffer.from(icsContent, "utf8").toString("base64"),
        ContentType: `text/calendar; charset=utf-8; method=${method}`,
      },
    ],
  });
}

export const EmailService = {
  sendSignInCodeEmail,
  sendWelcomeWithSignInCodeEmail,
  sendFirstLoginWelcomeEmail,
  sendTeamInvitationEmail,
  sendWorkspaceMemberAddedEmail,
  sendAssignmentNotificationEmail,
  sendMentionNotificationEmail,
  sendCrmOnboardingWelcomeEmail,
  sendCrmAutomationEmail,
  sendBroadcastDigestEmail,
  sendWorkspaceUpdateEmail,
  sendUpdateSubscribeConfirmEmail,
  sendMeetingInviteEmail,
};
