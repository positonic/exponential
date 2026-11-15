/**
 * Where does content of this kind, from this scope, go?
 *
 * Project → workspace, per kind. Deliberately *not* `resolveChannelLink()`: that one is
 * the inbound direction ("which workspace owns this conversation?"). This walks the
 * other way over the same table (ADR-0023's routing record, ADR-0075).
 *
 * `Off` is a project-level row with `isActive: false`, so "explicitly off" and "never
 * configured" stay distinguishable: Off hard-blocks and never falls through to the
 * workspace default. A row with a null `projectId` is the workspace default.
 *
 * V1 resolves **one** destination per scope and kind. The binding unique is per
 * (room, kind), not per scope, so a second provider could later bind the same scope and
 * kind; until the Slack poster (V2) turns this into a fan-out over every bound
 * destination, the oldest binding wins, deterministically, rather than whichever row
 * the planner returned first.
 */

import type { PrismaClient } from "@prisma/client";
import { OUTBOUND } from "~/server/services/channelLinkService";
import type { OutboundDestination, OutboundKind } from "./types";

export interface ResolveOutboundDestinationInput {
  workspaceId: string | null;
  projectId: string | null;
  kind: OutboundKind;
  /** Restrict to one provider's bindings (meeting summaries are Matrix-only today). */
  provider?: string;
  /**
   * A restricted project never inherits the workspace room: it posts only through its
   * own explicit binding. On by default; the meeting-summary wrapper switches it off to
   * keep that feature's behaviour exactly as it shipped.
   */
  failClosedWhenRestricted?: boolean;
}

export async function resolveOutboundDestination(
  db: PrismaClient,
  {
    workspaceId,
    projectId,
    kind,
    provider,
    failClosedWhenRestricted = true,
  }: ResolveOutboundDestinationInput,
): Promise<OutboundDestination> {
  const providerWhere = provider ? { provider } : {};

  if (projectId) {
    const projectLink = await db.channelLink.findFirst({
      where: {
        projectId,
        // Scoped by workspace like every write path. Without it a row under another
        // workspace would be honoured here.
        ...(workspaceId ? { workspaceId } : {}),
        ...providerWhere,
        direction: OUTBOUND,
        kind,
      },
      orderBy: { createdAt: "asc" },
    });

    if (projectLink) {
      // An inactive project row is the explicit Off, and it must not fall through.
      return projectLink.isActive ? { kind: "room", link: projectLink } : { kind: "off" };
    }

    if (failClosedWhenRestricted) {
      // Inherit on a restricted project would push its content into a room whose
      // membership the restriction was meant to keep it from. Fail closed: no own
      // binding, no post.
      const project = await db.project.findUnique({
        where: { id: projectId },
        select: { isRestricted: true },
      });
      if (project?.isRestricted) return { kind: "none" };
    }
  }

  if (!workspaceId) return { kind: "none" };

  const workspaceLink = await db.channelLink.findFirst({
    where: {
      workspaceId,
      projectId: null,
      ...providerWhere,
      direction: OUTBOUND,
      kind,
      isActive: true,
    },
    orderBy: { createdAt: "asc" },
  });

  return workspaceLink ? { kind: "room", link: workspaceLink } : { kind: "none" };
}
