import { type PrismaClient } from "@prisma/client";

import {
  type IStepExecutor,
  type StepContext,
} from "~/server/services/workflows/steps/IStepExecutor";
import { EmailService } from "~/server/services/EmailService";
import { encryptString, decryptBuffer } from "~/server/utils/encryption";
import {
  buildContactTemplateData,
  renderInline,
  renderTextBodyToHtml,
  renderTextBodyToPlain,
} from "../contentRendering";

/**
 * `send_email` step — sends the branded onboarding **welcome** email to the
 * contact and logs it as a `CrmCommunication` (CONTEXT.md → Recipient email
 * experience). This is OUR welcome note only; Adobe Sign sends the separate
 * "review & sign" email in the `send_for_signature` step.
 */
export class SendEmailStep implements IStepExecutor {
  type = "send_email";
  label = "Send welcome email";

  constructor(private db: PrismaClient) {}

  async execute(
    input: Record<string, unknown>,
    config: Record<string, unknown>,
    context: StepContext,
  ): Promise<Record<string, unknown>> {
    const contactId =
      typeof input.contactId === "string" ? input.contactId : undefined;
    const customerType =
      (typeof input.customerType === "string" ? input.customerType : undefined) ??
      (typeof config.customerType === "string" ? config.customerType : undefined);

    if (!contactId) {
      throw new Error("send_email: missing contactId in input");
    }
    if (!customerType) {
      throw new Error("send_email: missing customerType");
    }

    const contact = await this.db.crmContact.findUnique({
      where: { id: contactId },
      include: { organization: { select: { name: true } } },
    });
    if (!contact) {
      throw new Error(`send_email: contact ${contactId} not found`);
    }

    const toEmail = decryptBuffer(contact.email);
    if (!toEmail) {
      throw new Error(
        `send_email: contact ${contactId} has no email address`,
      );
    }

    const name =
      [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim() ||
      null;

    // User-authored content from the builder (config) overrides the built-in
    // welcome template; an empty body falls back to the default.
    const customBody =
      typeof config.body === "string" && config.body.trim()
        ? config.body
        : null;
    const customSubject =
      typeof config.subject === "string" && config.subject.trim()
        ? config.subject
        : null;

    let subject: string;
    let htmlBody: string;
    let textBody: string;

    if (customBody) {
      const data = buildContactTemplateData(contact, customerType, new Date());
      const rendered = await EmailService.sendCrmAutomationEmail({
        to: toEmail,
        subject: customSubject
          ? renderInline(customSubject, data)
          : `Welcome — you're signed up as a ${customerType}`,
        bodyHtml: renderTextBodyToHtml(customBody, data),
        bodyText: renderTextBodyToPlain(customBody, data),
      });
      subject = rendered.subject;
      htmlBody = rendered.htmlBody;
      textBody = rendered.textBody;
    } else {
      const rendered = await EmailService.sendCrmOnboardingWelcomeEmail({
        to: toEmail,
        name,
        customerType,
      });
      subject = rendered.subject;
      htmlBody = rendered.htmlBody;
      textBody = rendered.textBody;
    }

    await this.db.crmCommunication.create({
      data: {
        contactId,
        workspaceId: context.workspaceId,
        type: "EMAIL",
        toEmail: encryptString(toEmail),
        subject,
        htmlContent: htmlBody,
        textContent: textBody,
        status: "SENT",
        sentAt: new Date(),
        agentGenerated: true,
        sourceType: "crm_automation",
        createdById: context.userId,
      },
    });

    // Do not return the plaintext email — keep PII out of run output JSON.
    return { welcomeEmailSent: true };
  }
}
