"use client";

import { useState } from 'react';
import { Table, Text, Paper, ActionIcon, Tabs, Checkbox, Button, Group } from "@mantine/core";
import { api } from "~/trpc/react";
import { format, isBefore, startOfDay } from "date-fns";
import { CreateOutcomeModal } from "./CreateOutcomeModal";
import { IconEdit, IconTrash } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';

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
  const [bulkEditMode, setBulkEditMode] = useState(false);
  const [selectedOutcomes, setSelectedOutcomes] = useState<Set<string>>(new Set());
  
  const utils = api.useUtils();
  const deleteOutcomeMutation = api.outcome.deleteOutcome.useMutation({
    onSuccess: () => {
      void utils.outcome.getMyOutcomes.invalidate();
      notifications.show({
        title: 'Success',
        message: 'Outcome deleted successfully',
        color: 'green',
      });
    },
    onError: (error) => {
      notifications.show({
        title: 'Error',
        message: error.message || 'Failed to delete outcome',
        color: 'red',
      });
    },
  });
  
  const bulkDeleteMutation = api.outcome.deleteOutcomes.useMutation({
    onSuccess: () => {
      void utils.outcome.getMyOutcomes.invalidate();
      setSelectedOutcomes(new Set());
      setBulkEditMode(false);
      notifications.show({
        title: 'Success',
        message: 'Outcomes deleted successfully',
        color: 'green',
      });
    },
    onError: (error) => {
      notifications.show({
        title: 'Error',
        message: error.message || 'Failed to delete outcomes',
        color: 'red',
      });
    },
  });

  if (!outcomes) return <div>No outcomes found.</div>;

  const today = startOfDay(new Date());

  const filteredOutcomes = outcomes.filter(outcome => {
    const typeMatch = activeTab === 'all' || outcome.type === activeTab;
    const dateMatch = !hidePastDue || !outcome.dueDate || !isBefore(outcome.dueDate, today);
    return typeMatch && dateMatch;
  }) ?? [];
  
  const handleToggleOutcome = (outcomeId: string) => {
    const newSelected = new Set(selectedOutcomes);
    if (newSelected.has(outcomeId)) {
      newSelected.delete(outcomeId);
    } else {
      newSelected.add(outcomeId);
    }
    setSelectedOutcomes(newSelected);
  };
  
  const handleSelectAll = () => {
    if (selectedOutcomes.size === filteredOutcomes.length) {
      setSelectedOutcomes(new Set());
    } else {
      setSelectedOutcomes(new Set(filteredOutcomes.map(o => o.id)));
    }
  };
  
  const handleDeleteSelected = () => {
    bulkDeleteMutation.mutate({ ids: Array.from(selectedOutcomes) });
  };
  
  const handleDeleteOutcome = (id: string) => {
    deleteOutcomeMutation.mutate({ id });
  };

  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--mantine-spacing-md)', marginBottom: 'var(--mantine-spacing-md)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
          <Group>
            <Checkbox
              label="Hide past due"
              checked={hidePastDue}
              onChange={(event) => setHidePastDue(event.currentTarget.checked)}
            />
            <Button
              variant="subtle"
              onClick={() => {
                setBulkEditMode(!bulkEditMode);
                setSelectedOutcomes(new Set());
              }}
            >
              {bulkEditMode ? 'Cancel Bulk Edit' : 'Bulk Edit'}
            </Button>
          </Group>
        </div>
        {bulkEditMode && selectedOutcomes.size > 0 && (
          <Group>
            <Text size="sm" c="dimmed">
              {selectedOutcomes.size} outcome{selectedOutcomes.size !== 1 ? 's' : ''} selected
            </Text>
            <Button
              color="red"
              variant="filled"
              size="sm"
              onClick={handleDeleteSelected}
              loading={bulkDeleteMutation.isPending}
            >
              Delete Selected
            </Button>
          </Group>
        )}
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
                {bulkEditMode && (
                  <Table.Th style={{ width: '40px' }}>
                    <Checkbox
                      checked={selectedOutcomes.size === filteredOutcomes.length && filteredOutcomes.length > 0}
                      indeterminate={selectedOutcomes.size > 0 && selectedOutcomes.size < filteredOutcomes.length}
                      onChange={handleSelectAll}
                    />
                  </Table.Th>
                )}
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
                  {bulkEditMode && (
                    <Table.Td>
                      <Checkbox
                        checked={selectedOutcomes.has(outcome.id)}
                        onChange={() => handleToggleOutcome(outcome.id)}
                      />
                    </Table.Td>
                  )}
                  <Table.Td>{outcome.description}</Table.Td>
                  <Table.Td style={{ textTransform: 'capitalize' }}>{outcome.type}</Table.Td>
                  <Table.Td>
                    {outcome.dueDate ? format(outcome.dueDate, 'PPP') : '-'}
                  </Table.Td>
                  <Table.Td>
                    {outcome.projects.map((project: any) => project.name).join(', ')}
                  </Table.Td>
                  <Table.Td>
                    <Group gap="xs">
                      <CreateOutcomeModal
                        outcome={{
                          id: outcome.id,
                          description: outcome.description,
                          dueDate: outcome.dueDate,
                          type: outcome.type as OutcomeType,
                          whyThisOutcome: outcome.whyThisOutcome,
                          projectId: outcome.projects[0]?.id,
                          goalId: outcome.goals[0]?.id,
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
                      <ActionIcon
                        variant="subtle"
                        color="red"
                        aria-label="Delete outcome"
                        onClick={() => handleDeleteOutcome(outcome.id)}
                        loading={deleteOutcomeMutation.isPending}
                      >
                        <IconTrash size={16} />
                      </ActionIcon>
                    </Group>
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