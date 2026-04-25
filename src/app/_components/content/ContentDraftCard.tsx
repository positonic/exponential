"use client";

import { useState } from "react";
import {
  Card,
  Group,
  Text,
  Badge,
  ActionIcon,
  Menu,
  Collapse,
  Button,
} from "@mantine/core";
import {
  IconDots,
  IconTrash,
  IconChevronDown,
  IconChevronUp,
  IconEdit,
  IconCheck,
  IconEye,
} from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { api } from "~/trpc/react";
import { ContentDraftEditor } from "./ContentDraftEditor";

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

interface ContentDraftCardProps {
  draft: Draft;
  workspaceId?: string;
}

const PLATFORM_COLORS: Record<string, string> = {
  BLOG: "blue",
  TWITTER: "cyan",
  LINKEDIN: "indigo",
  YOUTUBE_SCRIPT: "red",
};

const PLATFORM_LABELS: Record<string, string> = {
  BLOG: "Blog",
  TWITTER: "Twitter",
  LINKEDIN: "LinkedIn",
  YOUTUBE_SCRIPT: "YouTube",
};

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "gray",
  REVIEW: "yellow",
  APPROVED: "green",
  PUBLISHED: "teal",
  ARCHIVED: "dark",
};

export function ContentDraftCard({ draft, workspaceId }: ContentDraftCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);

  const utils = api.useUtils();

  const deleteMutation = api.content.deleteDraft.useMutation({
    onSuccess: () => {
      notifications.show({
        title: "Draft deleted",
        message: "Content draft has been removed.",
        color: "green",
      });
      void utils.content.listDrafts.invalidate();
    },
  });

  const statusMutation = api.content.updateDraft.useMutation({
    onSuccess: () => {
      void utils.content.listDrafts.invalidate();
    },
  });

  const handleStatusChange = (newStatus: string) => {
    statusMutation.mutate({ id: draft.id, status: newStatus as "DRAFT" | "REVIEW" | "APPROVED" | "PUBLISHED" | "ARCHIVED" });
  };

  return (
    <Card
      className="border border-border-primary bg-surface-secondary"
      padding="md"
      radius="md"
    >
      <Group justify="space-between" mb={expanded ? "sm" : 0}>
        <Group gap="sm">
          <Badge
            color={PLATFORM_COLORS[draft.platform] ?? "gray"}
            variant="light"
            size="sm"
          >
            {PLATFORM_LABELS[draft.platform] ?? draft.platform}
          </Badge>
          <Badge
            color={STATUS_COLORS[draft.status] ?? "gray"}
            variant="dot"
            size="sm"
          >
            {draft.status}
          </Badge>
          <Text fw={500} className="text-text-primary" lineClamp={1}>
            {draft.title}
          </Text>
        </Group>

        <Group gap="xs">
          {draft.wordCount && (
            <Text size="xs" className="text-text-muted">
              {draft.wordCount} words
            </Text>
          )}
          <Text size="xs" className="text-text-muted">
            {new Date(draft.createdAt).toLocaleDateString()}
          </Text>

          <ActionIcon
            variant="subtle"
            size="sm"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? (
              <IconChevronUp size={14} />
            ) : (
              <IconChevronDown size={14} />
            )}
          </ActionIcon>

          <Menu position="bottom-end" withinPortal>
            <Menu.Target>
              <ActionIcon variant="subtle" size="sm">
                <IconDots size={14} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item
                leftSection={<IconEdit size={14} />}
                onClick={() => {
                  setExpanded(true);
                  setEditing(true);
                }}
              >
                Edit
              </Menu.Item>
              <Menu.Item
                leftSection={<IconEye size={14} />}
                onClick={() => handleStatusChange("REVIEW")}
              >
                Mark for Review
              </Menu.Item>
              <Menu.Item
                leftSection={<IconCheck size={14} />}
                onClick={() => handleStatusChange("APPROVED")}
              >
                Approve
              </Menu.Item>
              <Menu.Divider />
              <Menu.Item
                leftSection={<IconTrash size={14} />}
                color="red"
                onClick={() => deleteMutation.mutate({ id: draft.id })}
              >
                Delete
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
      </Group>

      <Collapse in={expanded}>
        {editing ? (
          <ContentDraftEditor
            draftId={draft.id}
            initialTitle={draft.title}
            initialContent={draft.content}
            platform={draft.platform}
            onClose={() => setEditing(false)}
            workspaceId={workspaceId}
          />
        ) : (
          <div className="mt-2">
            <div className="max-h-96 overflow-y-auto rounded-md border border-border-primary bg-background-primary p-4">
              <pre className="whitespace-pre-wrap font-sans text-sm text-text-primary">
                {draft.content}
              </pre>
            </div>
            <Group mt="sm">
              <Button
                size="xs"
                variant="light"
                onClick={() => setEditing(true)}
              >
                Edit
              </Button>
              <Button
                size="xs"
                variant="subtle"
                onClick={() => {
                  void navigator.clipboard.writeText(draft.content);
                  notifications.show({
                    title: "Copied!",
                    message: "Content copied to clipboard.",
                    color: "green",
                  });
                }}
              >
                Copy to Clipboard
              </Button>
            </Group>
          </div>
        )}
      </Collapse>
    </Card>
  );
}
