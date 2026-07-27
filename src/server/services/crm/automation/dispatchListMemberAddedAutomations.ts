import { type PrismaClient, type Prisma } from "@prisma/client";

import { WorkflowEngine } from "~/server/services/workflows/WorkflowEngine";
import { createStepRegistry } from "~/server/services/workflows/StepRegistry";
import { LIST_MEMBER_ADDED_TRIGGER } from "./listMemberTrigger";

/**
 * Impure dispatcher for the `list_member_added` **Automation trigger**
 * ([ADR-0031]). Wired into `collection.addMembers`: when contacts are added to a
 * List, it finds the workspace's active Automations whose `config.listId`
 * matches that List and runs each via the shared `WorkflowEngine`, once per
 * newly-relevant member.
 *
 * Mirrors `dispatchContactTypeAutomations`:
 * - idempotent per `(definition, contact)` via prior runs' `input.contactId`
 *   (FAILED runs don't count, so a transient email error is retryable),
 * - failures are caught and logged so a send error never breaks the membership
 *   write — each automation's own failure is recorded on its run.
 *
 * Callers should only invoke this when at least one member was genuinely added
 * (`createMany.count > 0`); the per-(definition, contact) guard then prevents a
 * re-add or a re-run from emailing the same contact twice.
 */
export interface DispatchListMemberInput {
  collectionId: string;
  workspaceId: string;
  /** The contact ids passed to `addMembers` (the candidate recipients). */
  addedMemberIds: string[];
  triggeredById?: string;
}

function inputObject(value: Prisma.JsonValue | null): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function dispatchListMemberAddedAutomations(
  db: PrismaClient,
  input: DispatchListMemberInput,
): Promise<{ firedDefinitionIds: string[] }> {
  if (input.addedMemberIds.length === 0) return { firedDefinitionIds: [] };

  const definitions = await db.workflowDefinition.findMany({
    where: {
      workspaceId: input.workspaceId,
      isActive: true,
      triggerType: LIST_MEMBER_ADDED_TRIGGER,
      config: { path: ["listId"], equals: input.collectionId },
    },
    select: { id: true },
  });

  if (definitions.length === 0) return { firedDefinitionIds: [] };

  const definitionIds = definitions.map((d) => d.id);

  // Idempotency: a (definition, contact) pair fires once. Runs carry
  // `{ contactId }` in their input JSON, so no extra column. FAILED runs are
  // excluded so a failed send retries on the next add. Scoped to just these
  // candidate contacts so the scan stays bounded as run history grows (rather
  // than loading every run the definition ever produced).
  const priorRuns = await db.workflowPipelineRun.findMany({
    where: {
      definitionId: { in: definitionIds },
      status: { not: "FAILED" },
      OR: input.addedMemberIds.map((memberId) => ({
        input: { path: ["contactId"], equals: memberId },
      })),
    },
    select: { definitionId: true, input: true },
  });

  const fired = new Set<string>();
  for (const run of priorRuns) {
    const contactId = inputObject(run.input).contactId;
    if (typeof contactId === "string") {
      fired.add(`${run.definitionId}:${contactId}`);
    }
  }

  const engine = new WorkflowEngine(db, createStepRegistry(db));
  const firedDefinitionIds: string[] = [];

  for (const def of definitions) {
    for (const memberId of input.addedMemberIds) {
      const key = `${def.id}:${memberId}`;
      if (fired.has(key)) continue;
      try {
        await engine.execute(def.id, input.triggeredById, {
          contactId: memberId,
          workspaceId: input.workspaceId,
          listId: input.collectionId,
        });
        fired.add(key);
        if (!firedDefinitionIds.includes(def.id)) {
          firedDefinitionIds.push(def.id);
        }
      } catch (err) {
        console.error(
          `[listAutomation] automation ${def.id} failed for member ${memberId} in list ${input.collectionId}`,
          err,
        );
      }
    }
  }

  return { firedDefinitionIds };
}
