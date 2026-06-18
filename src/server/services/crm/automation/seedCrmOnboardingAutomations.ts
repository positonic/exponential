import { type PrismaClient, type Prisma } from "@prisma/client";

import { CRM_CONTACT_TYPE_TRIGGER } from "./triggerResolver";

/**
 * Seeds the PoC onboarding **Automations** for a workspace (see CONTEXT.md →
 * CRM & Automations, ADR-0025). Each is a `WorkflowDefinition` with the CRM
 * contact-type trigger and an ordered list of steps that grows as slices land:
 * `send_email` (welcome) → `generate_document` → `send_for_signature`.
 *
 * Idempotent: one onboarding automation per (workspace, Customer type).
 * Re-running reconciles the steps to the current canonical list (replacing
 * steps cascades their step-runs — acceptable for a dev/demo seed action;
 * `WorkflowPipelineRun` history is preserved). PoC automations are seeded in
 * code — the drag-and-drop builder is deferred.
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

/** Canonical ordered steps for an onboarding automation. */
function onboardingSteps(customerType: string): StepSpec[] {
  return [
    {
      type: "send_email",
      label: `Welcome ${customerType}`,
      config: {},
    },
    {
      type: "generate_document",
      label: `Generate ${customerType} agreement`,
      config: {},
    },
  ];
}

async function reconcileSteps(
  db: PrismaClient,
  definitionId: string,
  steps: StepSpec[],
) {
  await db.workflowStep.deleteMany({ where: { definitionId } });
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]!;
    await db.workflowStep.create({
      data: {
        definitionId,
        order: i,
        type: step.type,
        label: step.label,
        config: (step.config ?? {}) as Prisma.InputJsonValue,
      },
    });
  }
}

export async function seedCrmOnboardingAutomations(
  db: PrismaClient,
  workspaceId: string,
  createdById: string,
) {
  const definitions = [];

  for (const spec of ONBOARDING_AUTOMATIONS) {
    let definition = await db.workflowDefinition.findFirst({
      where: {
        workspaceId,
        triggerType: CRM_CONTACT_TYPE_TRIGGER,
        config: {
          path: ["targetCustomerType"],
          equals: spec.targetCustomerType,
        },
      },
    });

    if (!definition) {
      definition = await db.workflowDefinition.create({
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
    }

    await reconcileSteps(
      db,
      definition.id,
      onboardingSteps(spec.targetCustomerType),
    );
    definitions.push(definition);
  }

  return definitions;
}
