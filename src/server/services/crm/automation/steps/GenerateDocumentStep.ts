import { type PrismaClient } from "@prisma/client";

import {
  type IStepExecutor,
  type StepContext,
} from "~/server/services/workflows/steps/IStepExecutor";
import { loadAgreementTemplate } from "../agreementTemplates";
import { renderTemplate } from "../templateRenderer";
import {
  buildContactTemplateData,
  renderInline,
  renderTextBodyToHtml,
  wrapAgreementHtml,
} from "../contentRendering";

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

    const data = buildContactTemplateData(contact, customerType, new Date());

    // User-authored agreement body from the builder (config) overrides the
    // built-in per-type HTML template; an empty body falls back to the default.
    const customBody =
      typeof config.body === "string" && config.body.trim()
        ? config.body
        : null;

    let html: string;
    if (customBody) {
      const title =
        typeof config.title === "string" && config.title.trim()
          ? renderInline(config.title, data)
          : `${customerType} Agreement`;
      html = wrapAgreementHtml(title, renderTextBodyToHtml(customBody, data));
    } else {
      const template = loadAgreementTemplate(customerType);
      const rendered = renderTemplate(template, data);
      html = rendered.html;
      if (rendered.missingVariables.length > 0) {
        console.warn(
          `[generate_document] contact ${contactId}: missing template variables: ${rendered.missingVariables.join(", ")}`,
        );
      }
    }

    return {
      agreementHtml: html,
      agreementCustomerType: customerType,
    };
  }
}
