'use client';

import { Paper, Avatar, Text, Group, Button } from '@mantine/core';
import { api } from "~/trpc/react";

interface TeamMember {
  id: string;
  name: string;
  role: string;
  responsibilities: string[];
  avatarUrl?: string;
}

export function Team({ projectId }: { projectId: string }) {
  // This would need a corresponding API endpoint to fetch team members
  const { data: teamMembers, isLoading } = api.project.getTeamMembers.useQuery({ projectId });

  if (isLoading) {
    return <div>Loading team...</div>;
  }

  return (
    <Paper p="md" radius="sm" className="bg-[#262626] w-full max-w-3xl mx-auto">
      <Group justify="space-between" mb="md">
        <Text size="xl" fw={700}>Team</Text>
        <Button variant="subtle" size="sm">
          Manage Team
        </Button>
      </Group>

      <div className="space-y-4">
        {teamMembers?.map((member) => (
          <Paper key={member.id} p="sm" radius="sm" className="bg-[#2C2E33]">
            <Group>
              <Avatar src={member.avatarUrl} radius="xl" />
              <div className="flex-1">
                <Text fw={500}>{member.name}</Text>
                <Text size="sm" c="dimmed">{member.role}</Text>
                <Text size="sm" mt="xs">
                  {member.responsibilities.join(', ')}
                </Text>
              </div>
            </Group>
          </Paper>
        ))}
      </div>
    </Paper>
  );
} 