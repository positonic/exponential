/**
 * User Email Service — IMAP/SMTP integration for per-user email access.
 *
 * Each user connects their email (Gmail, Outlook, etc.) with an app password.
 * Credentials are stored encrypted in the Integration + IntegrationCredential tables.
 * This service handles reading (IMAP) and sending (SMTP) on behalf of the user.
 */

import { ImapFlow } from "imapflow";
import nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";
import { simpleParser } from "mailparser";
import { db } from "~/server/db";
import { decryptCredential } from "~/server/utils/credentialHelper";

// ==================== Types ====================

interface EmailCredentials {
  emailAddress: string;
  appPassword: string;
  imapHost: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
}

export interface EmailSummary {
  id: string;
  from: string;
  subject: string;
  snippet: string;
  date: string;
  isUnread: boolean;
}

export interface EmailFull {
  id: string;
  from: string;
  to: string;
  cc: string;
  subject: string;
  body: string;
  date: string;
  isUnread: boolean;
  attachments: { filename: string; contentType: string; size: number }[];
}

export interface SendEmailInput {
  to: string;
  cc?: string;
  subject: string;
  body: string;
  inReplyTo?: string;
  references?: string;
}

// ==================== Provider Detection ====================

const PROVIDER_SETTINGS: Record<
  string,
  { imapHost: string; imapPort: number; smtpHost: string; smtpPort: number }
> = {
  "gmail.com": {
    imapHost: "imap.gmail.com",
    imapPort: 993,
    smtpHost: "smtp.gmail.com",
    smtpPort: 587,
  },
  "googlemail.com": {
    imapHost: "imap.gmail.com",
    imapPort: 993,
    smtpHost: "smtp.gmail.com",
    smtpPort: 587,
  },
  "outlook.com": {
    imapHost: "outlook.office365.com",
    imapPort: 993,
    smtpHost: "smtp.office365.com",
    smtpPort: 587,
  },
  "hotmail.com": {
    imapHost: "outlook.office365.com",
    imapPort: 993,
    smtpHost: "smtp.office365.com",
    smtpPort: 587,
  },
  "live.com": {
    imapHost: "outlook.office365.com",
    imapPort: 993,
    smtpHost: "smtp.office365.com",
    smtpPort: 587,
  },
  "yahoo.com": {
    imapHost: "imap.mail.yahoo.com",
    imapPort: 993,
    smtpHost: "smtp.mail.yahoo.com",
    smtpPort: 587,
  },
};

/**
 * Detect IMAP/SMTP settings from email domain.
 * For Google Workspace custom domains, Gmail settings are used as default fallback.
 */
export function detectProviderSettings(email: string) {
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) return null;
  return PROVIDER_SETTINGS[domain] ?? null;
}

// ==================== UserEmailService ====================

export class UserEmailService {
  /**
   * Get decrypted email credentials for a user from the Integration table.
   */
  private async getUserCredentials(
    userId: string
  ): Promise<EmailCredentials | null> {
    const integration = await db.integration.findFirst({
      where: { userId, provider: "email", status: "ACTIVE" },
      include: { credentials: true },
    });

    if (!integration) return null;

    const creds = integration.credentials;
    const emailCred = creds.find((c) => c.keyType === "email_address");
    const passwordCred = creds.find((c) => c.keyType === "app_password");
    const imapHostCred = creds.find((c) => c.keyType === "imap_host");
    const smtpHostCred = creds.find((c) => c.keyType === "smtp_host");

    if (!emailCred || !passwordCred) return null;

    const appPassword = decryptCredential(
      passwordCred.key,
      passwordCred.isEncrypted
    );
    if (!appPassword) return null;

    // Detect settings from email domain if not explicitly stored
    const detected = detectProviderSettings(emailCred.key);

    return {
      emailAddress: emailCred.key,
      appPassword,
      imapHost: imapHostCred?.key ?? detected?.imapHost ?? "imap.gmail.com",
      imapPort: detected?.imapPort ?? 993,
      smtpHost: smtpHostCred?.key ?? detected?.smtpHost ?? "smtp.gmail.com",
      smtpPort: detected?.smtpPort ?? 587,
    };
  }

  /**
   * Create an IMAP client, connect, and return it.
   * Caller must call client.logout() when done.
   */
  private async connectImap(creds: EmailCredentials): Promise<ImapFlow> {
    const client = new ImapFlow({
      host: creds.imapHost,
      port: creds.imapPort,
      secure: true,
      auth: { user: creds.emailAddress, pass: creds.appPassword },
      logger: false,
    });
    await client.connect();
    return client;
  }

  /**
   * Create an SMTP transport for sending.
   */
  private createSmtpTransport(
    creds: EmailCredentials
  ): nodemailer.Transporter<SMTPTransport.SentMessageInfo> {
    return nodemailer.createTransport({
      host: creds.smtpHost,
      port: creds.smtpPort,
      secure: false,
      auth: { user: creds.emailAddress, pass: creds.appPassword },
    });
  }

  // ==================== Public Methods ====================

  /**
   * Check if user has email configured and test the connection.
   */
  async checkConnection(
    userId: string
  ): Promise<{ isConnected: boolean; email?: string; error?: string }> {
    const creds = await this.getUserCredentials(userId);
    if (!creds) {
      return { isConnected: false };
    }

    try {
      const client = await this.connectImap(creds);
      await client.logout();
      return { isConnected: true, email: creds.emailAddress };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Connection failed";
      return { isConnected: false, email: creds.emailAddress, error: message };
    }
  }

  /**
   * Get recent emails from inbox.
   */
  async getEmails(
    userId: string,
    options: {
      maxResults?: number;
      unreadOnly?: boolean;
      since?: string;
    } = {}
  ): Promise<{ emails: EmailSummary[] }> {
    const creds = await this.getUserCredentials(userId);
    if (!creds)
      throw new Error(
        "Email not configured. Please connect your email in Settings → Integrations."
      );

    const { maxResults = 10, unreadOnly = false, since } = options;
    const client = await this.connectImap(creds);

    try {
      const lock = await client.getMailboxLock("INBOX");
      try {
        // Build search criteria
        const searchCriteria: Record<string, unknown> = {};
        if (unreadOnly) searchCriteria.seen = false;
        if (since) searchCriteria.since = new Date(since);

        const searchResult = await client.search(
          Object.keys(searchCriteria).length > 0
            ? searchCriteria
            : { all: true },
          { uid: true }
        );
        const messageIds = Array.isArray(searchResult) ? searchResult : [];

        // Take the most recent N messages (highest UIDs = newest)
        const recentIds = messageIds.slice(-maxResults).reverse();

        if (recentIds.length === 0) {
          return { emails: [] };
        }

        const emails: EmailSummary[] = [];
        for await (const msg of client.fetch(recentIds, {
          uid: true,
          envelope: true,
          flags: true,
        })) {
          const from = msg.envelope?.from?.[0];
          const fromStr = from
            ? from.name
              ? `${from.name} <${from.address}>`
              : (from.address ?? "unknown")
            : "unknown";

          emails.push({
            id: String(msg.uid),
            from: fromStr,
            subject: msg.envelope?.subject ?? "(no subject)",
            snippet: "",
            date:
              msg.envelope?.date?.toISOString() ?? new Date().toISOString(),
            isUnread: !msg.flags?.has("\\Seen"),
          });
        }

        return { emails };
      } finally {
        lock.release();
      }
    } finally {
      await client.logout();
    }
  }

  /**
   * Get full email content by UID.
   */
  async getEmailById(
    userId: string,
    emailId: string
  ): Promise<{ email: EmailFull }> {
    const creds = await this.getUserCredentials(userId);
    if (!creds)
      throw new Error(
        "Email not configured. Please connect your email in Settings → Integrations."
      );

    const client = await this.connectImap(creds);

    try {
      const lock = await client.getMailboxLock("INBOX");
      try {
        const uid = Number(emailId);

        // Download the full message source
        const download = await client.download(String(uid), undefined, {
          uid: true,
        });
        const chunks: Buffer[] = [];
        for await (const chunk of download.content) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        const rawEmail = Buffer.concat(chunks);

        // Parse with mailparser
        const parsed = await simpleParser(rawEmail);

        // Extract plain text body (fallback to stripped HTML)
        let body = parsed.text ?? "";
        if (!body && parsed.html) {
          body = parsed.html
            .replace(/<[^>]*>/g, " ")
            .replace(/\s+/g, " ")
            .trim();
        }
        // Truncate
        const MAX_BODY_LENGTH = 5000;
        if (body.length > MAX_BODY_LENGTH) {
          body = body.substring(0, MAX_BODY_LENGTH) + "\n\n... [truncated]";
        }

        const from = parsed.from?.text ?? "unknown";
        const to = parsed.to
          ? Array.isArray(parsed.to)
            ? parsed.to.map((t) => t.text).join(", ")
            : parsed.to.text
          : "";
        const cc = parsed.cc
          ? Array.isArray(parsed.cc)
            ? parsed.cc.map((c) => c.text).join(", ")
            : parsed.cc.text
          : "";

        const attachments = (parsed.attachments ?? []).map((att) => ({
          filename: att.filename ?? "unnamed",
          contentType: att.contentType ?? "application/octet-stream",
          size: att.size ?? 0,
        }));

        // Mark as read
        await client.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true });

        return {
          email: {
            id: emailId,
            from,
            to,
            cc,
            subject: parsed.subject ?? "(no subject)",
            body,
            date: parsed.date?.toISOString() ?? new Date().toISOString(),
            isUnread: false, // We just marked it as read
            attachments,
          },
        };
      } finally {
        lock.release();
      }
    } finally {
      await client.logout();
    }
  }

  /**
   * Search emails by query string (searches subject, from, and body).
   */
  async searchEmails(
    userId: string,
    query: string,
    maxResults: number = 10
  ): Promise<{ emails: EmailSummary[] }> {
    const creds = await this.getUserCredentials(userId);
    if (!creds)
      throw new Error(
        "Email not configured. Please connect your email in Settings → Integrations."
      );

    const client = await this.connectImap(creds);

    try {
      const lock = await client.getMailboxLock("INBOX");
      try {
        const searchResult = await client.search(
          {
            or: [{ subject: query }, { from: query }, { body: query }],
          },
          { uid: true }
        );
        const messageIds = Array.isArray(searchResult) ? searchResult : [];

        const recentIds = messageIds.slice(-maxResults).reverse();

        if (recentIds.length === 0) {
          return { emails: [] };
        }

        const emails: EmailSummary[] = [];
        for await (const msg of client.fetch(recentIds, {
          uid: true,
          envelope: true,
          flags: true,
        })) {
          const from = msg.envelope?.from?.[0];
          const fromStr = from
            ? from.name
              ? `${from.name} <${from.address}>`
              : (from.address ?? "unknown")
            : "unknown";

          emails.push({
            id: String(msg.uid),
            from: fromStr,
            subject: msg.envelope?.subject ?? "(no subject)",
            snippet: "",
            date:
              msg.envelope?.date?.toISOString() ?? new Date().toISOString(),
            isUnread: !msg.flags?.has("\\Seen"),
          });
        }

        return { emails };
      } finally {
        lock.release();
      }
    } finally {
      await client.logout();
    }
  }

  /**
   * Send an email from the user's configured address.
   */
  async sendEmail(
    userId: string,
    input: SendEmailInput
  ): Promise<{ success: boolean; messageId: string }> {
    const creds = await this.getUserCredentials(userId);
    if (!creds)
      throw new Error(
        "Email not configured. Please connect your email in Settings → Integrations."
      );

    const transport = this.createSmtpTransport(creds);

    try {
      const mailOptions: nodemailer.SendMailOptions = {
        from: creds.emailAddress,
        to: input.to,
        cc: input.cc,
        subject: input.subject,
        text: input.body,
      };

      if (input.inReplyTo) {
        mailOptions.inReplyTo = input.inReplyTo;
        mailOptions.references = input.references ?? input.inReplyTo;
      }

      const result = await transport.sendMail(mailOptions);

      return {
        success: true,
        messageId: result.messageId ?? "",
      };
    } finally {
      transport.close();
    }
  }

  /**
   * Reply to a specific email by UID. Fetches original headers for threading.
   */
  async replyToEmail(
    userId: string,
    emailId: string,
    body: string
  ): Promise<{ success: boolean; messageId: string }> {
    const creds = await this.getUserCredentials(userId);
    if (!creds)
      throw new Error(
        "Email not configured. Please connect your email in Settings → Integrations."
      );

    const client = await this.connectImap(creds);

    let originalFrom = "";
    let originalSubject = "";
    let originalMessageId = "";

    try {
      const lock = await client.getMailboxLock("INBOX");
      try {
        const uid = Number(emailId);
        const download = await client.download(String(uid), undefined, {
          uid: true,
        });
        const chunks: Buffer[] = [];
        for await (const chunk of download.content) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        const rawEmail = Buffer.concat(chunks);
        const parsed = await simpleParser(rawEmail);

        originalFrom = parsed.from?.value?.[0]?.address ?? "";
        originalSubject = parsed.subject ?? "";
        originalMessageId = parsed.messageId ?? "";
      } finally {
        lock.release();
      }
    } finally {
      await client.logout();
    }

    if (!originalFrom) {
      throw new Error("Could not determine the original sender to reply to");
    }

    const replySubject = originalSubject.startsWith("Re:")
      ? originalSubject
      : `Re: ${originalSubject}`;

    return await this.sendEmail(userId, {
      to: originalFrom,
      subject: replySubject,
      body,
      inReplyTo: originalMessageId,
      references: originalMessageId,
    });
  }

  /**
   * Test IMAP connection with provided credentials (used during integration setup).
   */
  static async testConnection(creds: {
    emailAddress: string;
    appPassword: string;
    imapHost: string;
    imapPort: number;
  }): Promise<{ success: boolean; error?: string }> {
    const client = new ImapFlow({
      host: creds.imapHost,
      port: creds.imapPort,
      secure: true,
      auth: { user: creds.emailAddress, pass: creds.appPassword },
      logger: false,
    });

    try {
      await client.connect();
      await client.logout();
      return { success: true };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Connection failed";
      return { success: false, error: message };
    }
  }
}

// Singleton instance
export const userEmailService = new UserEmailService();
