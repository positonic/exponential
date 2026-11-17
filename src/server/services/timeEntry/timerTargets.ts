/**
 * What the Exponential Capture timer logs time against: a **Ticket** or a
 * **Project**, one pick. Never a Cycle, Feature or Goal. Those are derived:
 * a Ticket reaches its Feature, Epic and Product, and the Cycle is whichever
 * one the entry's timestamp falls in; a Project shows its Goals. Decided with
 * the "Log timer time against Tickets" feature (2026-11-17).
 *
 * Two reads back the plugin's single "What's this for?" picker:
 *   - `searchTimerTargets` — Tickets and Projects together, grouped; an empty
 *     query returns suggestions (my in-flight current-cycle tickets first).
 *   - `resolveTimerTarget` — the active tab's URL to a target, so the picker
 *     is usually filled before the person touches it.
 *
 * Access comes from the access service and mirrors global search
 * (`search.ts`): `buildTicketAccessWhere` (workspace membership via the
 * ticket's product; guests denied) and `buildWorkspaceProjectAccessWhere`
 * (a workspace guest sees only projects they are a member of). Anything the
 * caller can't see is simply absent: a URL for it resolves to null, never an
 * error that confirms it exists.
 */

import type { Prisma, PrismaClient } from "@prisma/client";
import { ticketDisplayId, ticketUrlId } from "~/lib/fun-ids";
import {
  buildTicketAccessWhere,
  buildWorkspaceProjectAccessWhere,
} from "~/server/services/access";
import { currentCycleWhere } from "~/plugins/product/server/currentCycle";
import { searchTicketsIdFirst } from "~/plugins/product/server/services/ticketTextSearch";
import { ticketRefWhere } from "~/plugins/product/server/services/ticketRef";

export interface TimerTarget {
  kind: "ticket" | "project";
  id: string;
  title: string;
  /** The ticket's display id (`crisp.whale`, `EXP-12`); null for a Project. */
  label: string | null;
  status: string;
  /**
   * Read-only context shown under the picker: a ticket's "Feature · Goal",
   * a project's goals. Null when there is nothing to show.
   */
  context: string | null;
  workspace: { id: string; slug: string };
  /** App-relative link to the target's page. */
  url: string;
}

export interface TimerTargetSearchResult {
  tickets: TimerTarget[];
  projects: TimerTarget[];
}

const DEFAULT_LIMIT = 8;
/** How many of the caller's latest entries are scanned for "recently timed". */
const RECENT_ENTRY_SCAN = 50;
/** In-flight first: a ticket being worked on outranks one queued for later. */
const IN_FLIGHT_ORDER = ["IN_PROGRESS", "COMMITTED"] as const;

const TICKET_TARGET_SELECT = {
  id: true,
  title: true,
  number: true,
  shortId: true,
  status: true,
  feature: { select: { name: true, goal: { select: { title: true } } } },
  product: {
    select: {
      slug: true,
      name: true,
      funTicketIds: true,
      workspace: { select: { id: true, slug: true } },
    },
  },
} satisfies Prisma.TicketSelect;

type TicketTargetRow = Prisma.TicketGetPayload<{ select: typeof TICKET_TARGET_SELECT }>;

const PROJECT_TARGET_SELECT = {
  id: true,
  name: true,
  slug: true,
  status: true,
  goals: { select: { title: true }, orderBy: { id: "asc" }, take: 3 },
  workspace: { select: { id: true, slug: true } },
} satisfies Prisma.ProjectSelect;

type ProjectTargetRow = Prisma.ProjectGetPayload<{ select: typeof PROJECT_TARGET_SELECT }>;

function toTicketTarget(t: TicketTargetRow): TimerTarget {
  const context = [t.feature?.name, t.feature?.goal?.title].filter(Boolean).join(" · ");
  const ws = t.product.workspace;
  return {
    kind: "ticket",
    id: t.id,
    title: t.title,
    label: ticketDisplayId(t.product, t),
    status: t.status,
    context: context || null,
    workspace: { id: ws.id, slug: ws.slug },
    url: `/w/${ws.slug}/products/${t.product.slug}/tickets/${t.shortId ?? ticketUrlId(t)}`,
  };
}

function toProjectTarget(p: ProjectTargetRow): TimerTarget | null {
  if (!p.workspace) return null;
  const context = p.goals.map((g) => g.title).join(" · ");
  return {
    kind: "project",
    id: p.id,
    title: p.name,
    label: null,
    status: p.status,
    context: context || null,
    workspace: { id: p.workspace.id, slug: p.workspace.slug },
    url: `/w/${p.workspace.slug}/projects/${p.slug}`,
  };
}

function isTarget(t: TimerTarget | null): t is TimerTarget {
  return t !== null;
}

/** `rows` reordered to follow `ids`; ids with no row (no access) drop out. */
function inIdOrder<T extends { id: string }>(rows: T[], ids: string[]): T[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.map((id) => byId.get(id)).filter((r): r is T => r !== undefined);
}

/** Append rows not already present, keeping first-seen order. */
function mergeUnique<T extends { id: string }>(...groups: T[][]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const group of groups) {
    for (const row of group) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      out.push(row);
    }
  }
  return out;
}

/**
 * The Tickets and Projects the caller can log time against in one workspace.
 *
 * With a query: tickets by display id, number or title (the ticket a query
 * names comes first, as everywhere else — `searchTicketsIdFirst`), projects
 * by name. Without one, suggestions in this order: the caller's tickets in
 * their product's current cycle (IN_PROGRESS, then COMMITTED); tickets and
 * projects the caller timed most recently; then the workspace's active
 * projects. Archived tickets are never offered.
 */
export async function searchTimerTargets(
  db: PrismaClient,
  userId: string,
  input: { workspaceId: string; query?: string; limit?: number; now?: Date },
): Promise<TimerTargetSearchResult> {
  const limit = input.limit ?? DEFAULT_LIMIT;
  const query = input.query?.trim() ?? "";
  const ticketScope: Prisma.TicketWhereInput = {
    AND: [
      buildTicketAccessWhere(userId),
      { product: { workspaceId: input.workspaceId } },
      { status: { not: "ARCHIVED" } },
    ],
  };
  const projectScope = await buildWorkspaceProjectAccessWhere(db, userId, input.workspaceId);

  if (query) {
    const [tickets, projects] = await Promise.all([
      searchTicketsIdFirst({
        query,
        limit,
        find: (match, take, skip = 0) =>
          db.ticket.findMany({
            where: { AND: [ticketScope, match] },
            select: TICKET_TARGET_SELECT,
            orderBy: { updatedAt: "desc" },
            take,
            ...(skip > 0 ? { skip } : {}),
          }),
        productName: (t) => t.product.name,
      }),
      db.project.findMany({
        where: { AND: [projectScope, { name: { contains: query, mode: "insensitive" } }] },
        select: PROJECT_TARGET_SELECT,
        orderBy: { name: "asc" },
        take: limit,
      }),
    ]);
    return {
      tickets: tickets.map(toTicketTarget),
      projects: projects.map(toProjectTarget).filter(isTarget),
    };
  }

  const now = input.now ?? new Date();
  const recentEntries = await db.timeEntry.findMany({
    where: {
      userId,
      workspaceId: input.workspaceId,
      action: { OR: [{ ticketId: { not: null } }, { projectId: { not: null } }] },
    },
    orderBy: { startedAt: "desc" },
    take: RECENT_ENTRY_SCAN,
    select: { action: { select: { ticketId: true, projectId: true } } },
  });
  const recentTicketIds = [
    ...new Set(recentEntries.map((e) => e.action.ticketId).filter((id): id is string => !!id)),
  ];
  const recentProjectIds = [
    ...new Set(recentEntries.map((e) => e.action.projectId).filter((id): id is string => !!id)),
  ];

  // One query per in-flight status, so a recently touched COMMITTED ticket
  // can never push an IN_PROGRESS one past the limit before ordering.
  const inCycleByStatus = Promise.all(
    IN_FLIGHT_ORDER.map((status) =>
      db.ticket.findMany({
        where: {
          AND: [
            ticketScope,
            {
              assigneeId: userId,
              status,
              cycle: { is: currentCycleWhere(input.workspaceId, now) },
            },
          ],
        },
        select: TICKET_TARGET_SELECT,
        orderBy: { updatedAt: "desc" },
        take: limit,
      }),
    ),
  );

  const [inCycleGroups, recentTickets, recentProjects, activeProjects] = await Promise.all([
    inCycleByStatus,
    recentTicketIds.length
      ? db.ticket.findMany({
          where: { AND: [ticketScope, { id: { in: recentTicketIds } }] },
          select: TICKET_TARGET_SELECT,
        })
      : Promise.resolve([]),
    recentProjectIds.length
      ? db.project.findMany({
          where: { AND: [projectScope, { id: { in: recentProjectIds } }] },
          select: PROJECT_TARGET_SELECT,
        })
      : Promise.resolve([]),
    db.project.findMany({
      where: { AND: [projectScope, { status: "ACTIVE" }] },
      select: PROJECT_TARGET_SELECT,
      orderBy: { name: "asc" },
      take: limit,
    }),
  ]);

  return {
    tickets: mergeUnique(...inCycleGroups, inIdOrder(recentTickets, recentTicketIds))
      .slice(0, limit)
      .map(toTicketTarget),
    projects: mergeUnique(inIdOrder(recentProjects, recentProjectIds), activeProjects)
      .slice(0, limit)
      .map(toProjectTarget)
      .filter(isTarget),
  };
}

/**
 * Project URLs come as the bare slug, the id, or the app's compound
 * `slug-cuid` form (`my_project-cmjoko5550000rz03x4eqvycy`) — the same three
 * forms `project.getById` accepts.
 */
function projectRefWhere(segment: string): Prisma.ProjectWhereInput {
  const cuid = /-(c[a-z0-9]{24,})$/.exec(segment)?.[1];
  return { OR: [{ id: segment }, { slug: segment }, ...(cuid ? [{ id: cuid }] : [])] };
}

export type ParsedTargetUrl =
  | { kind: "ticket"; workspaceSlug: string; productSlug: string; identifier: string }
  | { kind: "project"; workspaceSlug: string; projectSlug: string }
  /** `prUrl` is normalised: `https://github.com/<owner>/<repo>/pull/<n>`. */
  | { kind: "pullRequest"; prUrl: string };

const GITHUB_HOSTS = new Set(["github.com", "www.github.com"]);

/**
 * The target a page URL points at, before any lookup. Exponential paths are
 * matched on any host, because self-hosted installs have their own domain;
 * a look-alike path elsewhere still has to name a ticket the caller can see.
 * GitHub PR URLs lose their tab suffix (`/files`, `/commits`), query and hash.
 */
export function parseTimerTargetUrl(raw: string): ParsedTargetUrl | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;

  let segments: string[];
  try {
    segments = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  } catch {
    return null;
  }

  if (GITHUB_HOSTS.has(url.hostname.toLowerCase())) {
    const [owner, repo, pull, number] = segments;
    if (owner && repo && pull === "pull" && number && /^\d+$/.test(number)) {
      return { kind: "pullRequest", prUrl: `https://github.com/${owner}/${repo}/pull/${number}` };
    }
    return null;
  }

  const [w, workspaceSlug, section, slug, sub, identifier] = segments;
  if (w !== "w" || !workspaceSlug || !slug) return null;
  if (section === "projects") {
    return { kind: "project", workspaceSlug, projectSlug: slug };
  }
  if (section === "products" && sub === "tickets" && identifier && identifier !== "new") {
    return { kind: "ticket", workspaceSlug, productSlug: slug, identifier };
  }
  return null;
}

/**
 * The Ticket or Project the active tab is showing, or null. An Exponential
 * ticket or project page names its target; a GitHub PR resolves to the
 * ticket whose `prUrl` is that PR (most recently updated, if several).
 */
export async function resolveTimerTarget(
  db: PrismaClient,
  userId: string,
  rawUrl: string,
): Promise<TimerTarget | null> {
  const parsed = parseTimerTargetUrl(rawUrl);
  if (!parsed) return null;

  if (parsed.kind === "pullRequest") {
    const pr = parsed.prUrl;
    const ticket = await db.ticket.findFirst({
      where: {
        AND: [
          buildTicketAccessWhere(userId),
          {
            OR: [
              { prUrl: { equals: pr, mode: "insensitive" } },
              ...["/", "#", "?"].map((sep) => ({
                prUrl: { startsWith: `${pr}${sep}`, mode: "insensitive" as const },
              })),
            ],
          },
        ],
      },
      select: TICKET_TARGET_SELECT,
      orderBy: { updatedAt: "desc" },
    });
    return ticket ? toTicketTarget(ticket) : null;
  }

  if (parsed.kind === "ticket") {
    const product = await db.product.findFirst({
      where: { slug: parsed.productSlug, workspace: { slug: parsed.workspaceSlug } },
      select: { id: true },
    });
    if (!product) return null;
    const ticket = await db.ticket.findFirst({
      where: { AND: [ticketRefWhere(product.id, parsed.identifier), buildTicketAccessWhere(userId)] },
      select: TICKET_TARGET_SELECT,
    });
    return ticket ? toTicketTarget(ticket) : null;
  }

  const workspace = await db.workspace.findUnique({
    where: { slug: parsed.workspaceSlug },
    select: { id: true },
  });
  if (!workspace) return null;
  const project = await db.project.findFirst({
    where: {
      AND: [
        projectRefWhere(parsed.projectSlug),
        await buildWorkspaceProjectAccessWhere(db, userId, workspace.id),
      ],
    },
    select: PROJECT_TARGET_SELECT,
  });
  return project ? toProjectTarget(project) : null;
}
