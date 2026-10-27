/**
 * Where does this meeting's summary go?
 *
 * Since ADR-0075 this is a thin wrapper over the generic outbound resolver, pinned to
 * the Matrix provider and the `meeting_summary` kind so every existing caller and test
 * keeps its behaviour. The generic resolver is `resolveOutboundDestination` in
 * `~/server/services/outboundPosts`; this file stays so the meeting feature's seam does
 * not move until it migrates onto the primitive.
 *
 * Deliberately **not** `resolveChannelLink()` — that is the inbound direction.
 */

import type { PrismaClient } from "@prisma/client";
import {
  DEFAULT_OUTBOUND_KIND,
  type OutboundDestination,
  type OutboundKind,
} from "~/server/services/outboundPosts/types";
import { resolveOutboundDestination } from "~/server/services/outboundPosts/resolveDestinations";
import { MATRIX_CHANNEL_PROVIDER } from "./constants";

export type MatrixDestination = OutboundDestination;

/**
 * `Off` is stored as a project-level row with `isActive: false` rather than as an
 * absent row, so "explicitly off" and "never configured" stay distinguishable — they
 * lead to different UI (a stated block vs. a picker). A row with a null `projectId` is
 * the workspace default.
 */
export async function resolveMatrixDestination(
  db: PrismaClient,
  {
    projectId,
    workspaceId,
    kind = DEFAULT_OUTBOUND_KIND,
  }: { projectId: string | null; workspaceId: string | null; kind?: OutboundKind },
): Promise<MatrixDestination> {
  return resolveOutboundDestination(db, {
    workspaceId,
    projectId,
    kind,
    provider: MATRIX_CHANNEL_PROVIDER,
    // Meeting summaries shipped without the restricted-project rule and keep that
    // until they migrate onto the primitive; every other kind fails closed.
    failClosedWhenRestricted: kind !== DEFAULT_OUTBOUND_KIND,
  });
}
