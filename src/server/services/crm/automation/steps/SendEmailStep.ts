import { type PrismaClient } from "@prisma/client";

import {
  type IStepExecutor,
  type StepContext,
} from "~/server/services/workflows/steps/IStepExecutor";
import { EmailService } from "~/server/services/EmailService";
import { encryptString, decryptBuffer } from "~/server/utils/encryption";

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

    const { subject, htmlBody, textBody } =
      await EmailService.sendCrmOnboardingWelcomeEmail({
        to: toEmail,
        name,
        customerType,
      });

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
