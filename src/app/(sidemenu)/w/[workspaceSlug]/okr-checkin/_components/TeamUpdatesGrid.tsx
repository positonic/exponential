"use client";

import { Card, Avatar, Text, Badge, Group, Stack, SimpleGrid, Spoiler } from "@mantine/core";
import { IconCheck, IconClock } from "@tabler/icons-react";

interface TeamMember {
  user: {
    id: string;
    name: string | null;
    image: string | null;
  };
  role: string;
}

interface StatusUpdate {
  id: string;
  userId: string;
  accomplishments: string | null;
  blockers: string | null;
  priorities: string | null;
  isSubmitted: boolean;
  submittedAt: Date | null;
  user: {
    id: string;
    name: string | null;
    image: string | null;
  };
}

interface TeamUpdatesGridProps {
  okrCheckinId: string;
  teamMembers: TeamMember[];
  statusUpdates: StatusUpdate[];
}

export function TeamUpdatesGrid({
  teamMembers,
  statusUpdates,
}: TeamUpdatesGridProps) {
  // Create a map for quick lookup
  const updatesByUser = new Map(statusUpdates.map((u) => [u.userId, u]));

  return (
    <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
      {teamMembers.map((member) => {
        const update = updatesByUser.get(member.user.id);
        const hasUpdate = !!update;
        const isSubmitted = update?.isSubmitted ?? false;

        return (
          <Card key={member.user.id} withBorder padding="md">
            <Stack gap="sm">
              {/* Member Header */}
              <Group justify="space-between">
                <Group gap="sm">
                  <Avatar src={member.user.image} size="md" radius="xl">
                    {member.user.name?.charAt(0) ?? "?"}
                  </Avatar>
                  <div>
                    <Text size="sm" fw={500}>
                      {member.user.name ?? "Unknown"}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {member.role}
                    </Text>
                  </div>
                </Group>
                <Badge
                  color={isSubmitted ? "green" : hasUpdate ? "yellow" : "gray"}
                  variant="light"
                  leftSection={isSubmitted ? <IconCheck size={12} /> : <IconClock size={12} />}
                >
                  {isSubmitted ? "Submitted" : hasUpdate ? "Draft" : "Pending"}
                </Badge>
              </Group>

              {/* Update Content (only show if submitted) */}
              {isSubmitted && update && (
                <Stack gap="xs">
                  {update.accomplishments && (
                    <div>
                      <Text size="xs" fw={500} c="dimmed" mb={2}>
                        Accomplishments
                      </Text>
                      <Spoiler maxHeight={60} showLabel="Show more" hideLabel="Hide">
                        <Text size="sm" className="whitespace-pre-wrap">
                          {update.accomplishments}
                        </Text>
                      </Spoiler>
                    </div>
                  )}

                  {update.blockers && (
                    <div>
                      <Text size="xs" fw={500} c="red.6" mb={2}>
                        Blockers
                      </Text>
                      <Spoiler maxHeight={40} showLabel="Show more" hideLabel="Hide">
                        <Text size="sm" className="whitespace-pre-wrap">
                          {update.blockers}
                        </Text>
                      </Spoiler>
                    </div>
                  )}

                  {update.priorities && (
                    <div>
                      <Text size="xs" fw={500} c="blue.6" mb={2}>
                        Priorities
                      </Text>
                      <Spoiler maxHeight={40} showLabel="Show more" hideLabel="Hide">
                        <Text size="sm" className="whitespace-pre-wrap">
                          {update.priorities}
                        </Text>
                      </Spoiler>
                    </div>
                  )}
                </Stack>
              )}

              {/* Placeholder for non-submitted */}
              {!isSubmitted && (
                <Text size="sm" c="dimmed" fs="italic">
                  {hasUpdate ? "Update saved as draft" : "Waiting for update..."}
                </Text>
              )}
            </Stack>
          </Card>
        );
      })}
    </SimpleGrid>
  );
}
