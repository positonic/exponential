"use client";

import {
  ActionIcon,
  Button,
  Container,
  Group,
  Paper,
  Text,
  ThemeIcon,
} from "@mantine/core";
import { IconConfetti, IconX } from "@tabler/icons-react";
import Link from "next/link";
import { useLocalStorage } from "@mantine/hooks";
import { api } from "~/trpc/react";
import { useWorkspace } from "~/providers/WorkspaceProvider";

/**
 * "You've joined this workspace" confirmation on the workspace home, shown to
 * a recent joiner (see `workspace.getRecentJoinContext`: member, not the
 * owner, joined within the last 7 days) with a pointer at where to start.
 * Dismissal is per-workspace in localStorage — worst case the banner
 * reappears on another device inside the 7-day window, which is harmless.
 */
export function JoinedWorkspaceBanner() {
  const { workspaceId } = useWorkspace();
  if (!workspaceId) return null;
  // Keyed mount so the localStorage hook never sees its key change mid-life.
  return <JoinedWorkspaceBannerInner key={workspaceId} workspaceId={workspaceId} />;
}

function JoinedWorkspaceBannerInner({ workspaceId }: { workspaceId: string }) {
  const [dismissed, setDismissed] = useLocalStorage<boolean>({
    key: `joined-workspace-banner-dismissed:${workspaceId}`,
    defaultValue: false,
  });

  const { data } = api.workspace.getRecentJoinContext.useQuery(
    { workspaceId },
    { enabled: !dismissed },
  );

  if (dismissed || !data) return null;

  return (
    <Container size="lg" className="pt-8">
      <Paper
        p="md"
        radius="md"
        className="border border-accent-indigo/20 bg-gradient-to-r from-accent-indigo/10 to-accent-periwinkle/10"
      >
        <Group justify="space-between" wrap="nowrap" gap="md">
          <Group gap="md" wrap="nowrap">
            <ThemeIcon size="lg" radius="xl" variant="light" color="indigo">
              <IconConfetti size={18} />
            </ThemeIcon>
            <div>
              <Text fw={600} size="sm" className="text-text-primary">
                You&apos;ve joined {data.workspaceName}
              </Text>
              <Text size="xs" className="text-text-secondary">
                {data.inviterName
                  ? `${data.inviterName} invited you — start with the team's projects to see what everyone is working on.`
                  : "Start with the team's projects to see what everyone is working on."}
              </Text>
            </div>
          </Group>
          <Group gap="xs" wrap="nowrap" className="flex-shrink-0">
            <Button
              component={Link}
              href={`/w/${data.workspaceSlug}/projects`}
              variant="light"
              size="xs"
            >
              Browse projects
            </Button>
            <ActionIcon
              variant="subtle"
              size="sm"
              onClick={() => setDismissed(true)}
              aria-label="Dismiss joined-workspace banner"
            >
              <IconX size={14} />
            </ActionIcon>
          </Group>
        </Group>
      </Paper>
    </Container>
  );
}
