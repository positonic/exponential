/**
 * Where does this meeting's summary go?
 *
 * Deliberately **not** `resolveChannelLink()`. That one is keyed on the
 * `(provider, externalId)` unique and answers the inbound question — "which workspace
 * and project owns this conversation?" This walks the other way: given a project, which
 * room does its content go to. Same table (ADR-0023's routing record), opposite
 * direction, which is exactly why `ChannelLink.direction` exists.
 *
 * Resolution is project → workspace. There is no team tier.
 */

import type { ChannelLink, PrismaClient } from "@prisma/client";
import { MATRIX_CHANNEL_PROVIDER } from "./constants";
import { OUTBOUND } from "~/server/services/channelLinkService";

export type MatrixDestination =
  | { kind: "room"; link: ChannelLink }
  /** The project is explicitly switched off — the confidential-project escape hatch. */
  | { kind: "off" }
  /** Nothing configured anywhere. The caller should offer a picker, not fail. */
  | { kind: "none" };

/**
 * `Off` is stored as a project-level row with `isActive: false` rather than as an
 * absent row, so "explicitly off" and "never configured" stay distinguishable — they
 * lead to different UI (a stated block vs. a picker). A row with a null `projectId` is
 * the workspace default.
 */
export async function resolveMatrixDestination(
  db: PrismaClient,
  { projectId, workspaceId }: { projectId: string | null; workspaceId: string | null },
): Promise<MatrixDestination> {
  if (projectId) {
    const projectLink = await db.channelLink.findFirst({
      where: {
        projectId,
        // Scoped by workspace like every write path (bind/setOff/unbind/getBinding).
        // Without it, resolution and configuration could disagree about the same
        // project, and a row under another workspace would be honoured here.
        ...(workspaceId ? { workspaceId } : {}),
        provider: MATRIX_CHANNEL_PROVIDER,
        direction: OUTBOUND,
      },
    });

    if (projectLink) {
      // An inactive project row is the explicit "off", and it must not fall through to
      // the workspace default — that would silently defeat the whole point of Off.
      return projectLink.isActive ? { kind: "room", link: projectLink } : { kind: "off" };
    }
  }

  if (!workspaceId) return { kind: "none" };

  const workspaceLink = await db.channelLink.findFirst({
    where: {
      workspaceId,
      projectId: null,
      provider: MATRIX_CHANNEL_PROVIDER,
      direction: OUTBOUND,
      isActive: true,
    },
  });

  return workspaceLink ? { kind: "room", link: workspaceLink } : { kind: "none" };
}
