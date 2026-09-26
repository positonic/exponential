import type { RouterOutputs } from "~/trpc/react";

type ActionWithSyncs = RouterOutputs["action"]["getAll"][number];

/**
 * Canonical Action shape for the actions list layer.
 *
 * Compatible with these tRPC queries (which return supersets of this shape):
 *   - action.getAll
 *   - action.getById
 *   - action.getProjectActions (its `project` is a slimmed
 *     {id, name, slug, workspaceId} select rather than the full row)
 *   - action.getByTranscription
 *
 * The `createdBy`, `lists`, `epic`, `tags`, `syncs` and blocker fields are optional
 * because not every query selects them; consumers should treat them as
 * possibly-undefined.
 */
export type Action = Omit<
  ActionWithSyncs,
  "createdBy" | "lists" | "epic" | "tags" | "syncs" | "depsOut" | "openBlockerCount" | "isBlocked"
> & {
  createdBy?: ActionWithSyncs["createdBy"] | null;
  lists?: ActionWithSyncs["lists"];
  epic?: ActionWithSyncs["epic"] | null;
  tags?: ActionWithSyncs["tags"];
  syncs?: ActionWithSyncs["syncs"];
  /** Blockers (`ActionDependency` edges) and the state derived from them; absent on queries that do not include them. */
  depsOut?: ActionWithSyncs["depsOut"];
  openBlockerCount?: number;
  isBlocked?: boolean;
};

/**
 * Slimmer Action shape for components that only need the basics.
 * Compatible with action.getToday.
 */
export type SimpleAction = {
  id: string;
  name: string;
  status: string;
  priority: string;
  dueDate?: Date | null;
  completedAt?: Date | null;
  projectId?: string | null;
  createdById?: string;
};
