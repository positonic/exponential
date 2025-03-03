"use client";

import { Table, Text, Paper } from "@mantine/core";
import { api } from "~/trpc/react";
import { format } from "date-fns";

export function GoalsTable() {
  const { data: goals, isLoading } = api.goal.getAllMyGoals.useQuery();

  if (isLoading) {
    return <Text>Loading...</Text>;
  }

  if (!goals?.length) {
    return (
      <Paper p="md" withBorder>
        <Text c="dimmed">No goals yet. Create your first one!</Text>
      </Paper>
    );
  }

  return (
    <Paper withBorder>
      <Table>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Title</Table.Th>
            <Table.Th>Description</Table.Th>
            <Table.Th>Due Date</Table.Th>
            <Table.Th>Life Domain</Table.Th>
            <Table.Th>Projects</Table.Th>
            <Table.Th>Outcomes</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {goals.map((goal) => (
            <Table.Tr key={goal.id}>
              <Table.Td>{goal.title}</Table.Td>
              <Table.Td>{goal.description || '-'}</Table.Td>
              <Table.Td>
                {goal.dueDate ? format(goal.dueDate, 'PPP') : '-'}
              </Table.Td>
              <Table.Td>{goal.lifeDomain?.title || '-'}</Table.Td>
              <Table.Td>{goal.projects?.length || 0}</Table.Td>
              <Table.Td>{goal.outcomes?.length || 0}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Paper>
  );
} 