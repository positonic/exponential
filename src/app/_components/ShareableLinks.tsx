"use client";

import { useState } from "react";
import { 
  Paper, 
  Title, 
  Text, 
  Group, 
  Stack, 
  ActionIcon, 
  Tooltip,
  Badge,
  Alert
} from "@mantine/core";
import { IconCopy, IconExternalLink, IconEye, IconEyeOff } from "@tabler/icons-react";
import { api } from "~/trpc/react";
import { notifications } from "@mantine/notifications";

export function ShareableLinks() {
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  
  // Get the user's teams where sharing is enabled
  const { data: sharedTeams, isLoading } = api.weeklyReview.getSharedTeams.useQuery();
  
  const copyToClipboard = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedUrl(url);
      notifications.show({
        title: 'Link copied!',
        message: 'The shareable link has been copied to your clipboard',
        color: 'green',
      });
      
      // Reset the copied state after 2 seconds
      setTimeout(() => setCopiedUrl(null), 2000);
    } catch {
      notifications.show({
        title: 'Copy failed',
        message: 'Failed to copy link to clipboard',
        color: 'red',
      });
    }
  };

  if (isLoading) {
    return (
      <Paper p="lg" withBorder radius="md" className="bg-surface-secondary">
        <Text size="sm" className="text-text-secondary">Loading shared links...</Text>
      </Paper>
    );
  }

  if (!sharedTeams || sharedTeams.length === 0) {
    return (
      <Paper p="lg" withBorder radius="md" className="bg-surface-secondary">
        <Group justify="space-between" align="flex-start">
          <div>
            <Title order={4} className="text-text-primary" mb="xs">
              Weekly Review Sharing
            </Title>
            <Text size="sm" className="text-text-secondary">
              Your weekly review is not currently shared with any organization teams.
            </Text>
          </div>
          <Badge variant="light" color="gray" leftSection={<IconEyeOff size={14} />}>
            Private
          </Badge>
        </Group>
        <Alert color="blue" mt="md" variant="light">
          <Text size="sm">
            To share your weekly review with team members, go to Sharing Settings and enable sharing for your organization teams.
          </Text>
        </Alert>
      </Paper>
    );
  }

  return (
    <Paper p="lg" withBorder radius="md" className="bg-surface-secondary">
      <Group justify="space-between" align="flex-start" mb="md">
        <div>
          <Title order={4} className="text-text-primary" mb="xs">
            Weekly Review Sharing
          </Title>
          <Text size="sm" className="text-text-secondary">
            Your weekly review is shared with the following teams:
          </Text>
        </div>
        <Badge variant="light" color="green" leftSection={<IconEye size={14} />}>
          Shared
        </Badge>
      </Group>
      
      <Stack gap="md">
        {sharedTeams.map((sharing) => {
          const shareUrl = `${window.location.origin}/teams/${sharing.team.slug}/members/${sharing.userId}/weekly-review`;
          const isCopied = copiedUrl === shareUrl;
          
          return (
            <Paper 
              key={sharing.team.id} 
              p="md" 
              withBorder 
              radius="sm" 
              className="bg-background-primary border-border-primary"
            >
              <Group justify="space-between" align="center">
                <div className="flex-1">
                  <Group gap="xs" align="center" mb="xs">
                    <Text fw={500} className="text-text-primary">
                      {sharing.team.name}
                    </Text>
                    <Badge variant="dot" color="blue" size="sm">
                      Organization
                    </Badge>
                  </Group>
                  <Text size="xs" className="text-text-muted font-mono break-all">
                    {shareUrl}
                  </Text>
                </div>
                <Group gap="xs">
                  <Tooltip label={isCopied ? "Copied!" : "Copy link"}>
                    <ActionIcon
                      variant="light"
                      color={isCopied ? "green" : "blue"}
                      onClick={() => copyToClipboard(shareUrl)}
                      size="sm"
                    >
                      <IconCopy size={14} />
                    </ActionIcon>
                  </Tooltip>
                  <Tooltip label="Open in new tab">
                    <ActionIcon
                      variant="light"
                      color="gray"
                      onClick={() => window.open(shareUrl, '_blank')}
                      size="sm"
                    >
                      <IconExternalLink size={14} />
                    </ActionIcon>
                  </Tooltip>
                </Group>
              </Group>
            </Paper>
          );
        })}
      </Stack>
      
      <Alert color="blue" mt="md" variant="light">
        <Text size="sm">
          Team members in these organization teams can view your weekly review. 
          You can manage sharing settings to control which teams have access.
        </Text>
      </Alert>
    </Paper>
  );
}