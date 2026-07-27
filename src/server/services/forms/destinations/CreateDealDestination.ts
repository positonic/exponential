import { type PrismaClient } from "@prisma/client";

import { createCrmContact } from "~/server/services/crm/createCrmContact";
import {
  type IFormDestination,
  type FormDestinationContext,
} from "./IFormDestination";

interface ContactFieldMap {
  email?: string;
  firstName?: string;
  lastName?: string;
  company?: string;
}

/**
 * `create_deal` — the public job-application destination (ADR-0033). In ONE
 * handler it (a) upserts the applicant as a CRM contact via the shared
 * `createCrmContact` — same `emailHash` dedup + `dispatchContactTypeAutomations`
 * path as `create_crm_contact`, so an `Applicant`-typed Automation sends any
 * acknowledgment (the form stays email-ignorant) — then (b) drops them onto a
 * chosen `(pipeline, stage)` as a `Deal`, linked to that contact.
 *
 * Folding the contact upsert in here (rather than composing two destinations)
 * is deliberate: destinations run independently and can't share a freshly
 * created `contactId`.
 *
 * Idempotent on repeat submission: the contact dedupes by `emailHash`, and if
 * an OPEN deal (a deal in an `active` stage) already exists for
 * `(pipeline, contact)` we skip creating a second card. The `FormSubmission` is
 * still always stored by the caller.
 *
 * Config: `{ pipelineId, stageId, customerType, contactFieldMap: { email,
 * firstName, lastName, company }, dealTitleTemplate? }` where field-map values
 * are form field keys. `dealTitleTemplate` supports `{fieldKey}` tokens drawn
 * from the submission; it falls back to the applicant's name, then their email.
 */
export class CreateDealDestination implements IFormDestination {
  type = "create_deal";
  label = "Create deal (applicant → pipeline)";

  constructor(private db: PrismaClient) {}

  async run(
    data: Record<string, unknown>,
    config: Record<string, unknown>,
    context: FormDestinationContext,
  ): Promise<Record<string, unknown>> {
    const pipelineId =
      typeof config.pipelineId === "string" ? config.pipelineId : null;
    const stageId =
      typeof config.stageId === "string" ? config.stageId : null;
    if (!pipelineId || !stageId) {
      throw new Error("create_deal: pipelineId and stageId are required");
    }

    // A Deal's createdById is required — the form owner attributes the card.
    if (!context.ownerId) {
      throw new Error("create_deal: form has no owner to attribute the deal to");
    }

    const customerType =
      typeof config.customerType === "string" ? config.customerType : null;
    const fieldMap =
      config.contactFieldMap && typeof config.contactFieldMap === "object"
        ? (config.contactFieldMap as ContactFieldMap)
        : {};

    const pick = (key?: string): string | null => {
      if (!key) return null;
      const value = data[key];
      return typeof value === "string" && value.trim() ? value.trim() : null;
    };

    // Email is the contact dedup key (same reasoning as create_crm_contact).
    const email = pick(fieldMap.email);
    if (!email) {
      throw new Error("create_deal: submission has no email to dedupe on");
    }

    // Guard the target before any writes: the stage must belong to the named
    // pipeline, which must be a pipeline Project in this workspace. Stops a
    // misconfigured form dropping a card onto another workspace's board.
    const stage = await this.db.pipelineStage.findFirst({
      where: {
        id: stageId,
        projectId: pipelineId,
        project: { workspaceId: context.workspaceId, type: "pipeline" },
      },
      select: { id: true },
    });
    if (!stage) {
      throw new Error(
        "create_deal: stage not found in the configured pipeline for this workspace",
      );
    }

    // (a) Upsert the applicant — fires contact-type automations via the shared path.
    const contact = await createCrmContact(this.db, {
      workspaceId: context.workspaceId,
      email,
      firstName: pick(fieldMap.firstName),
      lastName: pick(fieldMap.lastName),
      company: pick(fieldMap.company),
      profileType: customerType,
      createdById: context.ownerId,
      importSource: "FORM",
      triggeredById: context.ownerId,
    });

    // (b) Idempotent: skip a second OPEN card for the same applicant on this
    // pipeline. "Open" = sitting in an active (non-won/lost) stage.
    const existingOpen = await this.db.deal.findFirst({
      where: {
        projectId: pipelineId,
        contactId: contact.contactId,
        stage: { type: "active" },
      },
      select: { id: true },
    });
    if (existingOpen) {
      return {
        contactId: contact.contactId,
        contactCreated: contact.created,
        automationFired: contact.fired,
        dealId: existingOpen.id,
        dealCreated: false,
      };
    }

    const title = this.renderTitle(config.dealTitleTemplate, data, fieldMap, {
      pick,
      email,
    });

    const lastDeal = await this.db.deal.findFirst({
      where: { projectId: pipelineId, stageId },
      orderBy: { stageOrder: "desc" },
      select: { stageOrder: true },
    });
    const stageOrder = (lastDeal?.stageOrder ?? -1) + 1;

    const deal = await this.db.deal.create({
      data: {
        projectId: pipelineId,
        stageId,
        title,
        // Sales fields (value/probability/currency) left at defaults — the Deal
        // is overloaded as a candidate card here (ADR-0033), like profileType.
        contactId: contact.contactId,
        workspaceId: context.workspaceId,
        createdById: context.ownerId,
        stageOrder,
      },
      select: { id: true },
    });

    await this.db.dealActivity.create({
      data: {
        dealId: deal.id,
        userId: context.ownerId,
        type: "CREATED",
        content: `Deal "${title}" created from a form submission`,
        metadata: { stageId, source: "form", formId: context.formId },
      },
    });

    return {
      contactId: contact.contactId,
      contactCreated: contact.created,
      automationFired: contact.fired,
      dealId: deal.id,
      dealCreated: true,
    };
  }

  /** Build the card title: template tokens → applicant name → email. */
  private renderTitle(
    templateRaw: unknown,
    data: Record<string, unknown>,
    fieldMap: ContactFieldMap,
    deps: { pick: (key?: string) => string | null; email: string },
  ): string {
    const template =
      typeof templateRaw === "string" && templateRaw.trim()
        ? templateRaw.trim()
        : null;

    if (template) {
      const rendered = template
        .replace(/\{(\w+)\}/g, (_match, key: string) => {
          const value = data[key];
          return typeof value === "string" && value.trim()
            ? value.trim()
            : "";
        })
        .trim();
      if (rendered) return rendered;
    }

    const name = [deps.pick(fieldMap.firstName), deps.pick(fieldMap.lastName)]
      .filter(Boolean)
      .join(" ")
      .trim();
    return name || deps.email;
  }
}
