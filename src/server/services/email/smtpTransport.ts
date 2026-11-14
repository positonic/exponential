/**
 * Plain-SMTP delivery for `sendEmail`, the instance-level alternative to
 * Postmark on installs that have an SMTP server but no Postmark account.
 *
 * nodemailer is loaded with a dynamic `import()`, only here and only outside
 * the Edge runtime, never at the top of EmailService: `src/server/auth/config.ts`
 * imports EmailService, `middleware.ts` pulls that config into the Edge bundle,
 * and nodemailer needs Node's `net` and `tls`. Keep it that way.
 */

import type { SignInEnv } from "~/server/auth/signInMethods";

export interface SmtpSettings {
  host: string;
  port: number;
  /** Implicit TLS. STARTTLS is still negotiated when false and the server offers it. */
  secure: boolean;
  user?: string;
  password?: string;
  /** The sender. Never defaults to exponential.im. */
  from: string;
}

/** A Postmark-shaped attachment (base64 content), as `sendEmail` carries them. */
export interface SmtpAttachment {
  Name: string;
  Content: string;
  ContentType: string;
}

export interface SmtpMessage {
  to: string;
  subject: string;
  htmlBody: string;
  textBody: string;
  attachments?: SmtpAttachment[];
}

/**
 * SMTP settings from the environment, or null when SMTP isn't usable: no
 * `SMTP_HOST`, or no sender (`EMAIL_FROM ?? AUTH_POSTMARK_FROM`). `SMTP_PORT`
 * defaults to 587 (an invalid port makes SMTP unusable); `SMTP_SECURE`
 * ("true"/"1" or "false"/"0") defaults to true only on port 465.
 */
export function resolveSmtpSettings(env: SignInEnv): SmtpSettings | null {
  const host = nonEmpty(env.SMTP_HOST);
  const from = nonEmpty(env.EMAIL_FROM) ?? nonEmpty(env.AUTH_POSTMARK_FROM);
  if (!host || !from) return null;

  const portSetting = nonEmpty(env.SMTP_PORT);
  // env.js rejects a non-numeric SMTP_PORT at startup; this guards callers
  // that skip validation, so nodemailer never gets NaN.
  const parsedPort = portSetting ? Number(portSetting) : 587;
  if (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535) return null;
  const port = parsedPort;
  const secureSetting = nonEmpty(env.SMTP_SECURE);
  // "1"/"0" too, like the other env flags (AUTH_LOG_SIGN_IN_CODES).
  const secure = secureSetting ? secureSetting === "true" || secureSetting === "1" : port === 465;

  return {
    host,
    port,
    secure,
    user: nonEmpty(env.SMTP_USER),
    password: nonEmpty(env.SMTP_PASSWORD),
    from,
  };
}

/** Unset and empty alike, matching t3-env's `emptyStringAsUndefined`. */
function nonEmpty(value: string | undefined): string | undefined {
  return value && value.length > 0 ? value : undefined;
}

export async function sendSmtpEmail(settings: SmtpSettings, message: SmtpMessage): Promise<void> {
  // A dynamic import alone is not enough: webpack still inlines the module into
  // the Edge middleware bundle. Next defines NEXT_RUNTIME per compile, so in
  // the Edge build the test below is a constant and webpack drops the import
  // branch, with nodemailer, before bundling. (It has to be the branch of a
  // conditional: an early `throw` doesn't stop webpack collecting the import.)
  // Nothing sends email from middleware anyway.
  const nodemailer =
    process.env.NEXT_RUNTIME === "edge" ? null : (await import("nodemailer")).default;
  if (!nodemailer) {
    throw new Error("SMTP email cannot be sent from the Edge runtime");
  }
  const transport = nodemailer.createTransport({
    host: settings.host,
    port: settings.port,
    secure: settings.secure,
    ...(settings.user ? { auth: { user: settings.user, pass: settings.password ?? "" } } : {}),
  });

  await transport.sendMail({
    from: settings.from,
    to: message.to,
    subject: message.subject,
    html: message.htmlBody,
    text: message.textBody,
    ...(message.attachments && message.attachments.length > 0
      ? {
          attachments: message.attachments.map((attachment) => ({
            filename: attachment.Name,
            content: Buffer.from(attachment.Content, "base64"),
            contentType: attachment.ContentType,
          })),
        }
      : {}),
  });
}
