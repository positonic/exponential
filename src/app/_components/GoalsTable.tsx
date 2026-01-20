"use client";

import { useState, useMemo, type FC } from 'react';
import { Table, Text, Paper, ActionIcon, Tabs, Checkbox, Group } from "@mantine/core";
import { format, isBefore, startOfDay } from "date-fns";
import { CreateGoalModal } from "./CreateGoalModal";
import { IconEdit, IconTrash } from '@tabler/icons-react';
import { api } from "~/trpc/react";

interface GoalsTableProps {
  goals: any[];
}

export const GoalsTable: FC<GoalsTableProps> = ({ goals }) => {
  const [activeTab, setActiveTab] = useState<string | null>('all');
  const [hidePastDue, setHidePastDue] = useState<boolean>(true);
  const utils = api.useUtils();

  const deleteGoalMutation = api.goal.deleteGoal.useMutation({
    onSuccess: () => {
      void utils.goal.getProjectGoals.invalidate();
      void utils.goal.getAllMyGoals.invalidate();
    },
  });

  const handleDeleteGoal = (goalId: number) => {
    if (confirm("Are you sure you want to delete this goal?")) {
      deleteGoalMutation.mutate({ id: goalId });
    }
  };

  const lifeDomainTitles = useMemo(() => {
    if (!goals) return [];
    const titles = goals
      .map(goal => goal.lifeDomain?.title)
      .filter((title): title is string => !!title);
    return [...new Set(titles)];
  }, [goals]);

  if (!goals) {
    return (
      <Paper p="md" withBorder>
        <Text c="dimmed">No objectives found.</Text>
      </Paper>
    );
  }

  const today = startOfDay(new Date());

  const filteredGoals = goals.filter(goal => {
    const domainMatch = activeTab === 'all' || goal.lifeDomain?.title === activeTab;
    const dateMatch = !hidePastDue || !goal.dueDate || !isBefore(goal.dueDate, today);
    return domainMatch && dateMatch;
  });

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--mantine-spacing-md)' }}>
        <Tabs value={activeTab} onChange={setActiveTab}>
          <Tabs.List>
            <Tabs.Tab value="all">All</Tabs.Tab>
            {lifeDomainTitles.map((title) => (
              <Tabs.Tab key={title} value={title}>
                {title}
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

      {filteredGoals.length === 0 && (
        <Paper p="md" withBorder>
          <Text c="dimmed">
            {activeTab === 'all' && !hidePastDue
              ? "No goals yet. Create your first one!"
              : "No goals match the current filters."}
          </Text>
        </Paper>
      )}

      {filteredGoals.length > 0 && (
        <Paper withBorder>
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Title</Table.Th>
                <Table.Th>Description</Table.Th>
                <Table.Th>Due Date</Table.Th>
                <Table.Th>Life Domain</Table.Th>
                <Table.Th>Actions</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {filteredGoals.map((goal) => (
                <Table.Tr key={goal.id}>
                  <Table.Td>{goal.title}</Table.Td>
                  <Table.Td>{goal.description || '-'}</Table.Td>
                  <Table.Td>
                    {goal.dueDate ? format(goal.dueDate, 'PPP') : '-'}
                  </Table.Td>
                  <Table.Td>{goal.lifeDomain?.title || '-'}</Table.Td>
                  <Table.Td>
                    <Group gap="xs">
                      <CreateGoalModal
                        goal={{
                          id: goal.id,
                          title: goal.title,
                          description: goal.description,
                          whyThisGoal: goal.whyThisGoal,
                          notes: goal.notes,
                          dueDate: goal.dueDate,
                          lifeDomainId: goal.lifeDomainId,
                          outcomes: goal.outcomes,
                        }}
                        trigger={
                          <ActionIcon
                            variant="subtle"
                            color="gray"
                            aria-label="Edit goal"
                          >
                            <IconEdit size={16} />
                          </ActionIcon>
                        }
                      />
                      <ActionIcon
                        variant="subtle"
                        color="red"
                        aria-label="Delete goal"
                        onClick={() => handleDeleteGoal(goal.id)}
                        loading={deleteGoalMutation.isPending}
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