/**
 * Action write path: the single server-side implementation of creating and
 * updating an Action, called by every tRPC procedure, agent tool and voice
 * path that writes one. `createAction` owns the edit gate, workspace
 * derivation, kanban seed, the atomic tags / assignees / sprint attachment,
 * the activity event and the Assignment notification; `applyActionUpdate`
 * owns the edit gate, the kanban ⇄ status lockstep (`deriveActionPatch`),
 * project moves and the activity event. A bug in any of them is fixed once.
 *
 * Nothing crosses this seam except plain dependencies (`ActionWriteDeps`: a
 * Prisma client and the actor) and, on update, an optional Prisma `include`
 * so every caller keeps its return shape — no tRPC context, so voice,
 * webhooks, sync engines and cron can call it without one.
 *
 * Outside the seam, on purpose: `action.bulkReschedule` and `action.bulkDefer`
 * stay set-based `updateMany` writes. They touch dates only — never `status`,
 * `kanbanStatus`, `completedAt` or `projectId` — so none of the rules this
 * module owns apply to them, and a per-row loop would only make a pile of
 * two hundred overdue actions slower to clear. If either ever needs to
 * change a status or a column, it moves behind `applyActionUpdate` first.
 * Likewise `uploadImage` / `saveScreenshot` (blobs, not rows) and the
 * assignment, tagging and list-membership procedures for existing Actions,
 * which share this module's containment helpers rather than its writes.
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
export {
  blockedByInclude,
  wouldCreateActionCycle,
  assertLinkableBlockers,
  setActionBlockers,
} from "./dependencies";
export { actionWriteDeps, type ActionActor, type ActionWriteDeps } from "./types";
