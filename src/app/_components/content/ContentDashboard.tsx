"use client";

import { useState } from "react";
import {
  Container,
  Title,
  Button,
  Tabs,
  Group,
  Skeleton,
  Stack,
  Text,
  SegmentedControl,
} from "@mantine/core";
import { IconPlus, IconFileText, IconHistory } from "@tabler/icons-react";
import { api } from "~/trpc/react";
import { ContentDraftList } from "./ContentDraftList";
import { GenerateContentModal } from "./GenerateContentModal";
import { PipelineRunHistory } from "./PipelineRunHistory";

interface ContentDashboardProps {
  workspaceId?: string;
  isLoading?: boolean;
}

export function ContentDashboard({
  workspaceId,
  isLoading,
}: ContentDashboardProps) {
  const [generateOpen, setGenerateOpen] = useState(false);
  const [platformFilter, setPlatformFilter] = useState<string>("all");

  const { data: draftsData, isLoading: draftsLoading } =
    api.content.listDrafts.useQuery(
      {
        workspaceId: workspaceId ?? "",
        ...(platformFilter !== "all" ? { platform: platformFilter as "BLOG" | "TWITTER" | "LINKEDIN" | "YOUTUBE_SCRIPT" } : {}),
      },
      { enabled: !!workspaceId },
    );

  if (isLoading) {
    return (
      <Container size="lg" className="py-8">
        <Stack gap="md">
          <Skeleton height={40} width={200} />
          <Skeleton height={300} />
        </Stack>
      </Container>
    );
  }

  return (
    <Container size="lg" className="py-8">
      <Group justify="space-between" mb="lg">
        <Title order={2} className="text-text-primary">
          Content
        </Title>
        <Button
          leftSection={<IconPlus size={16} />}
          onClick={() => setGenerateOpen(true)}
          variant="filled"
          color="brand"
        >
          Generate Content
        </Button>
      </Group>

      <Tabs defaultValue="drafts">
        <Tabs.List mb="md">
          <Tabs.Tab value="drafts" leftSection={<IconFileText size={16} />}>
            Drafts
          </Tabs.Tab>
          <Tabs.Tab value="history" leftSection={<IconHistory size={16} />}>
            Run History
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="drafts">
          <Group mb="md">
            <SegmentedControl
              value={platformFilter}
              onChange={setPlatformFilter}
              data={[
                { label: "All", value: "all" },
                { label: "Blog", value: "BLOG" },
                { label: "Twitter", value: "TWITTER" },
                { label: "LinkedIn", value: "LINKEDIN" },
                { label: "YouTube", value: "YOUTUBE_SCRIPT" },
              ]}
              size="xs"
            />
          </Group>

          {draftsLoading ? (
            <Stack gap="sm">
              <Skeleton height={100} />
              <Skeleton height={100} />
            </Stack>
          ) : draftsData?.drafts.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-border-primary bg-surface-secondary py-16">
              <IconFileText
                size={48}
                className="mb-4 text-text-muted"
                stroke={1.5}
              />
              <Text className="mb-2 text-text-secondary" size="lg" fw={500}>
                No content drafts yet
              </Text>
              <Text className="mb-4 text-text-muted" size="sm">
                Generate your first content from git commits
              </Text>
              <Button
                variant="light"
                onClick={() => setGenerateOpen(true)}
                leftSection={<IconPlus size={14} />}
              >
                Generate Content
              </Button>
            </div>
          ) : (
            <ContentDraftList
              drafts={draftsData?.drafts ?? []}
              workspaceId={workspaceId}
            />
          )}
        </Tabs.Panel>

        <Tabs.Panel value="history">
          <PipelineRunHistory workspaceId={workspaceId} />
        </Tabs.Panel>
      </Tabs>

      <GenerateContentModal
        opened={generateOpen}
        onClose={() => setGenerateOpen(false)}
        workspaceId={workspaceId ?? ""}
      />
    </Container>
  );
}
