/**
 * The context capability: a scope's AI instructions as agents receive them.
 *
 * `loadScopeInstructions` is the one fetch of the workspace's and project's
 * `aiInstructions` (moved out of the chat route), and `scopeInstructionsFor`
 * the one mapping onto the assembler's input. Chat and `getContext` share
 * both, so the assembled block is byte-identical on every surface.
 *
 * AI instructions are guidance, never authority (ADR-0071): the payload says
 * so, the assembler keeps them demoted `<user_data>`, and no access check
 * reads them.
 */
import crypto from "crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { formatDecisionLabel } from "~/lib/decision-label";
import { getPublicBaseUrlFromEnv } from "~/lib/urls";
import {
  buildDecisionAccessWhere,
  buildProjectAccessWhere,
  getWorkspaceMembership,
} from "~/server/services/access";
import {
  assembleScopeInstructions,
  type InstructionScope,
  type ScopeInstruction,
} from "~/server/services/ai/scopeInstructions";

export const WORKSPACE_ACCESS_DENIED_MESSAGE = "You do not have access to this workspace";
export const PROJECT_NOT_IN_WORKSPACE_MESSAGE = "That project is not in this workspace";

export interface LoadedScopeInstructions {
  workspace: {
    id: string;
    slug: string;
    name: string;
    type: string;
    description: string | null;
    aiInstructions: string | null;
  } | null;
  /** Null when no project was asked for, or the caller cannot see it. */
  project: { id: string; name: string; productId: string | null; aiInstructions: string | null } | null;
}

/**
 * Fetches the AI instructions in scope, server-side by ID (never trusted from
 * the client).
 *
 * - The workspace requires membership (direct or team-linked, through the
 *   central resolver), else FORBIDDEN.
 * - The project is read through `buildProjectAccessWhere`, so a spoofed or
 *   inaccessible `projectId` yields no project (and no text).
 * - A visible project in a different workspace than `workspaceId` is
 *   BAD_REQUEST. A legacy project with no workspace is not an error, but
 *   loads no project scope when a workspace is given.
 */
export async function loadScopeInstructions(
  db: PrismaClient,
  opts: { userId: string; workspaceId?: string | null; projectId?: string | null },
): Promise<LoadedScopeInstructions> {
  // Three independent reads, run together: this sits on the chat hot path.
  // Nothing from the workspace row or the project is returned unless the
  // membership check passes.
  const [membership, workspaceRow, row] = await Promise.all([
    opts.workspaceId ? getWorkspaceMembership(db, opts.userId, opts.workspaceId) : null,
    opts.workspaceId
      ? db.workspace.findUnique({
          where: { id: opts.workspaceId },
          select: { id: true, slug: true, name: true, type: true, description: true, aiInstructions: true },
        })
      : null,
    opts.projectId
      ? db.project.findFirst({
          where: { id: opts.projectId, ...buildProjectAccessWhere(opts.userId) },
          select: { id: true, name: true, workspaceId: true, productId: true, aiInstructions: true },
        })
      : null,
  ]);

  let workspace: LoadedScopeInstructions["workspace"] = null;
  if (opts.workspaceId) {
    // The central resolver: direct membership or a team linked to the workspace.
    if (!membership || !workspaceRow) {
      throw new TRPCError({ code: "FORBIDDEN", message: WORKSPACE_ACCESS_DENIED_MESSAGE });
    }
    workspace = workspaceRow;
  }

  let project: LoadedScopeInstructions["project"] = null;
  if (opts.projectId) {
    if (row && opts.workspaceId && row.workspaceId && row.workspaceId !== opts.workspaceId) {
      throw new TRPCError({ code: "BAD_REQUEST", message: PROJECT_NOT_IN_WORKSPACE_MESSAGE });
    }
    // A legacy project with no workspace, opened in a workspace context, is
    // not an error (chat must keep working), but it isn't in this workspace's
    // scope either, so it contributes no instructions.
    const isOutsideWorkspace = !!opts.workspaceId && row?.workspaceId == null;
    project =
      row && !isOutsideWorkspace
        ? { id: row.id, name: row.name, productId: row.productId ?? null, aiInstructions: row.aiInstructions }
        : null;
  }

  return { workspace, project };
}

/** The assembler's input, general → specific (the project wins on conflict). */
export function scopeInstructionsFor(loaded: LoadedScopeInstructions): ScopeInstruction[] {
  return [
    { scope: "workspace", label: "Workspace", instructions: loaded.workspace?.aiInstructions },
    { scope: "project", label: "Project", instructions: loaded.project?.aiInstructions },
  ];
}

/** The demoted block chat, agent runs and `getContext` all inject; null when no scope has text. */
export function assembleLoadedScope(loaded: LoadedScopeInstructions): string | null {
  return assembleScopeInstructions(scopeInstructionsFor(loaded));
}

export interface ContextInstruction {
  scope: InstructionScope;
  /** The workspace or project the text belongs to. */
  sourceId: string;
  text: string;
}

/** Most decisions listed in the context; the rest are counted in `omitted`. */
export const CONTEXT_DECISION_LIMIT = 20;

export interface ContextDecision {
  id: string;
  /** `D-0042`. */
  label: string;
  statement: string;
  /** Why it is in scope: linked to the project, or to the project's product (and no project). */
  scope: "project" | "product";
  decidedAt: string | null;
  /** The full decision (body, evidence, links) in the app. */
  url: string;
}

export interface ContextDecisions {
  /** Newest first, at most `CONTEXT_DECISION_LIMIT`. */
  items: ContextDecision[];
  /** Matching decisions left out by the cap. */
  omitted: number;
}

export interface ContextPayload {
  workspace: { id: string; slug: string; name: string };
  project: { id: string; name: string } | null;
  /** AI instructions never authorise anything (ADR-0071). */
  authority: "guidance";
  /** Scopes with no text are omitted. */
  instructions: ContextInstruction[];
  /** Byte-identical to the block chat injects; null when no scope has text. */
  assembled: string | null;
  /**
   * The project's ACCEPTED, confirmed decisions the caller may read, plus
   * project-less ones on the project's product. Statements only: fetch the
   * link for the reasoning. Like instructions, they are guidance — context
   * for the work, not permission for anything (ADR-0071). Empty without a
   * project.
   */
  decisions: ContextDecisions;
  /** `sha256:<hex>` over the source ids and texts, in order, then the listed decisions. */
  revision: string;
  generatedAt: string;
}

/** Changes when, and only when, an instruction (or its source) changes. */
export function contextRevision(instructions: ContextInstruction[], decisions?: ContextDecisions): string {
  const hash = crypto.createHash("sha256");
  for (const i of instructions) {
    hash.update(`${i.scope}:${i.sourceId.length}:${i.sourceId}\n${i.text.length}:${i.text}\n`);
  }
  // Absent or empty decisions leave the hash exactly as instructions alone make it.
  if (decisions && (decisions.items.length > 0 || decisions.omitted > 0)) {
    hash.update(`decisions:${decisions.omitted}\n`);
    for (const d of decisions.items) {
      hash.update(`${d.id.length}:${d.id}\n${d.statement.length}:${d.statement}\n`);
    }
  }
  return `sha256:${hash.digest("hex")}`;
}

/**
 * The decisions in a project's scope, read through the central decision
 * resolver (`buildDecisionAccessWhere`: confirmed only, and only rows the
 * caller could open in the Decision Log). Product decisions count only when
 * they carry no project, so another project's decisions never leak in by
 * sharing a product.
 */
export async function loadProjectDecisions(
  db: PrismaClient,
  opts: {
    userId: string;
    workspace: { id: string; slug: string };
    project: { id: string; productId: string | null };
    limit?: number;
  },
): Promise<ContextDecisions> {
  const limit = opts.limit ?? CONTEXT_DECISION_LIMIT;
  const { project } = opts;
  const where: Prisma.DecisionWhereInput = {
    AND: [
      buildDecisionAccessWhere(opts.userId, opts.workspace.id),
      { status: "ACCEPTED", reviewState: "CONFIRMED" },
      project.productId
        ? { OR: [{ projectId: project.id }, { projectId: null, productId: project.productId }] }
        : { projectId: project.id },
    ],
  };
  const [rows, total] = await Promise.all([
    db.decision.findMany({
      where,
      select: { id: true, number: true, statement: true, projectId: true, decidedAt: true },
      orderBy: [{ decidedAt: { sort: "desc", nulls: "last" } }, { number: "desc" }],
      take: limit,
    }),
    db.decision.count({ where }),
  ]);
  const list = rows ?? [];
  const base = getPublicBaseUrlFromEnv();
  return {
    items: list.map((d) => ({
      id: d.id,
      label: formatDecisionLabel(d.number),
      statement: d.statement,
      scope: d.projectId === project.id ? "project" : "product",
      decidedAt: d.decidedAt ? d.decidedAt.toISOString() : null,
      url: `${base}/w/${opts.workspace.slug}/decisions/d/${d.id}`,
    })),
    omitted: Math.max(0, (total ?? list.length) - list.length),
  };
}

export async function getContext(
  db: PrismaClient,
  opts: { userId: string; workspaceId: string; projectId?: string | null; now?: Date },
): Promise<ContextPayload> {
  const loaded = await loadScopeInstructions(db, opts);
  const workspace = loaded.workspace;
  if (!workspace) throw new TRPCError({ code: "FORBIDDEN", message: WORKSPACE_ACCESS_DENIED_MESSAGE });

  const sources: Record<InstructionScope, string | undefined> = {
    workspace: workspace.id,
    project: loaded.project?.id,
  };
  const scopes = scopeInstructionsFor(loaded);
  const instructions: ContextInstruction[] = [];
  for (const s of scopes) {
    const text = s.instructions?.trim();
    const sourceId = sources[s.scope];
    if (text && sourceId) instructions.push({ scope: s.scope, sourceId, text });
  }

  const decisions: ContextDecisions = loaded.project
    ? await loadProjectDecisions(db, { userId: opts.userId, workspace, project: loaded.project })
    : { items: [], omitted: 0 };

  return {
    workspace: { id: workspace.id, slug: workspace.slug, name: workspace.name },
    project: loaded.project ? { id: loaded.project.id, name: loaded.project.name } : null,
    authority: "guidance",
    instructions,
    assembled: assembleLoadedScope(loaded),
    decisions,
    revision: contextRevision(instructions, decisions),
    generatedAt: (opts.now ?? new Date()).toISOString(),
  };
}
