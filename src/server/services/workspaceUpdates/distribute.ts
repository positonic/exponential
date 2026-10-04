/**
 * Distribute an approved Workspace update to every channel the workspace has
 * configured. Runs right after approval and again from the hourly sweep until
 * every channel has finished, so each channel is idempotent on its own:
 * a channel that already succeeded is never repeated.
 *
 * Only ever sends the snapshot frozen at approval (`approvedTitle` /
 * `approvedBody`), never the live Page.
 *
 * Each attempt first claims the update (`distributionAttemptAt`) so approval's
 * own attempt and the sweep never send at the same time.
 */
import type { Prisma, PrismaClient } from "@prisma/client";

import { WORKSPACE_UPDATE_STATUS } from "./types";

export type ChannelName = "public" | "email" | "matrix";

export interface ChannelOutcome {
  /** done: finished; skipped: not configured; failed: retry on the next sweep. */
  status: "done" | "skipped" | "failed";
  at: string;
  detail?: string;
}

export type Deliveries = Partial<Record<ChannelName, ChannelOutcome>>;

/** What a channel needs to know about the update it is sending. */
export interface ApprovedUpdate {
  id: string;
  workspaceId: string;
  workspaceSlug: string;
  workspaceName: string;
  title: string;
  /** Approved Markdown snapshot. */
  body: string;
  approvedById: string | null;
  config: {
    isPublic: boolean;
    newsletterCollectionId: string | null;
  };
}

/** One delivery channel. Returns its outcome; throwing counts as "failed". */
export type Channel = (update: ApprovedUpdate) => Promise<ChannelOutcome>;

export type DistributeChannels = Record<ChannelName, Channel>;

export type DistributeResult =
  | { kind: "sent"; deliveries: Deliveries }
  | { kind: "partial"; deliveries: Deliveries }
  /** Another attempt holds the lease; it will record the outcome. */
  | { kind: "busy" }
  | { kind: "not-approved" };

/**
 * How long a claimed attempt keeps others out. Longer than any function that
 * distributes can run (the cron route's 300s), so a live attempt is never
 * overlapped; a crashed one is retried once it lapses.
 */
export const DISTRIBUTION_LEASE_MS = 15 * 60 * 1000;

export function outcome(status: ChannelOutcome["status"], detail?: string): ChannelOutcome {
  return { status, at: new Date().toISOString(), ...(detail ? { detail } : {}) };
}

/** The public page and feed are queries over approved rows: nothing to push. */
export const publicChannel: Channel = (update) =>
  Promise.resolve(update.config.isPublic ? outcome("done", "listed") : outcome("skipped", "workspace is not public"));

export async function distributeWorkspaceUpdate(
  db: PrismaClient,
  updateId: string,
  channels: DistributeChannels,
): Promise<DistributeResult> {
  // Claim before reading `deliveries`, so what this attempt skips as done is
  // what the previous attempt recorded, never a read racing another sender.
  const claimedAt = new Date();
  const claim = await db.workspaceUpdate.updateMany({
    where: {
      id: updateId,
      status: WORKSPACE_UPDATE_STATUS.APPROVED,
      OR: [
        { distributionAttemptAt: null },
        { distributionAttemptAt: { lt: new Date(claimedAt.getTime() - DISTRIBUTION_LEASE_MS) } },
      ],
    },
    data: { distributionAttemptAt: claimedAt },
  });
  if (claim.count === 0) {
    const current = await db.workspaceUpdate.findUnique({ where: { id: updateId }, select: { status: true } });
    return current?.status === WORKSPACE_UPDATE_STATUS.APPROVED ? { kind: "busy" } : { kind: "not-approved" };
  }

  const row = await db.workspaceUpdate.findUnique({
    where: { id: updateId },
    select: {
      id: true,
      status: true,
      approvedTitle: true,
      approvedBody: true,
      approvedById: true,
      deliveries: true,
      workspace: {
        select: {
          id: true,
          slug: true,
          name: true,
          updateConfig: { select: { isPublic: true, newsletterCollectionId: true } },
        },
      },
    },
  });
  if (row?.status !== WORKSPACE_UPDATE_STATUS.APPROVED || row.approvedBody === null) {
    return { kind: "not-approved" };
  }

  const update: ApprovedUpdate = {
    id: row.id,
    workspaceId: row.workspace.id,
    workspaceSlug: row.workspace.slug,
    workspaceName: row.workspace.name,
    title: row.approvedTitle ?? "Update",
    body: row.approvedBody,
    approvedById: row.approvedById,
    config: {
      isPublic: row.workspace.updateConfig?.isPublic ?? false,
      newsletterCollectionId: row.workspace.updateConfig?.newsletterCollectionId ?? null,
    },
  };

  const previous = (row.deliveries ?? {}) as Deliveries;
  const deliveries: Deliveries = { ...previous };
  for (const name of Object.keys(channels) as ChannelName[]) {
    // A channel that already finished is never repeated (no double emails or posts).
    if (previous[name]?.status === "done") continue;
    try {
      deliveries[name] = await channels[name](update);
    } catch (err) {
      deliveries[name] = outcome("failed", err instanceof Error ? err.message : "Unknown error");
    }
  }

  const finished = Object.values(deliveries).every((d) => d.status !== "failed");
  // Conditional on still holding the lease (and still APPROVED), so an
  // attempt that outlived its lease cannot overwrite a newer attempt's record.
  await db.workspaceUpdate.updateMany({
    where: { id: updateId, status: WORKSPACE_UPDATE_STATUS.APPROVED, distributionAttemptAt: claimedAt },
    data: {
      deliveries: deliveries as Prisma.InputJsonValue,
      ...(finished ? { status: WORKSPACE_UPDATE_STATUS.SENT, sentAt: new Date() } : {}),
    },
  });
  return { kind: finished ? "sent" : "partial", deliveries };
}
