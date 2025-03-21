"use client";

import { Table, Text, Paper } from "@mantine/core";
import { api } from "~/trpc/react";
import { format } from "date-fns";

export function OutcomesTable() {
  const { data: outcomes, isLoading } = api.outcome.getMyOutcomes.useQuery();

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
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Paper>
  );
} 