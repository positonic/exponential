/**
 * Outbound posts: the destination-keyed sibling of the notification pipeline
 * (ADR-0075). A Notification goes to a *person* through their channel preferences;
 * an outbound post goes to a *place* — a room or a channel — that a workspace bound.
 *
 * Three roles:
 * - a **producer** has something to say (decisions first): it loads its subject, says
 *   which scope it belongs to, and renders a message for an event;
 * - a **destination** is an outbound `ChannelLink` row of the producer's kind;
 * - a **poster** is one per provider and takes a rendered message to a destination.
 *
 * Producers never contact a provider: they emit `OutboundPost` rows (`emit.ts`), the
 * request kicks delivery after it completes, and the notification cron sweeps retries.
 */

import type { ChannelLink, PrismaClient } from "@prisma/client";

/** Which producer's content an outbound binding carries. Stored on `ChannelLink.kind`. */
export const OUTBOUND_KINDS = [
  "meeting_summary",
  "decision",
  "workspace_update",
  "agenda",
] as const;

export type OutboundKind = (typeof OUTBOUND_KINDS)[number];

/** The column default — every binding that predates `kind` is a meeting-summary one. */
export const DEFAULT_OUTBOUND_KIND: OutboundKind = "meeting_summary";

export const OUTBOUND_POST_STATUS = {
  PENDING: "pending",
  SENT: "sent",
  FAILED: "failed",
  /** The destination went Off or away between enqueue and delivery. Terminal. */
  CANCELLED: "cancelled",
} as const;

export type OutboundPostStatus =
  (typeof OUTBOUND_POST_STATUS)[keyof typeof OUTBOUND_POST_STATUS];

/** Every provider gets a format it can use; a poster picks the one it wants. */
export interface RenderedMessage {
  html: string;
  text: string;
  markdown: string;
}

export interface RenderContext {
  /** Absolute origin for links back into the app. */
  baseUrl: string;
  /** userId → provider identity (an MXID, a Slack member id) for the people to mention. */
  mentions: ReadonlyMap<string, string>;
}

/** What every producer's loaded subject must say about itself. */
export interface OutboundSubject {
  workspaceId: string;
  /** Null for a workspace-wide subject; resolution then uses the workspace default. */
  projectId: string | null;
  /** User ids the renderer may want to mention; the poster resolves identities. */
  mentionUserIds?: readonly string[];
}

export interface Producer<S extends OutboundSubject = OutboundSubject> {
  kind: OutboundKind;
  /** Null when the subject no longer exists; the post is then cancelled. */
  load(db: PrismaClient, subjectId: string): Promise<S | null>;
  render(subject: S, event: string, ctx: RenderContext): RenderedMessage;
}

export interface OutboundDestinationRoom {
  kind: "room";
  link: ChannelLink;
}

export type OutboundDestination =
  | OutboundDestinationRoom
  /** The project is explicitly switched off for this kind. Hard stop. */
  | { kind: "off" }
  /** Nothing configured for this kind at this scope or the workspace. */
  | { kind: "none" };

export interface RoomPoster {
  provider: string;
  send(
    destination: { link: ChannelLink; workspaceId: string },
    message: RenderedMessage,
    opts: { txnId: string; mentions: readonly string[] },
  ): Promise<{ eventId: string }>;
  /** userId → identity on this provider, for the users the producer wants to mention. */
  lookupMentions?(db: PrismaClient, userIds: readonly string[]): Promise<Map<string, string>>;
}
