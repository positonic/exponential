"use client";

import { Container, Paper, Group, Text, Button } from "@mantine/core";
import { IconBrandGithub } from "@tabler/icons-react";
import Link from "next/link";
import { api } from "~/trpc/react";
import { useWorkspace } from "~/providers/WorkspaceProvider";

/**
 * "Connect GitHub" call-to-action on the workspace homepage (ADR-0020, slice #4).
 *
 * Visibility keys off `getGithubConnectionState` (slice #1):
 *  - Shown when state is `NOT_INSTALLED` or `NO_REPOS` — and only for
 *    owners/admins, who have the controls to act on it.
 *  - Hidden once `CONNECTED` (the workspace tracks at least one repo).
 *  - Hidden when `NOT_CONFIGURED` — don't nag with a CTA that leads nowhere;
 *    `/integrations` shows the graceful state instead.
 *  - Hidden for plain members.
 */
export function GithubConnectCta() {
  const { workspaceId, userRole } = useWorkspace();
  const isOwnerOrAdmin = userRole === "owner" || userRole === "admin";

  const { data } = api.github.getGithubConnectionState.useQuery(
    { workspaceId: workspaceId ?? "" },
    { enabled: !!workspaceId && isOwnerOrAdmin },
  );

  if (!isOwnerOrAdmin) return null;
  if (!data) return null;
  if (data.state !== "NOT_INSTALLED" && data.state !== "NO_REPOS") return null;

  return (
    <Container size="lg" className="pt-8">
      <Paper
        p="md"
        radius="md"
        className="border border-border-primary bg-surface-secondary"
      >
        <Group justify="space-between" wrap="nowrap" gap="md">
          <Group gap="md" wrap="nowrap">
            <IconBrandGithub size={24} className="text-text-primary" />
            <div>
              <Text fw={600} size="sm" className="text-text-primary">
                Connect GitHub
              </Text>
              <Text size="xs" className="text-text-secondary">
                Link your repositories to bring GitHub activity into this
                workspace.
              </Text>
            </div>
          </Group>
          <Button
            component={Link}
            href="/integrations"
            variant="filled"
            color="brand"
            size="sm"
            className="flex-shrink-0"
          >
            Connect
          </Button>
        </Group>
      </Paper>
    </Container>
  );
}
