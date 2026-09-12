import { z } from "zod";
import { PRIORITY_VALUES } from "~/types/priority";

/** Coarse Action lifecycle status (the `Action.status` string column). */
export const ACTION_STATUS_VALUES = [
  "ACTIVE",
  "COMPLETED",
  "CANCELLED",
  "DELETED",
  "DRAFT",
] as const;

/**
 * The one input shape for writing an Action — the union of what the create
 * procedures accept today. `createAction` takes it plus its create-only
 * extras; the update path takes `.partial()` of it.
 */
export const actionWriteSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  projectId: z.string().optional(),
  workspaceId: z.string().optional(),
  dueDate: z.date().optional(),
  scheduledStart: z.date().optional(),
  scheduledEnd: z.date().optional(),
  duration: z.number().min(1).optional(), // Duration in minutes
  priority: z.enum(PRIORITY_VALUES).default("Quick"),
  status: z.enum(ACTION_STATUS_VALUES).default("ACTIVE"),
  epicId: z.string().optional(),
  effortEstimate: z.number().min(0).optional(),
  blockedByIds: z.array(z.string()).optional(),
  // Bounty fields
  isBounty: z.boolean().optional(),
  bountyAmount: z.number().positive().optional(),
  bountyToken: z.string().optional(),
  bountyDifficulty: z.enum(["beginner", "intermediate", "advanced"]).optional(),
  bountySkills: z.array(z.string()).optional(),
  bountyDeadline: z.date().optional(),
  bountyMaxClaimants: z.number().int().min(1).optional(),
  bountyExternalUrl: z.string().url().optional(),
});

export type ActionWriteInput = z.input<typeof actionWriteSchema>;

/** `actionWriteSchema` plus the create-only extras. */
export const createActionInputSchema = actionWriteSchema.extend({
  /** Which surface the Action came from (`Action.source`). */
  source: z.string().optional(),
  /** Tags to attach, written in the same transaction as the Action. */
  tagIds: z.array(z.string()).optional(),
  /** Users to assign, written in the same transaction as the Action. */
  assigneeIds: z.array(z.string()).optional(),
  /** Sprint (List) to add the Action to, written in the same transaction. */
  sprintListId: z.string().optional(),
});

export type CreateActionInput = z.input<typeof createActionInputSchema>;
