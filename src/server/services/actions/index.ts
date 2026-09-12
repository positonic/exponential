/**
 * Action write path: the single server-side implementation of creating an
 * Action, called by every tRPC procedure, agent tool and voice path that
 * writes one. Owns the edit gate, workspace derivation, kanban seed, the
 * atomic tags / assignees / sprint attachment, the activity event and the
 * Assignment notification, so a bug in any of them is fixed here once.
 *
 * Nothing crosses this seam except plain dependencies (`ActionWriteDeps`), so
 * voice, webhooks, sync engines and cron can call it without a tRPC context.
 */
export {
  createAction,
  createdActionInclude,
  assertCanWriteToWorkspace,
  type CreatedAction,
} from "./createAction";
export {
  actionWriteSchema,
  createActionInputSchema,
  actionSourceSchema,
  isActionSource,
  ACTION_SOURCES,
  ACTION_STATUS_VALUES,
  type ActionSource,
  type ActionWriteInput,
  type CreateActionInput,
} from "./schema";
export {
  assertTagsInWorkspace,
  canAssignUserToAction,
  assertAssignableUsers,
  assertListMembership,
  type AssignmentScope,
} from "./containment";
export type { ActionActor, ActionWriteDeps } from "./types";
