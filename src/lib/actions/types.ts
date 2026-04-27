import type { RouterOutputs } from "~/trpc/react";

type ActionWithSyncs = RouterOutputs["action"]["getAll"][number];

/**
 * Canonical Action shape for the actions list layer.
 *
 * Compatible with these tRPC queries (which return supersets of this shape):
 *   - action.getAll
 *   - action.getById
 *   - action.getProjectActions
 *   - action.getByTranscription
 *
 * The `createdBy`, `lists`, `epic`, `tags`, and `syncs` fields are optional
 * because not every query selects them; consumers should treat them as
 * possibly-undefined.
 */
export type Action = Omit<
  ActionWithSyncs,
  "createdBy" | "lists" | "epic" | "tags" | "syncs"
> & {
  createdBy?: ActionWithSyncs["createdBy"] | null;
  lists?: ActionWithSyncs["lists"];
  epic?: ActionWithSyncs["epic"] | null;
  tags?: ActionWithSyncs["tags"];
  syncs?: ActionWithSyncs["syncs"];
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
