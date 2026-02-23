/**
 * Email Service for transactional emails via Postmark
 *
 * NOTE: This file uses hardcoded colors because email clients do not support
 * CSS variables. Inline styles with actual color values are required for
 * email compatibility across Gmail, Outlook, Apple Mail, etc.
 */

/* eslint-disable no-restricted-syntax */

const POSTMARK_API_URL = "https://api.postmarkapp.com/email";

interface SendEmailParams {
  to: string;
  subject: string;
  htmlBody: string;
  textBody: string;
}

async function sendEmail({ to, subject, htmlBody, textBody }: SendEmailParams): Promise<void> {
  const apiKey = process.env.AUTH_POSTMARK_KEY ?? process.env.POSTMARK_SERVER_TOKEN;
  const from = process.env.AUTH_POSTMARK_FROM ?? "noreply@exponential.im";

  if (!apiKey) {
    console.error(
      "[EmailService] Postmark API key not configured. Set AUTH_POSTMARK_KEY or POSTMARK_SERVER_TOKEN environment variable."
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
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error("[EmailService] Failed to send email:", error);
    throw new Error(`Failed to send email: ${error}`);
  }
}

/**
 * Send magic link sign-in email (for returning users)
 */
export async function sendMagicLinkEmail(
  email: string,
  url: string
): Promise<void> {
  const brandColor = "#5850EC";
  const appName = "Exponential";

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
                Click the button below to securely access your account.
              </p>

              <!-- CTA Button -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center" style="padding: 8px 0 24px;">
                    <a href="${url}" target="_blank" style="display: inline-block; padding: 14px 32px; background-color: ${brandColor}; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 600; border-radius: 6px;">
                      Sign In
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Fallback Link -->
              <p style="margin: 0 0 8px; font-size: 13px; color: #6b7280;">
                Or copy and paste this link into your browser:
              </p>
              <p style="margin: 0 0 24px; font-size: 12px; color: #9ca3af; word-break: break-all;">
                ${url}
              </p>

              <!-- Expiration Notice -->
              <p style="margin: 0; padding: 12px 16px; background-color: #f3f4f6; border-radius: 6px; font-size: 13px; color: #6b7280;">
                This link expires in 24 hours.
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

Click the link below to securely access your account:
${url}

This link expires in 24 hours.

Didn't request this? You can safely ignore this email.
`.trim();

  await sendEmail({
    to: email,
    subject: `Your sign-in link for ${appName}`,
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
}): { htmlBody: string; textBody: string } {
  const { brandColor, appName, appUrl, ctaUrl, ctaText, showExpiration, greeting } = options;
  const dailyPlannerUrl = `${appUrl}/daily-plan`;

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

              <!-- CTA Button -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center" style="padding: 8px 0 24px;">
                    <a href="${ctaUrl}" target="_blank" style="display: inline-block; padding: 14px 32px; background-color: ${brandColor}; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 600; border-radius: 6px;">
                      ${ctaText}
                    </a>
                  </td>
                </tr>
              </table>

              ${showExpiration ? `
              <!-- Expiration Notice -->
              <p style="margin: 0 0 24px; padding: 12px 16px; background-color: #fef3c7; border-radius: 6px; font-size: 13px; color: #92400e;">
                This sign-in link expires in 24 hours.
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
                  <li><strong>Run a weekly review.</strong> Five minutes to see which projects are healthy and which need attention.</li>
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

${ctaText}: ${ctaUrl}
${showExpiration ? '\nThis sign-in link expires in 24 hours.\n' : ''}
---

AFTER THAT, IF YOU WANT TO GO DEEPER:

• Let AI handle your task layer. Connect a meeting, voice note, or Slack thread. Watch it become actions automatically.

• Set outcomes, not tasks. What result do you want this week? ${appName} works backward from there.

• Run a weekly review. Five minutes to see which projects are healthy and which need attention.

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
 * Send welcome email with embedded magic link (for new users signing up via email)
 */
export async function sendWelcomeWithMagicLinkEmail(
  email: string,
  magicLinkUrl: string
): Promise<void> {
  const brandColor = "#5850EC";
  const appName = "Exponential";
  const appUrl = process.env.NEXTAUTH_URL ?? "https://exponential.im";

  const { htmlBody, textBody } = generateWelcomeEmailContent({
    brandColor,
    appName,
    appUrl,
    ctaUrl: magicLinkUrl,
    ctaText: "Sign In & Start Planning",
    showExpiration: true,
    greeting: "Hi there,",
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
  const brandColor = "#5850EC";
  const appName = "Exponential";
  const appUrl = process.env.NEXTAUTH_URL ?? "https://exponential.im";
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
 * Send team invitation email to invitee
 */
export async function sendTeamInvitationEmail(params: {
  to: string;
  teamName: string;
  inviterName: string;
  inviteUrl: string;
}): Promise<void> {
  const { to, teamName, inviterName, inviteUrl } = params;
  const brandColor = "#5850EC";
  const appName = "Exponential";

  const htmlBody = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>Join ${teamName} on ${appName}</title>
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
                You've been invited to join ${teamName}
              </h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 0 32px;">
              <p style="margin: 0 0 24px; font-size: 15px; line-height: 1.6; color: #4b5563;">
                <strong>${inviterName}</strong> has invited you to join <strong>${teamName}</strong> on ${appName}.
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
You've been invited to join ${teamName}

${inviterName} has invited you to join ${teamName} on ${appName}.

Accept the invitation: ${inviteUrl}

This invitation expires in 7 days.

If you weren't expecting this invitation, you can safely ignore this email.
`.trim();

  await sendEmail({
    to,
    subject: `You've been invited to join ${teamName} on ${appName}`,
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
}): Promise<void> {
  const { to, assigneeName, assignerName, actionName, actionUrl, workspaceName, personalSettingsUrl, workspaceSettingsUrl } = params;
  const brandColor = "#5850EC";
  const appName = "Exponential";
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
}): Promise<void> {
  const { to, mentionedName, authorName, actionName, commentPreview, actionUrl, workspaceName, personalSettingsUrl, workspaceSettingsUrl } = params;
  const brandColor = "#5850EC";
  const appName = "Exponential";
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
  });
}

export const EmailService = {
  sendMagicLinkEmail,
  sendWelcomeEmail,
  sendWelcomeWithMagicLinkEmail,
  sendTeamInvitationEmail,
  sendAssignmentNotificationEmail,
  sendMentionNotificationEmail,
};
