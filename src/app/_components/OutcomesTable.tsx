"use client";

import { useState } from 'react';
import { Table, Text, Paper, ActionIcon, Tabs, Checkbox } from "@mantine/core";
import { api } from "~/trpc/react";
import { format, isBefore, startOfDay } from "date-fns";
import { CreateOutcomeModal } from "./CreateOutcomeModal";
import { IconEdit } from '@tabler/icons-react';

// Define OutcomeType to match the one in CreateOutcomeModal.tsx
type OutcomeType = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual' | 'life' | 'problem';

// Define the types we want to filter by
const filterableTypes: OutcomeType[] = ['daily', 'weekly', 'monthly', 'quarterly', 'annual'];

interface OutcomesTableProps {
  outcomes: any[];
}

export function OutcomesTable({ outcomes }: OutcomesTableProps) {
  const [activeTab, setActiveTab] = useState<string | null>('all');
  const [hidePastDue, setHidePastDue] = useState<boolean>(true);

  if (!outcomes) return <div>No outcomes found.</div>;

  const today = startOfDay(new Date());

  const filteredOutcomes = outcomes.filter(outcome => {
    const typeMatch = activeTab === 'all' || outcome.type === activeTab;
    const dateMatch = !hidePastDue || !outcome.dueDate || !isBefore(outcome.dueDate, today);
    return typeMatch && dateMatch;
  }) ?? [];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--mantine-spacing-md)' }}>
        <Tabs value={activeTab} onChange={setActiveTab}>
          <Tabs.List>
            <Tabs.Tab value="all">All</Tabs.Tab>
            {filterableTypes.map((type) => (
              <Tabs.Tab key={type} value={type} style={{ textTransform: 'capitalize' }}>
                {type}
              </Tabs.Tab>
            ))}
          </Tabs.List>
        </Tabs>
        <Checkbox
          label="Hide past due"
          checked={hidePastDue}
          onChange={(event) => setHidePastDue(event.currentTarget.checked)}
        />
      </div>

      {filteredOutcomes.length === 0 && (
        <Paper p="md" withBorder>
          <Text c="dimmed">
            {activeTab === 'all' && !hidePastDue
              ? "No outcomes yet. Create your first one!"
              : "No outcomes match the current filters."}
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