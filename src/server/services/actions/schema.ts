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

export type ActionCoarseStatus = (typeof ACTION_STATUS_VALUES)[number];

/** Kanban column (the `Action.kanbanStatus` enum column). */
export const KANBAN_STATUS_VALUES = [
  "BACKLOG",
  "TODO",
  "IN_PROGRESS",
  "IN_REVIEW",
  "DONE",
  "CANCELLED",
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
  /**
   * Ids of the actions this one is blocked by (`ActionDependency` rows,
   * ADR-0062). On update the list replaces the current set; `undefined`
   * leaves it untouched.
   */
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

/**
 * The closed set of surfaces an Action can be created from, stored in the
 * existing `Action.source` string column (no migration; validated here).
 * Every create names one; nothing defaults silently.
 *
 * `daily-plan-prompt` is the idempotent "Do daily plan" prompt and stays
 * distinct from `daily-plan` (a task converted from a daily plan): the prompt
 * is deduplicated by `source` + due date, so sharing the value would make an
 * ordinary planned task due today suppress the prompt.
 */
export const ACTION_SOURCES = [
  "ui",
  "ios",
  "cli",
  "voice",
  "meeting",
  "daily-plan",
  "daily-plan-prompt",
  "whatsapp",
  "telegram",
  "matrix",
  "agent",
] as const;

export const actionSourceSchema = z.enum(ACTION_SOURCES);

/**
 * Sources whose creates are system-generated, not something a person did:
 * they get no workspace activity event, or the feed fills with one
 * "created Do daily plan" row per member per day.
 */
export const SYSTEM_ACTION_SOURCES: ReadonlySet<string> = new Set(["daily-plan-prompt"]);

export type ActionSource = (typeof ACTION_SOURCES)[number];

export function isActionSource(value: unknown): value is ActionSource {
  return actionSourceSchema.safeParse(value).success;
}

/**
 * Attachments a client may send with a create; `createAction` writes them in
 * the same transaction as the Action. Optional, so a caller that creates and
 * then attaches (an external SDK / CLI client) keeps working.
 */
export const actionCreateAttachmentsSchema = z.object({
  /** Tags to attach, written in the same transaction as the Action. */
  tagIds: z.array(z.string()).optional(),
  /** Users to assign, written in the same transaction as the Action. */
  assigneeIds: z.array(z.string()).optional(),
  /** Sprint (List) to add the Action to, written in the same transaction. */
  sprintListId: z.string().optional(),
});

/** `actionWriteSchema` plus the create-only extras. */
export const createActionInputSchema = actionWriteSchema.extend({
  /** Which surface the Action came from (`Action.source`). Required. */
  source: actionSourceSchema,
  ...actionCreateAttachmentsSchema.shape,
  /**
   * Provenance for Actions extracted from somewhere (a meeting transcript):
   * the meeting row, the `(sourceType, sourceId)` pair `findBySource` and
   * `upsertBySource` key on, and the last-write stamp. Plain columns; the
   * meeting-domain linkage (participants) stays with the caller.
   */
  transcriptionSessionId: z.string().optional(),
  sourceType: z.string().optional(),
  sourceId: z.string().optional(),
  lastUpdatedBy: z.string().optional(),
  lastUpdatedSource: z.string().optional(),
});

export type CreateActionInput = z.input<typeof createActionInputSchema>;

/**
 * The one patch shape for updating an Action: `actionWriteSchema.partial()`
 * with the columns an update may also clear made nullable, plus the
 * update-only fields (kanban column and order, ticket link, bounty status,
 * last-write stamp). `applyActionUpdate` takes it; `action.update` exposes
 * it minus the fields it never accepted.
 */
export const actionUpdatePatchSchema = actionWriteSchema
  // The create defaults must never fire on a partial patch (an empty patch
  // would reactivate a completed row), so those two come back defaults-free.
  .omit({ priority: true, status: true })
  .partial()
  .extend({
  priority: z.enum(PRIORITY_VALUES).optional(),
  status: z.enum(ACTION_STATUS_VALUES).optional(),
  /** `null` clears the description (the agent tool allows it; the column is nullable). */
  description: z.string().nullable().optional(),
  /** A project to move to, or `null` to leave the current one. */
  projectId: z.string().nullable().optional(),
  workspaceId: z.string().nullable().optional(),
  dueDate: z.date().nullable().optional(),
  scheduledStart: z.date().nullable().optional(),
  scheduledEnd: z.date().nullable().optional(),
  duration: z.number().min(1).nullable().optional(),
  kanbanStatus: z.enum(KANBAN_STATUS_VALUES).optional(),
  kanbanOrder: z.number().int().nullable().optional(),
  epicId: z.string().nullable().optional(),
  /** Link to a Ticket whose product lives in the action's workspace; null unlinks. */
  ticketId: z.string().nullable().optional(),
  effortEstimate: z.number().min(0).nullable().optional(),
  bountyAmount: z.number().positive().nullable().optional(),
  bountyToken: z.string().nullable().optional(),
  bountyStatus: z
    .enum(["OPEN", "IN_PROGRESS", "IN_REVIEW", "COMPLETED", "CANCELLED"])
    .nullable()
    .optional(),
  bountyDifficulty: z.enum(["beginner", "intermediate", "advanced"]).nullable().optional(),
  bountyDeadline: z.date().nullable().optional(),
  bountyExternalUrl: z.string().url().nullable().optional(),
  /** Source attribution set by agents and integrations: which channel last touched the action. */
  lastUpdatedBy: z.enum(["AGENT", "USER_EMAIL", "USER_WHATSAPP", "USER_UI"]).optional(),
  lastUpdatedSource: z.string().optional(),
});

export type ActionUpdatePatch = z.input<typeof actionUpdatePatchSchema>;
