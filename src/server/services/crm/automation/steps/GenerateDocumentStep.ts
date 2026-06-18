import { type PrismaClient } from "@prisma/client";

import {
  type IStepExecutor,
  type StepContext,
} from "~/server/services/workflows/steps/IStepExecutor";
import { loadAgreementTemplate } from "../agreementTemplates";
import { renderTemplate } from "../templateRenderer";

/**
 * `generate_document` step — renders the per-Customer-type **Agreement** HTML
 * from the contact's data (CONTEXT.md → CRM & Automations, ADR-0026). Returns
 * the rendered HTML in step output so the downstream `send_for_signature` step
 * can hand it to Adobe Sign.
 */
export class GenerateDocumentStep implements IStepExecutor {
  type = "generate_document";
  label = "Generate agreement document";

  constructor(private db: PrismaClient) {}

  async execute(
    input: Record<string, unknown>,
    config: Record<string, unknown>,
    _context: StepContext,
  ): Promise<Record<string, unknown>> {
    const contactId =
      typeof input.contactId === "string" ? input.contactId : undefined;
    const customerType =
      (typeof input.customerType === "string" ? input.customerType : undefined) ??
      (typeof config.customerType === "string" ? config.customerType : undefined);

    if (!contactId) {
      throw new Error("generate_document: missing contactId in input");
    }
    if (!customerType) {
      throw new Error("generate_document: missing customerType");
    }

    const contact = await this.db.crmContact.findUnique({
      where: { id: contactId },
      include: { organization: { select: { name: true } } },
    });
    if (!contact) {
      throw new Error(`generate_document: contact ${contactId} not found`);
    }

    const fullName =
      [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim() ||
      "there";

    const data: Record<string, string> = {
      firstName: contact.firstName ?? "",
      lastName: contact.lastName ?? "",
      fullName,
      customerType,
      companyName: contact.organization?.name ?? "",
      date: new Date().toISOString().slice(0, 10),
    };

    const template = loadAgreementTemplate(customerType);
    const { html, missingVariables } = renderTemplate(template, data);

    if (missingVariables.length > 0) {
      console.warn(
        `[generate_document] contact ${contactId}: missing template variables: ${missingVariables.join(", ")}`,
      );
    }

    return {
      agreementHtml: html,
      agreementCustomerType: customerType,
      agreementMissingVariables: missingVariables,
    };
  }
}
