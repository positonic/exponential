import { type PrismaClient, type Prisma } from "@prisma/client";

import { CRM_CONTACT_TYPE_TRIGGER } from "./triggerResolver";

/**
 * Seeds the two **starter** CRM onboarding Automations for a workspace
 * (CONTEXT.md → CRM & Automations, ADR-0025/0028). Each is a `WorkflowDefinition`
 * with the CRM contact-type trigger and the canonical onboarding steps.
 *
 * **Seed-if-absent, never clobber.** If a starter for a Customer type already
 * exists it is left untouched — its steps are now user-editable via the
 * Automation builder, so re-seeding must not overwrite edits. Starters are
 * marked `isDefault: true` in `config` and are deactivate-only (the router
 * refuses to hard-delete them), so a deleted default can never resurrect because
 * defaults are never deleted.
 */

interface StepSpec {
  type: string;
  label: string;
  config?: Record<string, unknown>;
}

interface OnboardingAutomationSpec {
  name: string;
  targetCustomerType: string;
}

const ONBOARDING_AUTOMATIONS: OnboardingAutomationSpec[] = [
  { name: "Channel Partner onboarding", targetCustomerType: "Channel Partner" },
  { name: "Advisor onboarding", targetCustomerType: "Advisor" },
];

/** Canonical ordered steps for a starter onboarding automation. */
function onboardingSteps(customerType: string): StepSpec[] {
  return [
    { type: "send_email", label: `Welcome ${customerType}`, config: {} },
    {
      type: "generate_document",
      label: `Generate ${customerType} agreement`,
      config: {},
    },
  ];
}

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
      // Seed-if-absent: never overwrite an existing automation's steps.
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
          isDefault: true,
        } as Prisma.InputJsonValue,
        triggerType: CRM_CONTACT_TYPE_TRIGGER,
        isActive: true,
        steps: {
          create: onboardingSteps(spec.targetCustomerType).map((step, i) => ({
            order: i,
            type: step.type,
            label: step.label,
            config: (step.config ?? {}) as Prisma.InputJsonValue,
          })),
        },
      },
    });

    definitions.push(definition);
  }

  return definitions;
}
