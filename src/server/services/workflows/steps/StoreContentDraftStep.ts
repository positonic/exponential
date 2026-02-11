import { type PrismaClient } from "@prisma/client";
import { type IStepExecutor, type StepContext } from "./IStepExecutor";

interface DraftInput {
  title: string;
  content: string;
  platform: string;
  wordCount: number;
}

export class StoreContentDraftStep implements IStepExecutor {
  type = "store_content_draft";
  label = "Save content drafts";

  constructor(private db: PrismaClient) {}

  async execute(
    input: Record<string, unknown>,
    _config: Record<string, unknown>,
    context: StepContext,
  ): Promise<Record<string, unknown>> {
    const drafts = input.drafts as DraftInput[] | undefined;
    const assistantId = input.assistantId as string | undefined;
    const tone = input.tone as string | undefined;

    if (!drafts || drafts.length === 0) {
      return { draftIds: [], draftCount: 0 };
    }

    const draftIds: string[] = [];

    for (const draft of drafts) {
      const created = await this.db.contentDraft.create({
        data: {
          workspaceId: context.workspaceId,
          createdById: context.userId,
          pipelineRunId: context.runId,
          title: draft.title,
          content: draft.content,
          platform: draft.platform,
          status: "DRAFT",
          wordCount: draft.wordCount,
          assistantId,
          tone,
        },
      });
      draftIds.push(created.id);
    }

    return {
      draftIds,
      draftCount: draftIds.length,
    };
  }
}
