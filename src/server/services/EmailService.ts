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
  const apiKey = process.env.POSTMARK_SERVER_TOKEN;
  const from = process.env.AUTH_POSTMARK_FROM ?? "noreply@exponential.im";

  if (!apiKey) {
    console.error("[EmailService] POSTMARK_SERVER_TOKEN is not configured");
    throw new Error("Email service not configured");
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
 * Send magic link sign-in email
 */
export async function sendMagicLinkEmail(
  email: string,
  url: string,
  _host: string
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
 * Send welcome email to new users
 */
export async function sendWelcomeEmail(
  email: string,
  name?: string | null
): Promise<void> {
  const brandColor = "#5850EC";
  const appName = "Exponential";
  const appUrl = process.env.NEXTAUTH_URL ?? "https://exponential.im";
  const dashboardUrl = `${appUrl}/home`;

  const greeting = name ? `Hi ${name},` : "Hi there,";

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
              <h1 style="margin: 0; font-size: 24px; font-weight: 600; color: #111827;">
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
                You're in—your account is ready.
              </p>
              <p style="margin: 0 0 24px; font-size: 15px; line-height: 1.6; color: #4b5563;">
                ${appName} helps you align your daily actions with meaningful goals. No more wondering if you're working on the right things.
              </p>

              <!-- CTA Button -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center" style="padding: 8px 0 24px;">
                    <a href="${dashboardUrl}" target="_blank" style="display: inline-block; padding: 14px 32px; background-color: ${brandColor}; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 600; border-radius: 6px;">
                      Go to Dashboard
                    </a>
                  </td>
                </tr>
              </table>

              <!-- First Action -->
              <div style="padding: 16px; background-color: #f3f4f6; border-radius: 6px; margin-bottom: 24px;">
                <p style="margin: 0 0 4px; font-size: 13px; font-weight: 600; color: #374151;">
                  One thing to do first:
                </p>
                <p style="margin: 0; font-size: 14px; color: #4b5563;">
                  Create your first goal. Everything else flows from there.
                </p>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 0 32px 32px;">
              <p style="margin: 0 0 16px; font-size: 14px; color: #6b7280; border-top: 1px solid #e5e7eb; padding-top: 24px;">
                Questions? Just reply to this email.
              </p>
              <p style="margin: 0; font-size: 14px; color: #374151;">
                — James, Founder
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

You're in—your account is ready.

${appName} helps you align your daily actions with meaningful goals. No more wondering if you're working on the right things.

Go to Dashboard: ${dashboardUrl}

One thing to do first:
Create your first goal. Everything else flows from there.

---

Questions? Just reply to this email.

— James, Founder
`.trim();

  await sendEmail({
    to: email,
    subject: `Welcome to ${appName}`,
    htmlBody,
    textBody,
  });
}

export const EmailService = {
  sendMagicLinkEmail,
  sendWelcomeEmail,
};
