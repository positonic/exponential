/**
 * channelLinkService — deep module owning the inbound, provider-agnostic
 * `ChannelLink` (ADR-0023).
 *
 * A `ChannelLink` is the *routing* authority: it maps `(provider, externalId)`
 * → a workspace (required) and project (optional). It is integration-free and
 * deliberately distinct from the outbound `SlackChannelConfig`.
 *
 * Functions take an explicit `db` handle (+ the acting `userId` where access
 * matters) rather than a full tRPC `ctx`, so they are callable from both the
 * `channelLink` router and the system ingest path, and unit-testable with a
 * mocked Prisma client.
 *
 * Writes are gated by workspace membership via the centralized access resolver
 * (`getWorkspaceMembership`) — no inline permission checks.
 */
import type { PrismaClient } from "@prisma/client";
import { TRPCError } from "@trpc/server";

import { getWorkspaceMembership } from "~/server/services/access/resolvers/workspaceResolver";

export interface CreateChannelLinkInput {
  userId: string;
  provider: string;
  externalId: string;
  workspaceId: string;
  projectId?: string | null;
  displayName?: string | null;
}

/**
 * `ChannelLink.direction` values.
 *
 * `inbound` is ADR-0023's original meaning and the column default, so every row that
 * predates outbound routing keeps it: "which workspace/project owns this conversation?"
 * `outbound` rows answer the reverse — "where does this project's content go?"
 */
export const INBOUND = "inbound";
export const OUTBOUND = "outbound";

/**
 * Resolve a watched conversation to its link. System path (ingest) — no access
 * check. Returns only an active link; an inactive or missing link resolves to
 * `null`, which the ingest path treats as "drop this summary".
 *
 * Inbound rows only. `ChannelLink` now also carries outbound routing rows (which room
 * does this project's content go to), and those answer a different question — treating
 * one as an inbound link would attribute an incoming message to a binding that was
 * never about receiving. Existing rows default to `"inbound"`, so nothing that worked
 * before changes.
 */
export async function resolveChannelLink(
  db: PrismaClient,
  provider: string,
  externalId: string,
) {
  const link = await db.channelLink.findUnique({
    where: { provider_externalId: { provider, externalId } },
  });
  if (!link || !link.isActive) return null;
  // Only an *explicitly* outbound row is excluded. Anything else — the "inbound"
  // default, or a row read through a mock that omits the column — is inbound, so this
  // cannot start dropping links that worked before.
  if (link.direction === OUTBOUND) return null;
  return link;
}

/**
 * Link a watched conversation to a workspace (+ optional project). Caller must
 * be a member of the target workspace; a `(provider, externalId)` already in
 * use is rejected so a conversation is linked at most once.
 */
export async function createChannelLink(
  db: PrismaClient,
  input: CreateChannelLinkInput,
) {
  const membership = await getWorkspaceMembership(
    db,
    input.userId,
    input.workspaceId,
  );
  if (!membership) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You must be a member of this workspace to link a channel to it",
    });
  }

  const existing = await db.channelLink.findUnique({
    where: {
      provider_externalId: {
        provider: input.provider,
        externalId: input.externalId,
      },
    },
    select: { id: true },
  });
  if (existing) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "This channel is already linked",
    });
  }

  return db.channelLink.create({
    data: {
      provider: input.provider,
      externalId: input.externalId,
      displayName: input.displayName ?? null,
      workspaceId: input.workspaceId,
      projectId: input.projectId ?? null,
      createdById: input.userId,
    },
  });
}

/** List the links routed to a workspace. Caller must be a workspace member. */
export async function listChannelLinks(
  db: PrismaClient,
  args: { userId: string; workspaceId: string },
) {
  const membership = await getWorkspaceMembership(
    db,
    args.userId,
    args.workspaceId,
  );
  if (!membership) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You must be a member of this workspace to view its channel links",
    });
  }

  return db.channelLink.findMany({
    where: { workspaceId: args.workspaceId },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Disconnect a link so it stops routing summaries. Deletes the row (freeing the
 * `(provider, externalId)` slot for a future re-link). Caller must be a member
 * of the link's workspace.
 */
export async function unlinkChannelLink(
  db: PrismaClient,
  args: { userId: string; id: string },
) {
  const link = await db.channelLink.findUnique({
    where: { id: args.id },
    select: { id: true, workspaceId: true },
  });
  if (!link) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Channel link not found" });
  }

  const membership = await getWorkspaceMembership(
    db,
    args.userId,
    link.workspaceId,
  );
  if (!membership) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You must be a member of this workspace to unlink its channels",
    });
  }

  await db.channelLink.delete({ where: { id: args.id } });
  return { id: args.id };
}
