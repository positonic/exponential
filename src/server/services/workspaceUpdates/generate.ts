/**
 * Draft one period's **Workspace update** (CONTEXT.md → Workspace update).
 *
 * claim the period → gather what shipped → rank + cap (in code) → write prose
 * for that selection only → render → create the draft Page and link it from
 * the "Updates" index → tell the reviewers. Nothing here sends or publishes:
 * that only ever follows a reviewer's approval.
 */
import { Prisma, type PrismaClient } from "@prisma/client";

import { gatherShippedWork } from "./gather";
import { createDraftPage, ensureUpdatesIndexPage, prependPageLink, replacePageContent } from "./pages";
import { renderUpdateMarkdown } from "./render";
import { resolveReviewerIds } from "./reviewers";
import { isSelectionEmpty, selectItems } from "./select";
import {
  WORKSPACE_UPDATE_STATUS,
  type UpdateSelection,
  type WorkspaceUpdateKind,
  type WrittenUpdate,
} from "./types";
import { formatWindowLabel } from "./window";
import { constrainToSelection, templateWriter, type UpdateWriter, type WriteContext } from "./writer";

export interface ReviewNotice {
  updateId: string;
  version: number;
  variant: "draft" | "empty";
  reviewerIds: string[];
  /** Left out of the notice (they asked for it). Null: every reviewer hears. */
  actorUserId: string | null;
}

export interface GenerateDeps {
  writer: UpdateWriter;
  /** Tell the reviewers a draft (or a quiet week) is waiting. */
  notify: (notice: ReviewNotice) => Promise<void>;
  /** Absolute app origin for links in the update. */
  baseUrl: string;
}

export interface GenerateInput {
  workspaceId: string;
  kind: WorkspaceUpdateKind;
  periodKey: string;
  windowStart: Date;
  windowEnd: Date;
  /** The person who asked (Generate now); null for the scheduled run. */
  actorUserId: string | null;
}

export type GenerateResult =
  | { kind: "drafted"; updateId: string; pageId: string }
  | { kind: "empty"; updateId: string }
  | { kind: "already-claimed" };

/**
 * Write prose for a selection with `writer`, falling back to the deterministic
 * template if the writer fails — a period always gets a draft to review. The
 * result is held to the selection whichever writer produced it.
 */
export async function writeForSelection(
  writer: UpdateWriter,
  selection: UpdateSelection,
  ctx: WriteContext,
): Promise<WrittenUpdate> {
  let written: WrittenUpdate;
  try {
    written = await writer.write(selection, ctx);
  } catch (err) {
    console.error("[workspaceUpdates] writer failed; using the template", err);
    written = await templateWriter.write(selection, ctx);
  }
  return constrainToSelection(written, selection);
}

export async function loadWriteContext(
  db: PrismaClient,
  workspaceId: string,
  windowStart: Date,
  windowEnd: Date,
  feedback: string | null,
): Promise<{ ctx: WriteContext; slug: string; timezone: string; config: Awaited<ReturnType<typeof loadConfig>> }> {
  const [workspace, config] = await Promise.all([
    db.workspace.findUniqueOrThrow({
      where: { id: workspaceId },
      select: { name: true, slug: true },
    }),
    loadConfig(db, workspaceId),
  ]);
  const timezone = config?.timezone ?? "UTC";
  const assistant = config?.assistantId
    ? await db.assistant.findFirst({
        where: { id: config.assistantId, workspaceId },
        select: { personality: true },
      })
    : null;
  return {
    slug: workspace.slug,
    timezone,
    config,
    ctx: {
      workspaceName: workspace.name,
      windowLabel: formatWindowLabel(windowStart, windowEnd, timezone),
      personality: assistant?.personality ?? null,
      feedback,
    },
  };
}

function loadConfig(db: PrismaClient, workspaceId: string) {
  return db.workspaceUpdateConfig.findUnique({
    where: { workspaceId },
    select: { timezone: true, reviewerIds: true, assistantId: true, indexPageId: true },
  });
}

export function moreUrl(baseUrl: string, workspaceSlug: string): string {
  return `${baseUrl}/w/${workspaceSlug}/activity`;
}

export async function generateWorkspaceUpdate(
  db: PrismaClient,
  input: GenerateInput,
  deps: GenerateDeps,
): Promise<GenerateResult> {
  // Claim first: the unique (workspaceId, kind, periodKey) makes a concurrent
  // or repeated run for the same period a no-op.
  let updateId: string;
  try {
    const row = await db.workspaceUpdate.create({
      data: {
        workspaceId: input.workspaceId,
        kind: input.kind,
        periodKey: input.periodKey,
        windowStart: input.windowStart,
        windowEnd: input.windowEnd,
        status: WORKSPACE_UPDATE_STATUS.DRAFT,
      },
      select: { id: true },
    });
    updateId = row.id;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { kind: "already-claimed" };
    }
    throw err;
  }

  try {
    const { ctx, slug, config } = await loadWriteContext(
      db,
      input.workspaceId,
      input.windowStart,
      input.windowEnd,
      null,
    );
    const reviewerIds = await resolveReviewerIds(db, input.workspaceId, config?.reviewerIds ?? []);

    const items = await gatherShippedWork(db, {
      workspaceId: input.workspaceId,
      workspaceSlug: slug,
      windowStart: input.windowStart,
      windowEnd: input.windowEnd,
      baseUrl: deps.baseUrl,
    });
    const selection = selectItems(items);

    if (isSelectionEmpty(selection)) {
      await db.workspaceUpdate.update({
        where: { id: updateId },
        data: { status: WORKSPACE_UPDATE_STATUS.EMPTY, items: selection as unknown as Prisma.InputJsonValue },
      });
      await deps.notify({ updateId, version: 1, variant: "empty", reviewerIds, actorUserId: null });
      return { kind: "empty", updateId };
    }

    const written = await writeForSelection(deps.writer, selection, ctx);
    const markdown = renderUpdateMarkdown(written, selection, { moreUrl: moreUrl(deps.baseUrl, slug) });
    const ownerId = input.actorUserId ?? reviewerIds[0];
    if (!ownerId) throw new Error(`Workspace ${input.workspaceId} has no one to own the draft`);

    const pageId = await createDraftPage(db, {
      workspaceId: input.workspaceId,
      createdById: ownerId,
      title: written.headline,
      markdown,
    });
    await db.workspaceUpdate.update({
      where: { id: updateId },
      data: {
        pageId,
        items: selection as unknown as Prisma.InputJsonValue,
        model: written.model,
      },
    });

    const indexPageId = await ensureUpdatesIndexPage(db, {
      workspaceId: input.workspaceId,
      createdById: ownerId,
      indexPageId: config?.indexPageId ?? null,
    });
    await prependPageLink(db, { indexPageId, workspaceSlug: slug, childPageId: pageId, childTitle: written.headline });

    // Everyone hears about a fresh draft, including whoever pressed "Generate
    // draft now": the review message is how the draft reaches their Matrix DM.
    await deps.notify({ updateId, version: 1, variant: "draft", reviewerIds, actorUserId: null });
    return { kind: "drafted", updateId, pageId };
  } catch (err) {
    // Release the claim so the period can be retried, unless a draft Page
    // already exists (then the row is the reviewer's to act on).
    await db.workspaceUpdate
      .deleteMany({ where: { id: updateId, pageId: null, status: WORKSPACE_UPDATE_STATUS.DRAFT } })
      .catch(() => undefined);
    throw err;
  }
}

export type RegenerateResult =
  | { kind: "regenerated"; version: number }
  | { kind: "not-draft" }
  | { kind: "conflict" };

/**
 * Rewrite a draft with a reviewer's feedback. The selection stays the one the
 * draft was written from — the reviewer is iterating on the words, not the
 * window — and the Page is replaced wholesale (the reviewer is warned that
 * their own edits go). Bumps the version, which re-notifies the other
 * reviewers; the one who asked is not pinged about their own request.
 */
export async function regenerateWorkspaceUpdate(
  db: PrismaClient,
  input: { updateId: string; feedback: string | null; actorUserId: string },
  deps: GenerateDeps,
): Promise<RegenerateResult> {
  const update = await db.workspaceUpdate.findUnique({
    where: { id: input.updateId },
    select: {
      workspaceId: true,
      status: true,
      version: true,
      pageId: true,
      items: true,
      windowStart: true,
      windowEnd: true,
    },
  });
  if (update?.status !== WORKSPACE_UPDATE_STATUS.DRAFT || !update.pageId) {
    return { kind: "not-draft" };
  }
  const selection = update.items as unknown as UpdateSelection | null;
  if (!selection?.highlights?.length) return { kind: "not-draft" };

  const feedback = input.feedback?.trim() ? input.feedback.trim() : null;
  const { ctx, slug, config } = await loadWriteContext(
    db,
    update.workspaceId,
    update.windowStart,
    update.windowEnd,
    feedback,
  );
  const written = await writeForSelection(deps.writer, selection, ctx);
  const markdown = renderUpdateMarkdown(written, selection, { moreUrl: moreUrl(deps.baseUrl, slug) });

  // Claim the new version before touching the Page, so two concurrent
  // regenerates (or an approve racing one) cannot both win.
  const { count } = await db.workspaceUpdate.updateMany({
    where: { id: input.updateId, status: WORKSPACE_UPDATE_STATUS.DRAFT, version: update.version },
    data: { version: { increment: 1 }, feedback, model: written.model },
  });
  if (count === 0) return { kind: "conflict" };

  const replaced = await replacePageContent(db, { pageId: update.pageId, title: written.headline, markdown });
  if (replaced !== "replaced") return { kind: "conflict" };

  const version = update.version + 1;
  const reviewerIds = await resolveReviewerIds(db, update.workspaceId, config?.reviewerIds ?? []);
  await deps.notify({
    updateId: input.updateId,
    version,
    variant: "draft",
    reviewerIds,
    actorUserId: input.actorUserId,
  });
  return { kind: "regenerated", version };
}
