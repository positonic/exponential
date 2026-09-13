/**
 * Action write path: the single server-side implementation of creating and
 * updating an Action, called by every tRPC procedure, agent tool and voice
 * path that writes one. `createAction` owns the edit gate, workspace
 * derivation, kanban seed, the atomic tags / assignees / sprint attachment,
 * the activity event and the Assignment notification; `applyActionUpdate`
 * owns the edit gate, the kanban ⇄ status lockstep (`deriveActionPatch`),
 * project moves and the activity event. A bug in any of them is fixed once.
 *
 * Nothing crosses this seam except plain dependencies (`ActionWriteDeps`), so
 * voice, webhooks, sync engines and cron can call it without a tRPC context.
 */
export {
  createAction,
  createdActionInclude,
  type CreatedAction,
} from "./createAction";
export { assertCanWriteToWorkspace } from "./workspaceGate";
export {
  applyActionUpdate,
  type ApplyActionUpdateResult,
  type ActionUpdateSnapshot,
} from "./applyActionUpdate";
export {
  deriveActionPatch,
  type ActionPatchCurrent,
  type ActionPatchInput,
  type ActionPatchTransitions,
  type DerivedActionPatch,
} from "./deriveActionPatch";
export {
  actionWriteSchema,
  actionCreateAttachmentsSchema,
  actionUpdatePatchSchema,
  createActionInputSchema,
  actionSourceSchema,
  isActionSource,
  ACTION_SOURCES,
  SYSTEM_ACTION_SOURCES,
  ACTION_STATUS_VALUES,
  KANBAN_STATUS_VALUES,
  type ActionSource,
  type ActionCoarseStatus,
  type ActionWriteInput,
  type CreateActionInput,
  type ActionUpdatePatch,
} from "./schema";
export {
  assertTagsInWorkspace,
  canAssignUserToAction,
  assertAssignableUsers,
  assertListMembership,
  type AssignmentScope,
} from "./containment";
export type { ActionActor, ActionWriteDeps } from "./types";
