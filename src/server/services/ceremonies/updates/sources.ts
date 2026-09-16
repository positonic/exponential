/**
 * The activity a participant's standup answers are drafted from (ADR-0059,
 * V3): their Actions, the tickets that moved under them, and the commits they
 * pushed, each rendered as Markdown bullet lines.
 *
 * Every line names a record that exists (ADR-0007) — these are queries, not a
 * generated account of someone's day. A source with nothing in the window
 * returns no lines, and the question it feeds drafts empty.
 */
import type { PrismaClient, Prisma } from "@prisma/client";

/** Per-source caps: a standup answer nobody reads is as useless as an empty one. */
const COMPLETED_ACTION_LIMIT = 20;
const OPEN_ACTION_LIMIT = 8;
const TICKET_MOVE_LIMIT = 20;
const COMMIT_LIMIT = 20;
/** Activity rows scanned to find this participant's ticket moves. */
const TICKET_EVENT_SCAN_LIMIT = 300;

export interface ActivityWindow {
  workspaceId: string;
  userId: string;
  /** Start of the window: the previous occurrence's start, or null for the first. */
  since: Date | null;
  /** This occurrence's start; later activity belongs to the next update. */
  until: Date;
  /** Narrows Actions to the ceremony's project when it has one. */
  projectId?: string | null;
}

const dateFmt: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
const humanStatus = (status: string) => status.replace(/_/g, " ").toLowerCase();

function assignedActions(window: ActivityWindow): Prisma.ActionWhereInput {
  return {
    workspaceId: window.workspaceId,
    assignees: { some: { userId: window.userId } },
    ...(window.projectId ? { projectId: window.projectId } : {}),
  };
}

export async function completedActionLines(db: PrismaClient, window: ActivityWindow): Promise<string[]> {
  const actions = await db.action.findMany({
    where: {
      ...assignedActions(window),
      completedAt: { ...(window.since ? { gt: window.since } : {}), lte: window.until },
    },
    select: { id: true, name: true },
    orderBy: { completedAt: "asc" },
    take: COMPLETED_ACTION_LIMIT,
  });
  return actions.map((a) => a.name);
}

export async function openActionLines(db: PrismaClient, window: ActivityWindow): Promise<string[]> {
  const actions = await db.action.findMany({
    where: { ...assignedActions(window), status: "ACTIVE" },
    select: { id: true, name: true, dueDate: true },
    orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
    take: OPEN_ACTION_LIMIT,
  });
  return actions.map((a) => (a.dueDate ? `${a.name} (due ${a.dueDate.toLocaleDateString("en-GB", dateFmt)})` : a.name));
}

/**
 * Tickets that changed status in the window and are assigned to the
 * participant now. The activity log records who *made* the change, not who
 * owned the ticket at the time, so "assigned to them now" is the closest
 * honest answer — a ticket reassigned away since the move drops out, which is
 * the right side to err on for something the participant reads aloud.
 */
export async function ticketMoveLines(db: PrismaClient, window: ActivityWindow): Promise<string[]> {
  const events = await db.workspaceActivityEvent.findMany({
    where: {
      workspaceId: window.workspaceId,
      entityType: "ticket",
      action: "status_changed",
      createdAt: { ...(window.since ? { gt: window.since } : {}), lte: window.until },
    },
    select: { entityId: true, metadata: true, createdAt: true },
    orderBy: { createdAt: "asc" },
    take: TICKET_EVENT_SCAN_LIMIT,
  });
  if (events.length === 0) return [];

  const tickets = await db.ticket.findMany({
    where: { id: { in: Array.from(new Set(events.map((e) => e.entityId))) }, assigneeId: window.userId },
    select: { id: true, shortId: true, number: true, title: true },
  });
  if (tickets.length === 0) return [];
  const byId = new Map(tickets.map((t) => [t.id, t]));

  // One line per ticket, carrying the whole journey: a ticket that went
  // backlog → in progress → in review in the window reads as one move.
  const firstFrom = new Map<string, string>();
  const lastTo = new Map<string, string>();
  for (const event of events) {
    if (!byId.has(event.entityId)) continue;
    const meta = event.metadata as { from?: unknown; to?: unknown } | null;
    if (typeof meta?.from === "string" && !firstFrom.has(event.entityId)) firstFrom.set(event.entityId, meta.from);
    if (typeof meta?.to === "string") lastTo.set(event.entityId, meta.to);
  }

  const lines: string[] = [];
  for (const [ticketId, to] of lastTo) {
    const ticket = byId.get(ticketId);
    if (!ticket) continue;
    const from = firstFrom.get(ticketId);
    const label = ticket.shortId ?? `#${ticket.number}`;
    const move = from && from !== to ? `${humanStatus(from)} → ${humanStatus(to)}` : humanStatus(to);
    lines.push(`${label} ${ticket.title} (${move})`);
    if (lines.length >= TICKET_MOVE_LIMIT) break;
  }
  return lines;
}

/**
 * The participant's commits, matched through the GitHub login on their own
 * workspace integration. Without that mapping there is no honest way to tell
 * whose commit is whose, so someone who has not connected GitHub simply gets
 * no commit lines rather than someone else's work.
 */
export async function commitLines(db: PrismaClient, window: ActivityWindow): Promise<string[]> {
  const login = await resolveGithubLogin(db, window.workspaceId, window.userId);
  if (!login) return [];
  const commits = await db.gitHubActivity.findMany({
    where: {
      workspaceId: window.workspaceId,
      eventType: "push",
      commitAuthor: { equals: login, mode: "insensitive" },
      eventTimestamp: { ...(window.since ? { gt: window.since } : {}), lte: window.until },
    },
    select: { commitSha: true, commitMessage: true },
    orderBy: { eventTimestamp: "asc" },
    take: COMMIT_LIMIT,
  });
  return commits
    .map((c) => {
      const message = c.commitMessage?.split("\n")[0]?.trim();
      if (!message) return null;
      return c.commitSha ? `\`${c.commitSha}\` ${message}` : message;
    })
    .filter((line): line is string => line !== null);
}

/** The participant's GitHub username, from the metadata on their own integration. */
export async function resolveGithubLogin(
  db: PrismaClient,
  workspaceId: string,
  userId: string,
): Promise<string | null> {
  const integration = await db.integration.findFirst({
    where: { workspaceId, provider: "github", userId },
    orderBy: { updatedAt: "desc" },
    select: { credentials: { where: { keyType: "github_metadata" }, select: { key: true }, take: 1 } },
  });
  const raw = integration?.credentials[0]?.key;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { githubUsername?: unknown };
    return typeof parsed.githubUsername === "string" && parsed.githubUsername.length > 0
      ? parsed.githubUsername
      : null;
  } catch {
    // A metadata blob we can't read is not worth failing a standup draft over.
    return null;
  }
}
