import { type PrismaClient, type Prisma } from "@prisma/client";

import { CRM_CONTACT_TYPE_TRIGGER } from "./triggerResolver";

/**
 * Seeds the PoC onboarding **Automations** for a workspace (see CONTEXT.md →
 * CRM & Automations, ADR-0025). Each is a `WorkflowDefinition` with the CRM
 * contact-type trigger and a single logging step; later slices append the
 * welcome-email, document-generation, and send-for-signature steps.
 *
 * Idempotent: one onboarding automation per (workspace, Customer type).
 * PoC automations are seeded in code — the drag-and-drop builder is deferred.
 */

interface OnboardingAutomationSpec {
  name: string;
  targetCustomerType: string;
}

const ONBOARDING_AUTOMATIONS: OnboardingAutomationSpec[] = [
  { name: "Channel Partner onboarding", targetCustomerType: "Channel Partner" },
  { name: "Advisor onboarding", targetCustomerType: "Advisor" },
];

export async function seedCrmOnboardingAutomations(
  db: PrismaClient,
  workspaceId: string,
  createdById: string,
) {
  const definitions = [];

  for (const spec of ONBOARDING_AUTOMATIONS) {
    const existing = await db.workflowDefinition.findFirst({
      where: {
        workspaceId,
        triggerType: CRM_CONTACT_TYPE_TRIGGER,
        config: {
          path: ["targetCustomerType"],
          equals: spec.targetCustomerType,
        },
      },
    });

    if (existing) {
      definitions.push(existing);
      continue;
    }

    const definition = await db.workflowDefinition.create({
      data: {
        workspaceId,
        createdById,
        templateId: null,
        name: spec.name,
        description: `Onboarding automation for ${spec.targetCustomerType} contacts.`,
        config: {
          targetCustomerType: spec.targetCustomerType,
        } as Prisma.InputJsonValue,
        triggerType: CRM_CONTACT_TYPE_TRIGGER,
        isActive: true,
      },
    });

    // PoC step: a single logging step. Later slices add send_email →
    // generate_document → send_for_signature.
    await db.workflowStep.create({
      data: {
        definitionId: definition.id,
        order: 0,
        type: "send_notification",
        label: `Log onboarding for ${spec.targetCustomerType}`,
        config: {
          message: `Onboarding started for a ${spec.targetCustomerType}.`,
        } as Prisma.InputJsonValue,
      },
    });

    definitions.push(definition);
  }

  return definitions;
}
