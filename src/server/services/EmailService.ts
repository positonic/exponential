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
      Subject: subject,
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
 * Generate the welcome email HTML content (shared between magic link and OAuth flows)
 */
function generateWelcomeEmailContent(options: {
  brandColor: string;
  appName: string;
  appUrl: string;
  ctaUrl: string;
  ctaText: string;
  showExpiration?: boolean;
  greeting: string;
  /**
   * When set, the email shows a **Sign-in code** to type instead of a button to
   * click (ADR-0056). Used for the email sign-up path, where a link would be
   * spent by the recipient's mail scanner before they ever saw it. The OAuth
   * welcome keeps its button — those users are already signed in.
   */
  signInCode?: string;
}): { htmlBody: string; textBody: string } {
  const { brandColor, appName, appUrl, ctaUrl, ctaText, showExpiration, greeting, signInCode } = options;
  const dailyPlannerUrl = `${appUrl}/daily-plan`;

  const actionBlockHtml = signInCode
    ? `
              <!-- Sign-in code -->
              <!-- The lead-in is not decoration: without it the code lands bare
                   under a paragraph about Daily Planning, and the HTML body is
                   what most recipients actually read. Keep it saying the same
                   thing as \`actionBlockText\` below. -->
              <p style="margin: 0 0 8px; font-size: 15px; line-height: 1.6; color: #4b5563;">
                ${ctaText} — enter this code on the sign-in page:
              </p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center" style="padding: 8px 0 24px;">
                    <div style="display: inline-block; padding: 16px 32px; background-color: #f3f4f6; border: 1px solid #e5e7eb; border-radius: 6px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 28px; font-weight: 600; letter-spacing: 4px; color: #111827;">
                      ${formatSignInCode(signInCode)}
                    </div>
                  </td>
                </tr>
              </table>`
    : `
              <!-- CTA Button -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center" style="padding: 8px 0 24px;">
                    <a href="${ctaUrl}" target="_blank" style="display: inline-block; padding: 14px 32px; background-color: ${brandColor}; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 600; border-radius: 6px;">
                      ${ctaText}
                    </a>
                  </td>
                </tr>
              </table>`;

  const expirationNotice = signInCode
    ? `This sign-in code expires in ${SIGN_IN_CODE_TTL_MINUTES} minutes.`
    : "This sign-in link expires in 24 hours.";

  const actionBlockText = signInCode
    ? `${ctaText} — enter this code on the sign-in page:\n\n${formatSignInCode(signInCode)}`
    : `${ctaText}: ${ctaUrl}`;

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
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 560px; background-color: #ffffff; border-radius: 8px; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 32px 32px 24px; text-align: center;">
              <h1 style="margin: 0; font-size: 22px; font-weight: 600; color: #111827;">
                Welcome to ${appName}
              </h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 0 32px;">
              <p style="margin: 0 0 16px; font-size: 15px; line-height: 1.6; color: #4b5563;">
                ${greeting}
              </p>
              <p style="margin: 0 0 16px; font-size: 15px; line-height: 1.6; color: #4b5563;">
                Thanks for signing up for ${appName}.
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
              <p style="margin: 0 0 24px; font-size: 15px; line-height: 1.6; color: #4b5563;">
                Open ${appName} and go through <a href="${dailyPlannerUrl}" style="color: ${brandColor}; text-decoration: none;">Daily Planning</a>. In a few minutes, you'll connect your day's work to actual outcomes—not just tasks to check off.
              </p>

              ${actionBlockHtml}

              ${showExpiration ? `
              <!-- Expiration Notice -->
              <p style="margin: 0 0 24px; padding: 12px 16px; background-color: #fef3c7; border-radius: 6px; font-size: 13px; color: #92400e;">
                ${expirationNotice}
              </p>
              ` : ''}

              <!-- After that section -->
              <div style="padding: 20px; background-color: #f3f4f6; border-radius: 6px; margin-bottom: 24px;">
                <p style="margin: 0 0 12px; font-size: 14px; font-weight: 600; color: #374151;">
                  After that, if you want to go deeper:
                </p>
                <ul style="margin: 0; padding-left: 20px; font-size: 14px; line-height: 1.8; color: #4b5563;">
                  <li><strong>Let AI handle your task layer.</strong> Connect a meeting, voice note, or Slack thread. Watch it become actions automatically.</li>
                  <li><strong>Set outcomes, not tasks.</strong> What result do you want this week? ${appName} works backward from there.</li>
                  <li><strong>Run a weekly plan.</strong> Five minutes to see which projects are healthy and which need attention.</li>
                  <li><strong>Connect your tools.</strong> Slack, Notion, GitHub, Google Calendar. One workspace instead of six browser tabs.</li>
                </ul>
              </div>

              <!-- What it won't do -->
              <p style="margin: 0 0 8px; font-size: 15px; font-weight: 600; color: #111827;">
                What ${appName} won't do:
              </p>
              <p style="margin: 0 0 16px; font-size: 15px; line-height: 1.6; color: #4b5563;">
                It won't magically organize your life while you scroll Twitter. You'll need to show up once a day, look at what matters, and decide what to focus on.
              </p>
              <p style="margin: 0 0 24px; font-size: 15px; line-height: 1.6; color: #4b5563;">
                The AI handles execution. You handle intent. That's the deal.
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
Welcome to ${appName}

${greeting}

Thanks for signing up for ${appName}.

I'm not going to pretend you need to watch 12 tutorial videos and set up the "perfect workflow" before you can use it. That's procrastination dressed up as productivity.

HERE'S WHAT ACTUALLY MATTERS:

${appName} isn't a to-do list. It's a coordination layer for AI-first teams. The difference is simple: to-do lists help you track what you're doing. ${appName} helps humans and AI work toward what actually matters.

TODAY, DO ONE THING:

Open ${appName} and go through Daily Planning (${dailyPlannerUrl}). In a few minutes, you'll connect your day's work to actual outcomes—not just tasks to check off.

${actionBlockText}
${showExpiration ? `\n${expirationNotice}\n` : ''}
---

AFTER THAT, IF YOU WANT TO GO DEEPER:

• Let AI handle your task layer. Connect a meeting, voice note, or Slack thread. Watch it become actions automatically.

• Set outcomes, not tasks. What result do you want this week? ${appName} works backward from there.

• Run a weekly plan. Five minutes to see which projects are healthy and which need attention.

• Connect your tools. Slack, Notion, GitHub, Google Calendar. One workspace instead of six browser tabs.

---

WHAT ${appName.toUpperCase()} WON'T DO:

It won't magically organize your life while you scroll Twitter. You'll need to show up once a day, look at what matters, and decide what to focus on.

The AI handles execution. You handle intent. That's the deal.

---

I'll check in with ideas on getting the most from ${appName}. Reply anytime—I read everything.

— James
`.trim();

  return { htmlBody, textBody };
}

/**
 * Send the welcome email with an embedded **Sign-in code** (for new users
 * signing up via email). Carries a code rather than a link — see ADR-0056.
 */
export async function sendWelcomeWithSignInCodeEmail(
  email: string,
  code: string
): Promise<void> {
  const brandColor = EMAIL_BRAND_COLOR;
  const appName = PRODUCT_NAME;
  const appUrl = process.env.NEXTAUTH_URL ?? getPublicBaseUrlFromEnv();

  const { htmlBody, textBody } = generateWelcomeEmailContent({
    brandColor,
    appName,
    appUrl,
    ctaUrl: appUrl,
    ctaText: "Sign in & start planning",
    showExpiration: true,
    greeting: "Hi there,",
    signInCode: code,
  });

  await sendEmail({
    to: email,
    subject: `Welcome to ${appName} — here's the only thing you need to do`,
    htmlBody,
    textBody,
  });
}

/**
 * Send welcome email to new users (for OAuth sign-ups)
 */
export async function sendWelcomeEmail(
  email: string,
  name?: string | null,
  authProvider?: string
): Promise<void> {
  const brandColor = EMAIL_BRAND_COLOR;
  const appName = PRODUCT_NAME;
  const appUrl = process.env.NEXTAUTH_URL ?? getPublicBaseUrlFromEnv();
  const signInUrl = `${appUrl}/signin`;

  const greeting = name ? `Hi ${name},` : "Hi there,";

  // Determine CTA based on auth provider
  let ctaText = "Go to Dashboard";
  if (authProvider === "google") {
    ctaText = "Sign in with Google";
  } else if (authProvider === "discord") {
    ctaText = "Sign in with Discord";
  }

  const { htmlBody, textBody } = generateWelcomeEmailContent({
    brandColor,
    appName,
    appUrl,
    ctaUrl: signInUrl,
    ctaText,
    showExpiration: false,
    greeting,
  });

  await sendEmail({
    to: email,
    subject: `Welcome to ${appName} — here's the only thing you need to do`,
    htmlBody,
    textBody,
  });
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
                You're receiving this because email notifications are enabled for the <strong>${workspaceName}</strong> workspace.
              </p>
              <p style="margin: 0; font-size: 12px; color: #9ca3af;">
                <a href="${personalSettingsUrl}" style="color: #6b7280; text-decoration: underline;">Manage your notification preferences</a>
                &nbsp;&middot;&nbsp;
                <a href="${workspaceSettingsUrl}" style="color: #6b7280; text-decoration: underline;">Workspace notification settings</a>
              </p>
            </td>
          </tr>`;

  const text = `---
You're receiving this because email notifications are enabled for the ${workspaceName} workspace.
Manage your notification preferences: ${personalSettingsUrl}
Workspace notification settings: ${workspaceSettingsUrl}`;

  return { html, text };
}

/**
 * Send email notification when a user is assigned to an action
 */
export async function sendAssignmentNotificationEmail(params: {
  to: string;
  assigneeName: string;
  assignerName: string;
  actionName: string;
  actionUrl: string;
  workspaceName: string;
  personalSettingsUrl: string;
  workspaceSettingsUrl: string;
  workspaceId?: string;
}): Promise<void> {
  const { to, assigneeName, assignerName, actionName, actionUrl, workspaceName, personalSettingsUrl, workspaceSettingsUrl, workspaceId } = params;
  const brandColor = EMAIL_BRAND_COLOR;
  const appName = PRODUCT_NAME;
  const footer = generateNotificationFooter({ workspaceName, personalSettingsUrl, workspaceSettingsUrl });
  const greeting = assigneeName ? `Hi ${assigneeName},` : "Hi there,";

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
                ${greeting}
              </p>
              <p style="margin: 0 0 24px; font-size: 15px; line-height: 1.6; color: #4b5563;">
                <strong>${assignerName}</strong> assigned you to <strong>${actionName}</strong> in ${workspaceName}.
              </p>

              <!-- CTA Button -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center" style="padding: 8px 0 24px;">
                    <a href="${actionUrl}" target="_blank" style="display: inline-block; padding: 14px 32px; background-color: ${brandColor}; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 600; border-radius: 6px;">
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
                ${actionUrl}
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

  await sendEmail({
    to,
    subject: `[${appName}] You've been assigned to: ${actionName}`,
    htmlBody,
    textBody,
    workspaceId,
  });
}

/**
 * Generic, category-agnostic notification email used by the unified dispatch
 * Email channel (ADR-0045). Renders a title, a message line, and an optional CTA
 * button; includes the workspace footer when workspace context is supplied.
 */
export async function sendNotificationEmail(params: {
  to: string;
  title: string;
  message: string;
  actionUrl?: string;
  workspaceName?: string;
  personalSettingsUrl?: string;
  workspaceSettingsUrl?: string;
  workspaceId?: string;
}): Promise<void> {
  const {
    to,
    title,
    message,
    actionUrl,
    workspaceName,
    personalSettingsUrl,
    workspaceSettingsUrl,
    workspaceId,
  } = params;
  const brandColor = EMAIL_BRAND_COLOR;
  const appName = PRODUCT_NAME;

  const footer =
    workspaceName && personalSettingsUrl && workspaceSettingsUrl
      ? generateNotificationFooter({ workspaceName, personalSettingsUrl, workspaceSettingsUrl })
      : { html: "", text: "" };

  const ctaHtml = actionUrl
    ? `
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center" style="padding: 8px 0 24px;">
                    <a href="${actionUrl}" target="_blank" style="display: inline-block; padding: 14px 32px; background-color: ${brandColor}; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 600; border-radius: 6px;">
                      View in ${appName}
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 0 0 8px; font-size: 13px; color: #6b7280;">
                Or copy and paste this link into your browser:
              </p>
              <p style="margin: 0 0 24px; font-size: 12px; color: #9ca3af; word-break: break-all;">
                ${actionUrl}
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
  <title>${title}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f9fafb;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="min-width: 100%; background-color: #f9fafb;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 480px; background-color: #ffffff; border-radius: 8px; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);">
          <tr>
            <td style="padding: 32px 32px 24px; text-align: center;">
              <h1 style="margin: 0; font-size: 20px; font-weight: 600; color: #111827;">
                ${title}
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 32px;">
              <p style="margin: 0 0 24px; font-size: 15px; line-height: 1.6; color: #4b5563;">
                ${message}
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

  await sendEmail({
    to,
    subject: `[${appName}] ${title}`,
    htmlBody,
    textBody,
    workspaceId,
  });
}

/**
 * Send email notification when a user is mentioned in a comment
 */
export async function sendMentionNotificationEmail(params: {
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
}): Promise<void> {
  const { to, mentionedName, authorName, actionName, commentPreview, actionUrl, workspaceName, personalSettingsUrl, workspaceSettingsUrl, workspaceId } = params;
  const brandColor = EMAIL_BRAND_COLOR;
  const appName = PRODUCT_NAME;
  const footer = generateNotificationFooter({ workspaceName, personalSettingsUrl, workspaceSettingsUrl });
  const greeting = mentionedName ? `Hi ${mentionedName},` : "Hi there,";

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
                ${greeting}
              </p>
              <p style="margin: 0 0 16px; font-size: 15px; line-height: 1.6; color: #4b5563;">
                <strong>${authorName}</strong> mentioned you in a comment on <strong>${actionName}</strong>:
              </p>

              <!-- Comment Preview -->
              <div style="margin: 0 0 24px; padding: 12px 16px; background-color: #f3f4f6; border-left: 3px solid ${brandColor}; border-radius: 0 6px 6px 0;">
                <p style="margin: 0; font-size: 14px; line-height: 1.6; color: #4b5563; font-style: italic;">
                  "${commentPreview}"
                </p>
              </div>

              <!-- CTA Button -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center" style="padding: 8px 0 24px;">
                    <a href="${actionUrl}" target="_blank" style="display: inline-block; padding: 14px 32px; background-color: ${brandColor}; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 600; border-radius: 6px;">
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
                ${actionUrl}
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

  await sendEmail({
    to,
    subject: `[${appName}] ${authorName} mentioned you in: ${actionName}`,
    htmlBody,
    textBody,
    workspaceId,
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
  sendWelcomeEmail,
  sendWelcomeWithSignInCodeEmail,
  sendTeamInvitationEmail,
  sendWorkspaceMemberAddedEmail,
  sendAssignmentNotificationEmail,
  sendMentionNotificationEmail,
  sendCrmOnboardingWelcomeEmail,
  sendCrmAutomationEmail,
  sendBroadcastDigestEmail,
  sendMeetingInviteEmail,
};
