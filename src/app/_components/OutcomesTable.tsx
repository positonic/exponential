"use client";

import { useState } from 'react';
import { Table, Text, Paper, ActionIcon, Tabs } from "@mantine/core";
import { api } from "~/trpc/react";
import { format } from "date-fns";
import { CreateOutcomeModal } from "./CreateOutcomeModal";
import { IconEdit } from '@tabler/icons-react';

// Define OutcomeType to match the one in CreateOutcomeModal.tsx
type OutcomeType = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual' | 'life' | 'problem';

// Define the types we want to filter by
const filterableTypes: OutcomeType[] = ['daily', 'weekly', 'monthly', 'quarterly', 'annual'];

export function OutcomesTable() {
  const [activeTab, setActiveTab] = useState<string | null>('all');
  const { data: outcomes, isLoading } = api.outcome.getMyOutcomes.useQuery(undefined, {
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  if (isLoading) {
    return <Text>Loading...</Text>;
  }

  const filteredOutcomes = outcomes?.filter(outcome =>
    activeTab === 'all' || outcome.type === activeTab
  ) ?? [];

  return (
    <div>
      <Tabs value={activeTab} onChange={setActiveTab} mb="md">
        <Tabs.List>
          <Tabs.Tab value="all">All</Tabs.Tab>
          {filterableTypes.map((type) => (
            <Tabs.Tab key={type} value={type} style={{ textTransform: 'capitalize' }}>
              {type}
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </Tabs>

      {filteredOutcomes.length === 0 && (
        <Paper p="md" withBorder>
          <Text c="dimmed">
            {activeTab === 'all'
              ? "No outcomes yet. Create your first one!"
              : `No ${activeTab} outcomes found.`}
          </Text>
        </Paper>
      )}

      {filteredOutcomes.length > 0 && (
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
              {filteredOutcomes.map((outcome) => (
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
                        type: outcome.type as OutcomeType,
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
      )}
    </div>
  );
} 