/**
 * Deliver outbound posts. The poster's side of ADR-0075.
 *
 * A row is claimed with a lease before anything else happens, so the request-time kick
 * (`after()`) and the cron sweep can never send the same post twice. The destination is
 * resolved again at delivery time: a binding switched Off, removed, or moved since the
 * row was enqueued cancels it — enqueue recorded an intent, delivery checks it is still
 * wanted. The provider transaction id is the post id, stable across every attempt, so a
 * send that reached the homeserver but was never recorded (a timeout, a crash between
 * the PUT and the status write) is returned by the homeserver as the *same* event on the
 * next attempt rather than posted twice. Matrix has no un-send; this is the guard.
 *
 * Nothing here throws: every outcome, expected or not, is written to the row and
 * reported, and the caller gets a discriminated result. One bad post can never stall
 * the rows behind it in a sweep.
 */

import type { PrismaClient } from "@prisma/client";
import { reportHandledError } from "~/lib/reportHandledError";
import { getPublicBaseUrlFromEnv } from "~/lib/urls";
import { MatrixEncryptedRoomError } from "~/server/services/matrix/MatrixClient";
import { getProducer } from "./producers";
import { createPosters, type PosterRegistry } from "./posters";
import { resolveOutboundDestination } from "./resolveDestinations";
import { OUTBOUND_POST_STATUS, type OutboundKind } from "./types";

/** Same cap as the person-keyed pipeline's `MAX_DELIVERY_ATTEMPTS`. */
export const MAX_OUTBOUND_ATTEMPTS = 5;

/**
 * How long a claim keeps other attempts out. Longer than any function that delivers
 * can run (the cron route's 300s), so a live attempt is never overlapped; a crashed one
 * is retried once it lapses. Same reasoning as `DISTRIBUTION_LEASE_MS`.
 */
export const OUTBOUND_LEASE_MS = 15 * 60 * 1000;

/** The sweep's batch, so one busy minute cannot run the cron past its budget. */
const SWEEP_BATCH = 50;

export type DeliverOutboundPostResult =
  | { kind: "sent"; eventId: string }
  /** Another attempt holds the lease, or the row is not retryable right now. */
  | { kind: "busy" }
  /** Already sent, cancelled, exhausted, or gone. Nothing to do. */
  | { kind: "done" }
  | { kind: "cancelled"; reason: string }
  | { kind: "failed"; reason: string; terminal: boolean };

export interface DeliverDeps {
  /** Override the poster registry (tests). */
  posters?: PosterRegistry;
  baseUrl?: string;
  now?: () => Date;
}

/**
 * One transaction id per post, for every attempt. A provider that deduplicates on it
 * (Matrix does, per access token) turns any retry into the original event. There is no
 * deliberate "post again" for outbound posts — the row's unique forbids it — so nothing
 * ever needs a fresh id.
 */
export function buildOutboundTxnId(postId: string): string {
  return `expo-post-${postId}`;
}

export async function deliverOutboundPost(
  db: PrismaClient,
  postId: string,
  deps: DeliverDeps = {},
): Promise<DeliverOutboundPostResult> {
  const now = deps.now?.() ?? new Date();
  const leaseCutoff = new Date(now.getTime() - OUTBOUND_LEASE_MS);

  // Claim first. Whoever wins this update owns the attempt; everyone else sees count 0.
  const claim = await db.outboundPost.updateMany({
    where: {
      id: postId,
      status: { in: [OUTBOUND_POST_STATUS.PENDING, OUTBOUND_POST_STATUS.FAILED] },
      attempts: { lt: MAX_OUTBOUND_ATTEMPTS },
      OR: [{ attemptAt: null }, { attemptAt: { lt: leaseCutoff } }],
    },
    data: { attemptAt: now, attempts: { increment: 1 } },
  });

  if (claim.count === 0) {
    const current = await db.outboundPost.findUnique({
      where: { id: postId },
      select: { status: true, attempts: true, attemptAt: true },
    });
    if (!current) return { kind: "done" };
    if (
      current.status === OUTBOUND_POST_STATUS.SENT ||
      current.status === OUTBOUND_POST_STATUS.CANCELLED ||
      current.attempts >= MAX_OUTBOUND_ATTEMPTS
    ) {
      return { kind: "done" };
    }
    return { kind: "busy" };
  }

  const post = await db.outboundPost.findUnique({
    where: { id: postId },
    include: { channelLink: true },
  });
  if (!post) return { kind: "done" };

  const cancel = async (reason: string): Promise<DeliverOutboundPostResult> => {
    await db.outboundPost.update({
      where: { id: post.id },
      data: { status: OUTBOUND_POST_STATUS.CANCELLED, lastError: reason },
    });
    return { kind: "cancelled", reason };
  };

  const fail = async (
    error: unknown,
    reason: string,
    terminal: boolean,
  ): Promise<DeliverOutboundPostResult> => {
    await db.outboundPost.update({
      where: { id: post.id },
      data: {
        status: OUTBOUND_POST_STATUS.FAILED,
        lastError: reason,
        // A terminal failure will not improve with time; spend the remaining attempts.
        ...(terminal ? { attempts: MAX_OUTBOUND_ATTEMPTS } : {}),
      },
    });
    reportHandledError(error, {
      area: "outbound-post",
      context: {
        postId: post.id,
        kind: post.kind,
        subjectId: post.subjectId,
        event: post.event,
        provider: post.provider,
        externalId: post.externalId,
      },
    });
    return { kind: "failed", reason, terminal };
  };

  // An arrow, not a hoisted declaration, so TypeScript keeps the `post` narrowing.
  const attemptDelivery = async (): Promise<DeliverOutboundPostResult> => {
  if (!post.channelLinkId || !post.channelLink) {
    return cancel("The binding this post was enqueued for has been removed.");
  }

  const producer = getProducer(post.kind as OutboundKind);
  if (!producer) {
    return fail(new Error(`No producer for kind ${post.kind}`), `No producer for kind ${post.kind}.`, true);
  }

  const subject = await producer.load(db, post.subjectId);
  if (!subject) return cancel("The subject no longer exists.");

  // Re-resolve: Off, none, or a different room since enqueue all mean this row is no
  // longer wanted. Enqueue recorded an intent; delivery checks it still holds.
  const destination = await resolveOutboundDestination(db, {
    workspaceId: subject.workspaceId,
    projectId: subject.projectId,
    kind: post.kind as OutboundKind,
  });
  if (destination.kind === "off") return cancel("The project is switched off for this kind.");
  if (destination.kind === "none") return cancel("No destination is bound for this kind any more.");
  if (destination.link.id !== post.channelLinkId) {
    return cancel("The binding changed since this post was enqueued.");
  }

  const posters = deps.posters ?? createPosters(db);
  const poster = posters.get(post.provider);
  if (!poster) {
    return fail(new Error(`No poster for provider ${post.provider}`), `No poster for provider ${post.provider}.`, true);
  }

  const mentionUserIds = subject.mentionUserIds ?? [];
  const mentions =
    mentionUserIds.length > 0 && poster.lookupMentions
      ? await poster.lookupMentions(db, mentionUserIds)
      : new Map<string, string>();

  const message = producer.render(subject, post.event, {
    baseUrl: deps.baseUrl ?? getPublicBaseUrlFromEnv(),
    mentions,
  });

  let eventId: string;
  try {
    ({ eventId } = await poster.send(
      { link: destination.link, workspaceId: subject.workspaceId },
      message,
      { txnId: buildOutboundTxnId(post.id) },
    ));
  } catch (error) {
    // Encryption is irreversible, so no retry will help; everything else might.
    const terminal = error instanceof MatrixEncryptedRoomError;
    return fail(error, describeSendFailure(error), terminal);
  }

  await db.outboundPost.update({
    where: { id: post.id },
    data: {
      status: OUTBOUND_POST_STATUS.SENT,
      providerEventId: eventId,
      sentAt: deps.now?.() ?? new Date(),
      lastError: null,
    },
  });

  return { kind: "sent", eventId };
  };

  try {
    return await attemptDelivery();
  } catch (error) {
    // Anything unexpected — a producer choking on its subject, a status write that
    // failed — lands on the row as a retryable failure instead of escaping. The claim
    // has already spent an attempt, so a row that always throws still exhausts itself.
    try {
      return await fail(error, describeSendFailure(error), false);
    } catch (writeError) {
      reportHandledError(writeError, { area: "outbound-post", context: { postId: post.id } });
      return { kind: "failed", reason: describeSendFailure(error), terminal: false };
    }
  }
}

/**
 * The sweep: rows left `pending` by a crashed request-time kick, or `failed` under the
 * attempt cap, whose lease has lapsed. Runs from the notification cron.
 */
export async function deliverPendingOutboundPosts(
  db: PrismaClient,
  deps: DeliverDeps = {},
): Promise<{ scanned: number; sent: number; failed: number; cancelled: number }> {
  const now = deps.now?.() ?? new Date();
  const leaseCutoff = new Date(now.getTime() - OUTBOUND_LEASE_MS);

  const rows = await db.outboundPost.findMany({
    where: {
      status: { in: [OUTBOUND_POST_STATUS.PENDING, OUTBOUND_POST_STATUS.FAILED] },
      attempts: { lt: MAX_OUTBOUND_ATTEMPTS },
      OR: [{ attemptAt: null }, { attemptAt: { lt: leaseCutoff } }],
    },
    select: { id: true },
    orderBy: { createdAt: "asc" },
    take: SWEEP_BATCH,
  });

  const counts = { scanned: rows.length, sent: 0, failed: 0, cancelled: 0 };
  for (const row of rows) {
    // `deliverOutboundPost` catches its own failures; this is the guard against the
    // claim itself throwing (a database hiccup), so one row never stalls the batch.
    let result: DeliverOutboundPostResult;
    try {
      result = await deliverOutboundPost(db, row.id, deps);
    } catch (error) {
      reportHandledError(error, { area: "outbound-post-sweep", context: { postId: row.id } });
      counts.failed += 1;
      continue;
    }
    if (result.kind === "sent") counts.sent += 1;
    else if (result.kind === "failed") counts.failed += 1;
    else if (result.kind === "cancelled") counts.cancelled += 1;
  }
  return counts;
}

/**
 * What a router hands to `after()` once the producing request has returned. Each post
 * is independent, and a failure is already recorded on its row, so nothing propagates.
 */
export async function kickOutboundPosts(
  db: PrismaClient,
  postIds: readonly string[],
  deps: DeliverDeps = {},
): Promise<void> {
  await Promise.allSettled(postIds.map((id) => deliverOutboundPost(db, id, deps)));
}

/** Each cause needs a different fix, so each gets its own sentence. */
function describeSendFailure(error: unknown): string {
  if (error instanceof MatrixEncryptedRoomError) return error.message;
  if (error instanceof Error && error.message.trim()) return error.message;
  return "The message could not be sent.";
}
