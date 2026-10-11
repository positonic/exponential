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
import type { PrismaClient } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { buildProjectAccessWhere } from "~/server/services/access";
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
  project: { id: string; name: string; aiInstructions: string | null } | null;
}

/**
 * Fetches the AI instructions in scope, server-side by ID (never trusted from
 * the client).
 *
 * - The workspace requires direct membership, else FORBIDDEN.
 * - The project is read through `buildProjectAccessWhere`, so a spoofed or
 *   inaccessible `projectId` yields no project (and no text).
 * - A visible project that is not in `workspaceId` is BAD_REQUEST.
 */
export async function loadScopeInstructions(
  db: PrismaClient,
  opts: { userId: string; workspaceId?: string | null; projectId?: string | null },
): Promise<LoadedScopeInstructions> {
  let workspace: LoadedScopeInstructions["workspace"] = null;
  if (opts.workspaceId) {
    const membership = await db.workspaceUser.findFirst({
      where: { workspaceId: opts.workspaceId, userId: opts.userId },
      include: {
        workspace: {
          select: { id: true, slug: true, name: true, type: true, description: true, aiInstructions: true },
        },
      },
    });
    if (!membership) throw new TRPCError({ code: "FORBIDDEN", message: WORKSPACE_ACCESS_DENIED_MESSAGE });
    workspace = membership.workspace;
  }

  let project: LoadedScopeInstructions["project"] = null;
  if (opts.projectId) {
    const row = await db.project.findFirst({
      where: { id: opts.projectId, ...buildProjectAccessWhere(opts.userId) },
      select: { id: true, name: true, workspaceId: true, aiInstructions: true },
    });
    if (row && opts.workspaceId && row.workspaceId !== opts.workspaceId) {
      throw new TRPCError({ code: "BAD_REQUEST", message: PROJECT_NOT_IN_WORKSPACE_MESSAGE });
    }
    project = row ? { id: row.id, name: row.name, aiInstructions: row.aiInstructions } : null;
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

export interface ContextInstruction {
  scope: InstructionScope;
  /** The workspace or project the text belongs to. */
  sourceId: string;
  text: string;
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
  /** `sha256:<hex>` over the source ids and texts, in order. */
  revision: string;
  generatedAt: string;
}

/** Changes when, and only when, an instruction (or its source) changes. */
export function contextRevision(instructions: ContextInstruction[]): string {
  const hash = crypto.createHash("sha256");
  for (const i of instructions) {
    hash.update(`${i.scope}:${i.sourceId.length}:${i.sourceId}\n${i.text.length}:${i.text}\n`);
  }
  return `sha256:${hash.digest("hex")}`;
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

  return {
    workspace: { id: workspace.id, slug: workspace.slug, name: workspace.name },
    project: loaded.project ? { id: loaded.project.id, name: loaded.project.name } : null,
    authority: "guidance",
    instructions,
    assembled: assembleScopeInstructions(scopes),
    revision: contextRevision(instructions),
    generatedAt: (opts.now ?? new Date()).toISOString(),
  };
}
