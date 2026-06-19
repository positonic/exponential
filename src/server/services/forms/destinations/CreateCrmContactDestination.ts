import { type PrismaClient } from "@prisma/client";

import { createCrmContact } from "~/server/services/crm/createCrmContact";
import {
  type IFormDestination,
  type FormDestinationContext,
} from "./IFormDestination";

interface FieldMap {
  email?: string;
  firstName?: string;
  lastName?: string;
  company?: string;
}

/**
 * `create_crm_contact` — maps submission fields to a CRM contact, stamps the
 * configured Customer type, and (via `createCrmContact`) fires the CRM
 * automation engine. Config: `{ customerType, fieldMap: { email, firstName,
 * lastName, company } }` where values are form field keys.
 */
export class CreateCrmContactDestination implements IFormDestination {
  type = "create_crm_contact";
  label = "Create CRM contact";

  constructor(private db: PrismaClient) {}

  async run(
    data: Record<string, unknown>,
    config: Record<string, unknown>,
    context: FormDestinationContext,
  ): Promise<Record<string, unknown>> {
    const customerType =
      typeof config.customerType === "string" ? config.customerType : null;
    const fieldMap =
      config.fieldMap && typeof config.fieldMap === "object"
        ? (config.fieldMap as FieldMap)
        : {};

    const pick = (key?: string): string | null => {
      if (!key) return null;
      const value = data[key];
      return typeof value === "string" && value.trim() ? value.trim() : null;
    };

    const result = await createCrmContact(this.db, {
      workspaceId: context.workspaceId,
      email: pick(fieldMap.email),
      firstName: pick(fieldMap.firstName),
      lastName: pick(fieldMap.lastName),
      company: pick(fieldMap.company),
      profileType: customerType,
      createdById: context.ownerId,
      importSource: "FORM",
      triggeredById: context.ownerId ?? undefined,
    });

    return {
      contactId: result.contactId,
      created: result.created,
      automationFired: result.fired,
    };
  }
}