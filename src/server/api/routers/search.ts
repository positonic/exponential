import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import {
  buildActionAccessWhere,
  buildKnowledgePageAccessWhere,
  buildProjectAccessWhere,
  buildTranscriptionAccessWhere,
  buildWorkspaceAccessWhere,
  buildWorkspaceVisibilityWhere,
  getWorkspaceMembership,
  isWorkspaceGuest,
} from "~/server/services/access";
import { stripHtml } from "~/lib/utils";
import { ticketUrlId } from "~/lib/fun-ids";

/**
 * Global search — the server-side equivalent of the Cmd+K palette
 * (CommandPalette.tsx), exposed so the CLI, MCP server, and other API
 * consumers get the same results the app shows. Each entity block mirrors
 * the access scoping of that entity's canonical list procedure; when adding
 * a block, copy the where-clause semantics from the router named in its
 * comment rather than inventing new scoping.
 */

export interface SearchResult {
  type:
    | "workspace"
    | "project"
    | "action"
    | "goal"
    | "keyResult"
    | "outcome"
    | "ticket"
    | "feature"
    | "epic"
    | "page"
    | "meeting"
    | "contact"
    | "organization"
    | "product";
  id: string;
  title: string;
  subtitle: string | null;
  workspace: { id: string; slug: string; name: string } | null;
  url: string | null;
}

const searchInput = z.object({
  query: z.string().trim().min(1).max(200),
  workspaceId: z.string().optional(),
  /** Max results per entity type. */
  limit: z.number().int().min(1).max(25).default(10),
});

type SearchArgs = {
  db: PrismaClient;
  userId: string;
  q: string;
  workspaceId?: string;
  limit: number;
};

const insensitive = (q: string) => ({ contains: q, mode: "insensitive" as const });

// Mirrors workspace.list (buildWorkspaceVisibilityWhere).
async function searchWorkspaces({ db, userId, q, limit }: SearchArgs): Promise<SearchResult[]> {
  const workspaces = await db.workspace.findMany({
    where: { AND: [buildWorkspaceVisibilityWhere(userId), { name: insensitive(q) }] },
    select: { id: true, name: true, slug: true },
    take: limit,
  });
  return workspaces.map((w) => ({
    type: "workspace",
    id: w.id,
    title: w.name,
    subtitle: null,
    workspace: { id: w.id, slug: w.slug, name: w.name },
    url: `/w/${w.slug}/home`,
  }));
}

// Mirrors project.getAll (buildProjectAccessWhere, guest scope when
// workspace-scoped).
async function searchProjects({ db, userId, q, workspaceId, limit }: SearchArgs): Promise<SearchResult[]> {
  const isGuest = workspaceId ? await isWorkspaceGuest(db, userId, workspaceId) : false;
  const accessWhere = isGuest
    ? { projectMembers: { some: { userId } } }
    : buildProjectAccessWhere(userId);

  const projects = await db.project.findMany({
    where: {
      ...(workspaceId ? { workspaceId } : {}),
      ...accessWhere,
      name: insensitive(q),
    },
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      workspace: { select: { id: true, slug: true, name: true } },
    },
    take: limit,
  });
  return projects.map((p) => ({
    type: "project",
    id: p.id,
    title: p.name,
    subtitle: p.status,
    workspace: p.workspace,
    url: p.workspace ? `/w/${p.workspace.slug}/projects/${p.slug}` : null,
  }));
}

// Mirrors action.searchByTitle: the canonical bulk resolver
// (buildActionAccessWhere) rather than getAll's deliberately personal scope —
// per the access-control rule that bulk permission scoping goes through the
// centralized resolver. Matches on the raw name (names can contain HTML; the
// stored markup is stripped from the returned title, so a query can in rare
// cases match markup that is not visible in the title).
async function searchActions({ db, userId, q, workspaceId, limit }: SearchArgs): Promise<SearchResult[]> {
  const actions = await db.action.findMany({
    where: {
      ...buildActionAccessWhere(userId),
      ...(workspaceId
        ? { AND: [{ OR: [{ workspaceId }, { project: { workspaceId } }] }] }
        : {}),
      status: { notIn: ["DELETED", "DRAFT"] },
      name: insensitive(q),
    },
    select: {
      id: true,
      name: true,
      kanbanStatus: true,
      workspace: { select: { id: true, slug: true, name: true } },
      project: {
        select: {
          name: true,
          workspace: { select: { id: true, slug: true, name: true } },
        },
      },
    },
    take: limit,
  });
  return actions.map((a) => {
    const workspace = a.workspace ?? a.project?.workspace ?? null;
    return {
      type: "action" as const,
      id: a.id,
      title: stripHtml(a.name),
      subtitle: a.project?.name ?? a.kanbanStatus,
      workspace,
      url: workspace ? `/w/${workspace.slug}/actions/${a.id}` : null,
    };
  });
}

// Mirrors goal.getAllMyGoals: all goals of workspaces the caller belongs to,
// plus personally-owned goals when searching across workspaces.
async function searchGoals({ db, userId, q, workspaceId, limit }: SearchArgs): Promise<SearchResult[]> {
  if (workspaceId) {
    const membership = await getWorkspaceMembership(db, userId, workspaceId);
    if (!membership) return [];
  }
  const goals = await db.goal.findMany({
    where: {
      ...(workspaceId
        ? { workspaceId }
        : {
            // Strict membership (direct or team), matching the
            // getWorkspaceMembership gate — guests don't see workspace goals.
            OR: [
              { userId },
              { workspace: { is: buildWorkspaceAccessWhere(userId) } },
            ],
          }),
      title: insensitive(q),
    },
    select: {
      id: true,
      title: true,
      status: true,
      workspace: { select: { id: true, slug: true, name: true } },
    },
    take: limit,
  });
  return goals.map((g) => ({
    type: "goal",
    id: String(g.id),
    title: g.title,
    subtitle: g.status,
    workspace: g.workspace,
    url: g.workspace ? `/w/${g.workspace.slug}/goals/${g.id}` : null,
  }));
}

// Mirrors okr.getByObjective's workspace mode: all workspace OKRs are visible
// to members; otherwise personally-owned key results.
async function searchKeyResults({ db, userId, q, workspaceId, limit }: SearchArgs): Promise<SearchResult[]> {
  if (workspaceId) {
    const membership = await getWorkspaceMembership(db, userId, workspaceId);
    if (!membership) return [];
  }
  const keyResults = await db.keyResult.findMany({
    where: {
      ...(workspaceId
        ? { workspaceId }
        : {
            OR: [
              { userId },
              { workspace: { is: buildWorkspaceAccessWhere(userId) } },
            ],
          }),
      title: insensitive(q),
    },
    select: {
      id: true,
      title: true,
      workspace: { select: { id: true, slug: true, name: true } },
    },
    take: limit,
  });
  return keyResults.map((kr) => ({
    type: "keyResult",
    id: kr.id,
    title: kr.title,
    subtitle: null,
    workspace: kr.workspace,
    // Deep link into the OKR drawer, as FavouritesNav does.
    url: kr.workspace ? `/w/${kr.workspace.slug}/goals?tab=okrs&drawer=keyResult:${kr.id}` : null,
  }));
}

// Mirrors outcome list scoping: strictly owner-scoped (no workspace-wide
// sharing on the canonical list).
async function searchOutcomes({ db, userId, q, workspaceId, limit }: SearchArgs): Promise<SearchResult[]> {
  const outcomes = await db.outcome.findMany({
    where: {
      userId,
      ...(workspaceId ? { workspaceId } : {}),
      description: insensitive(q),
    },
    select: {
      id: true,
      description: true,
      type: true,
      workspace: { select: { id: true, slug: true, name: true } },
    },
    take: limit,
  });
  return outcomes.map((o) => ({
    type: "outcome",
    id: o.id,
    title: o.description,
    subtitle: o.type,
    workspace: o.workspace,
    url: o.workspace ? `/w/${o.workspace.slug}/outcomes` : null,
  }));
}

// Mirrors ticket.list's assertWorkspaceMember gate (direct or team-based
// workspace membership via the ticket's product; guests denied).
async function searchTickets({ db, userId, q, workspaceId, limit }: SearchArgs): Promise<SearchResult[]> {
  const tickets = await db.ticket.findMany({
    where: {
      product: {
        ...(workspaceId ? { workspaceId } : {}),
        workspace: { is: buildWorkspaceAccessWhere(userId) },
      },
      OR: [
        { title: insensitive(q) },
        { shortId: insensitive(q) },
        // An all-digits query also matches the ticket's sequential number.
        ...(/^\d+$/.test(q) && parseInt(q, 10) > 0
          ? [{ number: parseInt(q, 10) }]
          : []),
      ],
    },
    select: {
      id: true,
      title: true,
      number: true,
      shortId: true,
      status: true,
      product: {
        select: { slug: true, workspace: { select: { id: true, slug: true, name: true } } },
      },
    },
    take: limit,
  });
  return tickets.map((t) => ({
    type: "ticket",
    id: t.id,
    title: t.title,
    subtitle: `${t.shortId ?? (t.number > 0 ? `#${t.number}` : "")} ${t.status}`.trim(),
    workspace: t.product.workspace,
    url: `/w/${t.product.workspace.slug}/products/${t.product.slug}/tickets/${t.shortId ?? ticketUrlId(t)}`,
  }));
}

// Same workspace-membership-via-product gate as tickets.
async function searchFeatures({ db, userId, q, workspaceId, limit }: SearchArgs): Promise<SearchResult[]> {
  const features = await db.feature.findMany({
    where: {
      product: {
        ...(workspaceId ? { workspaceId } : {}),
        workspace: { is: buildWorkspaceAccessWhere(userId) },
      },
      name: insensitive(q),
    },
    select: {
      id: true,
      name: true,
      status: true,
      product: {
        select: { slug: true, workspace: { select: { id: true, slug: true, name: true } } },
      },
    },
    take: limit,
  });
  return features.map((f) => ({
    type: "feature",
    id: f.id,
    title: f.name,
    subtitle: f.status,
    workspace: f.product.workspace,
    url: `/w/${f.product.workspace.slug}/products/${f.product.slug}/features/${f.id}`,
  }));
}

// Mirrors the epic router's gate: direct or team-based workspace membership
// (getWorkspaceMembership; guests denied).
async function searchEpics({ db, userId, q, workspaceId, limit }: SearchArgs): Promise<SearchResult[]> {
  const epics = await db.epic.findMany({
    where: {
      ...(workspaceId ? { workspaceId } : {}),
      workspace: { is: buildWorkspaceAccessWhere(userId) },
      name: insensitive(q),
    },
    select: {
      id: true,
      name: true,
      status: true,
      workspace: { select: { id: true, slug: true, name: true } },
    },
    take: limit,
  });
  return epics.map((e) => ({
    type: "epic",
    id: e.id,
    title: e.name,
    subtitle: e.status,
    workspace: e.workspace,
    // Epics have no dedicated detail route; they surface inside kanban views.
    url: null,
  }));
}

// Mirrors page.list (buildKnowledgePageAccessWhere, ADR-0033).
async function searchPages({ db, userId, q, workspaceId, limit }: SearchArgs): Promise<SearchResult[]> {
  const pages = await db.knowledgePage.findMany({
    where: {
      AND: [
        buildKnowledgePageAccessWhere(userId),
        ...(workspaceId ? [{ workspaceId }] : []),
        { title: insensitive(q) },
      ],
    },
    select: {
      id: true,
      title: true,
      workspace: { select: { id: true, slug: true, name: true } },
    },
    take: limit,
  });
  return pages.map((p) => ({
    type: "page",
    id: p.id,
    title: p.title,
    subtitle: null,
    workspace: p.workspace,
    url: `/w/${p.workspace.slug}/pages/${p.id}`,
  }));
}

// Mirrors transcription list (buildTranscriptionAccessWhere), unarchived only.
async function searchMeetings({ db, userId, q, workspaceId, limit }: SearchArgs): Promise<SearchResult[]> {
  const sessions = await db.transcriptionSession.findMany({
    where: {
      AND: [
        buildTranscriptionAccessWhere(userId),
        { archivedAt: null },
        ...(workspaceId ? [{ OR: [{ workspaceId }, { project: { workspaceId } }] }] : []),
        { title: insensitive(q) },
      ],
    },
    select: {
      id: true,
      title: true,
      workspace: { select: { id: true, slug: true, name: true } },
      project: { select: { workspace: { select: { id: true, slug: true, name: true } } } },
    },
    take: limit,
  });
  return sessions.map((s) => ({
    type: "meeting",
    id: s.id,
    title: s.title ?? "Untitled meeting",
    subtitle: null,
    workspace: s.workspace ?? s.project?.workspace ?? null,
    url: `/recording/${s.id}`,
  }));
}

// Mirrors the CRM routers' gate: DIRECT workspace membership only.
async function searchContacts({ db, userId, q, workspaceId, limit }: SearchArgs): Promise<SearchResult[]> {
  const contacts = await db.crmContact.findMany({
    where: {
      ...(workspaceId ? { workspaceId } : {}),
      workspace: { members: { some: { userId } } },
      OR: [{ firstName: insensitive(q) }, { lastName: insensitive(q) }],
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      workspace: { select: { id: true, slug: true, name: true } },
    },
    take: limit,
  });
  return contacts.map((c) => ({
    type: "contact",
    id: c.id,
    title: [c.firstName, c.lastName].filter(Boolean).join(" ") || "Unnamed contact",
    subtitle: null,
    workspace: c.workspace,
    url: `/w/${c.workspace.slug}/crm/contacts/${c.id}`,
  }));
}

// Same direct-membership gate as contacts.
async function searchOrganizations({ db, userId, q, workspaceId, limit }: SearchArgs): Promise<SearchResult[]> {
  const organizations = await db.crmOrganization.findMany({
    where: {
      ...(workspaceId ? { workspaceId } : {}),
      workspace: { members: { some: { userId } } },
      name: insensitive(q),
    },
    select: {
      id: true,
      name: true,
      industry: true,
      workspace: { select: { id: true, slug: true, name: true } },
    },
    take: limit,
  });
  return organizations.map((o) => ({
    type: "organization",
    id: o.id,
    title: o.name,
    subtitle: o.industry,
    workspace: o.workspace,
    url: `/w/${o.workspace.slug}/crm/organizations/${o.id}`,
  }));
}

// Mirrors product.list's assertWorkspaceMember gate (direct or team-based).
async function searchProducts({ db, userId, q, workspaceId, limit }: SearchArgs): Promise<SearchResult[]> {
  const products = await db.product.findMany({
    where: {
      ...(workspaceId ? { workspaceId } : {}),
      workspace: { is: buildWorkspaceAccessWhere(userId) },
      name: insensitive(q),
    },
    select: {
      id: true,
      name: true,
      slug: true,
      workspace: { select: { id: true, slug: true, name: true } },
    },
    take: limit,
  });
  return products.map((p) => ({
    type: "product",
    id: p.id,
    title: p.name,
    subtitle: null,
    workspace: p.workspace,
    url: `/w/${p.workspace.slug}/products/${p.slug}`,
  }));
}

export const searchRouter = createTRPCRouter({
  global: protectedProcedure.input(searchInput).query(async ({ ctx, input }) => {
    const args: SearchArgs = {
      db: ctx.db,
      userId: ctx.session.user.id,
      q: input.query,
      workspaceId: input.workspaceId,
      limit: input.limit,
    };

    const groups = await Promise.all([
      searchWorkspaces(args),
      searchProjects(args),
      searchActions(args),
      searchGoals(args),
      searchKeyResults(args),
      searchOutcomes(args),
      searchTickets(args),
      searchFeatures(args),
      searchEpics(args),
      searchPages(args),
      searchMeetings(args),
      searchContacts(args),
      searchOrganizations(args),
      searchProducts(args),
    ]);

    return {
      query: input.query,
      results: groups.flat(),
    };
  }),
});
