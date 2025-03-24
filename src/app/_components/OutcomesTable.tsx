"use client";

import { Table, Text, Paper, ActionIcon } from "@mantine/core";
import { api } from "~/trpc/react";
import { format } from "date-fns";
import { CreateOutcomeModal } from "./CreateOutcomeModal";
import { IconEdit } from '@tabler/icons-react';

export function OutcomesTable() {
  const { data: outcomes, isLoading } = api.outcome.getMyOutcomes.useQuery(undefined, {
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  if (isLoading) {
    return <Text>Loading...</Text>;
  }

  if (!outcomes?.length) {
    return (
      <Paper p="md" withBorder>
        <Text c="dimmed">No outcomes yet. Create your first one!</Text>
      </Paper>
    );
  }

  return (
    <Paper withBorder>
      <Table>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Description</Table.Th>
            <Table.Th>Type</Table.Th>
            <Table.Th>Due Date</Table.Th>
            <Table.Th>Projects</Table.Th>
            <Table.Th>Goals</Table.Th>
            <Table.Th>Actions</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {outcomes.map((outcome) => (
            <Table.Tr key={outcome.id}>
              <Table.Td>{outcome.description}</Table.Td>
              <Table.Td style={{ textTransform: 'capitalize' }}>{outcome.type}</Table.Td>
              <Table.Td>
                {outcome.dueDate ? format(outcome.dueDate, 'PPP') : '-'}
              </Table.Td>
              <Table.Td>
                {outcome.projects.map((project) => project.name).join(', ')}
              </Table.Td>
              <Table.Td>
                {outcome.goals?.length || 0}
              </Table.Td>
              <Table.Td>
                <CreateOutcomeModal
                  outcome={{
                    id: outcome.id,
                    description: outcome.description,
                    dueDate: outcome.dueDate,
                    type: outcome.type,
                    projectId: outcome.projects[0]?.id,
                  }}
                  trigger={
                    <ActionIcon 
                      variant="subtle" 
                      color="gray"
                      aria-label="Edit outcome"
                    >
                      <IconEdit size={16} />
                    </ActionIcon>
                  }
                />
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Paper>
  );
} 