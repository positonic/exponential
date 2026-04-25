"use client";

import { Stack } from "@mantine/core";
import { ContentDraftCard } from "./ContentDraftCard";

interface Draft {
  id: string;
  title: string;
  content: string;
  platform: string;
  status: string;
  wordCount: number | null;
  createdAt: Date;
  assistant: { name: string; emoji: string | null } | null;
  pipelineRun: { id: string; status: string; startedAt: Date } | null;
}

interface ContentDraftListProps {
  drafts: Draft[];
  workspaceId?: string;
}

export function ContentDraftList({ drafts, workspaceId }: ContentDraftListProps) {
  return (
    <Stack gap="sm">
      {drafts.map((draft) => (
        <ContentDraftCard
          key={draft.id}
          draft={draft}
          workspaceId={workspaceId}
        />
      ))}
    </Stack>
  );
}
