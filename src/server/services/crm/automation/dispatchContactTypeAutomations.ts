import { type PrismaClient } from "@prisma/client";

import { WorkflowEngine } from "~/server/services/workflows/WorkflowEngine";
import { createStepRegistry } from "~/server/services/workflows/StepRegistry";
import {
  CRM_CONTACT_TYPE_TRIGGER,
  resolveAutomationsToFire,
  type CrmAutomationDefinition,
} from "./triggerResolver";

/**
 * Impure dispatcher for the "Contact customer type set" **Automation trigger**
 * (CONTEXT.md → CRM & Automations, ADR-0025). Wired into `crmContact.create`
 * and `crmContact.update`. It gathers the workspace's active CRM automations
 * and this contact's prior runs, asks the pure `resolveAutomationsToFire`
 * which should fire, and runs each via the existing `WorkflowEngine`.
 *
 * The Gmail/Calendar import path (`ContactSyncService`) writes contacts
 * directly and never calls this, so bulk imports are inherently suppressed;
 * the `importBatchId` guard here is a defensive second line.
 *
 * Failures are caught and logged — onboarding never breaks contact creation,
 * and each automation's own failure is recorded on its `WorkflowPipelineRun`.
 */
export interface DispatchInput {
  contactId: string;
  workspaceId: string;
  oldProfileType: string | null;
  newProfileType: string | null;
  importBatchId?: string | null;
  triggeredById?: string;
}

export async function dispatchContactTypeAutomations(
  db: PrismaClient,
  input: DispatchInput,
): Promise<{ firedDefinitionIds: string[] }> {
  // Cheap exits before any DB work.
  if (input.importBatchId) return { firedDefinitionIds: [] };
  if (!input.newProfileType || input.newProfileType === input.oldProfileType) {
    return { firedDefinitionIds: [] };
  }

  const rows = await db.workflowDefinition.findMany({
    where: {
      workspaceId: input.workspaceId,
      isActive: true,
      triggerType: CRM_CONTACT_TYPE_TRIGGER,
    },
    select: { id: true, config: true },
  });

  const definitions: CrmAutomationDefinition[] = rows
    .map((r) => {
      const cfg = (r.config ?? {}) as Record<string, unknown>;
      const targetCustomerType =
        typeof cfg.targetCustomerType === "string"
          ? cfg.targetCustomerType
          : null;
      return targetCustomerType ? { id: r.id, targetCustomerType } : null;
    })
    .filter((d): d is CrmAutomationDefinition => d !== null);

  if (definitions.length === 0) return { firedDefinitionIds: [] };

  // Idempotency: which of these definitions already produced a run for this
  // contact? Runs carry `{ contactId }` in their input JSON, so no extra column.
  const priorRuns = await db.workflowPipelineRun.findMany({
    where: {
      definitionId: { in: definitions.map((d) => d.id) },
      input: { path: ["contactId"], equals: input.contactId },
    },
    select: { definitionId: true },
  });

  const toFire = resolveAutomationsToFire({
    change: {
      oldProfileType: input.oldProfileType,
      newProfileType: input.newProfileType,
      importBatchId: input.importBatchId,
    },
    definitions,
    alreadyFiredDefinitionIds: priorRuns.map((r) => r.definitionId),
  });

  if (toFire.length === 0) return { firedDefinitionIds: [] };

  const engine = new WorkflowEngine(db, createStepRegistry(db));
  const firedDefinitionIds: string[] = [];

  for (const def of toFire) {
    try {
      await engine.execute(def.id, input.triggeredById, {
        contactId: input.contactId,
        workspaceId: input.workspaceId,
        customerType: def.targetCustomerType,
      });
      firedDefinitionIds.push(def.id);
    } catch (err) {
      console.error(
        `[crmAutomation] automation ${def.id} failed for contact ${input.contactId}`,
        err,
      );
    }
  }

  return { firedDefinitionIds };
}
