"use client";

import React from "react";
import { useParams } from "next/navigation";
import { api } from "~/trpc/react";
import { 
  Container, 
  Title, 
  Text, 
  Loader, 
  Alert, 
  Group, 
  Button, 
  Avatar, 
  Badge,
  Paper
} from "@mantine/core";
import { 
  IconAlertCircle, 
  IconArrowLeft, 
  IconUser, 
  IconShare 
} from "@tabler/icons-react";
import Link from "next/link";
import { OneOnOneBoard } from "~/app/_components/OneOnOneBoard";

export default function TeamMemberWeeklyReviewPage() {
  const params = useParams();
  const teamSlug = params.slug as string;
  const userId = params.userId as string;

  // Get team information by slug
  const { data: team, isLoading: teamLoading, error: teamError } = 
    api.team.getBySlug.useQuery({ slug: teamSlug });

  // Get user information
  const { data: targetUser, isLoading: userLoading, error: userError } = 
    api.user.getById.useQuery({ id: userId }, { enabled: !!userId });

  const isLoading = teamLoading || userLoading;
  const error = teamError || userError;

  if (isLoading) {
    return (
      <Container size="xl" py="xl">
        <div className="flex justify-center py-12">
          <Loader size="lg" />
        </div>
      </Container>
    );
  }

  if (error || !team || !targetUser) {
    return (
      <Container size="xl" py="xl">
        <Alert variant="light" color="red" icon={<IconAlertCircle size={16} />}>
          <Text size="sm">
            {error?.message || "Team or user not found. Please check the URL and try again."}
          </Text>
        </Alert>
      </Container>
    );
  }

  if (!team.isOrganization) {
    return (
      <Container size="xl" py="xl">
        <Alert variant="light" color="blue" icon={<IconAlertCircle size={16} />}>
          <Text size="sm">
            Weekly review sharing is only available for organization teams.
          </Text>
        </Alert>
      </Container>
    );
  }

  return (
    <Container size="xl" py="md">
      {/* Header with navigation */}
      <Group mb="xl">
        <Button
          variant="subtle"
          leftSection={<IconArrowLeft size={16} />}
          component={Link}
          href={`/teams/${teamSlug}`}
        >
          Back to {team.name}
        </Button>
      </Group>

      {/* User Info Header */}
      <Paper p="lg" mb="xl" withBorder radius="md" className="bg-surface-secondary">
        <Group justify="space-between" align="center">
          <Group gap="md">
            <Avatar
              src={targetUser.image || undefined}
              alt={targetUser.name || "Team member"}
              size="lg"
              radius="xl"
            >
              {targetUser.name?.split(' ').map((n: string) => n[0]).join('') || <IconUser size={24} />}
            </Avatar>
            <div>
              <Group gap="xs" align="center">
                <Title order={2} className="text-text-primary">
                  {targetUser.name ?? targetUser.email}&apos;s Weekly Review
                </Title>
                <Badge variant="dot" color="green" size="sm">
                  Shared
                </Badge>
              </Group>
              <Text size="sm" c="dimmed">
                Shared with {team.name} • Organization Team
              </Text>
            </div>
          </Group>
          <Group gap="xs">
            <IconShare size={20} className="text-brand-primary" />
          </Group>
        </Group>
      </Paper>

      {/* Weekly Review Content */}
      <OneOnOneBoard 
        userId={userId} 
        teamId={team.id}
        userName={targetUser.name ?? targetUser.email ?? undefined}
        isSharedView={true}
      />
    </Container>
  );
}