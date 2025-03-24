"use client";

import { api } from "~/trpc/react";
import { ActionList } from './ActionList';
import { CreateActionModal } from './CreateActionModal';
import { IconLayoutKanban, IconList } from "@tabler/icons-react";
import { Button, Title, Stack, Paper, Text, Group } from "@mantine/core";
import { useState, useEffect } from "react";
import { CreateOutcomeModal } from "~/app/_components/CreateOutcomeModal";

interface ActionsProps {
  viewName: string;
  defaultView?: 'list' | 'alignment';
  projectId?: string;
}

export function Actions({ viewName, defaultView = 'list', projectId }: ActionsProps) {
  const [isAlignmentMode, setIsAlignmentMode] = useState(defaultView === 'alignment');
  const actions = api.action.getAll.useQuery();
  
  // Use the appropriate query based on whether we have a projectId
  const outcomes = projectId 
    ? api.outcome.getProjectOutcomes.useQuery(
        { projectId },
        {
          onSuccess: (data) => {
            console.log('📥 Project outcomes fetched:', data);
          },
          onError: (error) => {
            console.log('❌ Error fetching project outcomes:', error);
          }
        }
      )
    : api.outcome.getMyOutcomes.useQuery({
        onSuccess: (data) => {
          console.log('📥 All outcomes fetched:', data);
        },
        onError: (error) => {
          console.log('❌ Error fetching all outcomes:', error);
        }
      });

  console.log("outcomes are ", outcomes.data);
  useEffect(() => {
    setIsAlignmentMode(defaultView === 'alignment');
  }, [defaultView]);

  console.log("projectId is ", projectId);
  console.log("outcomes are ", outcomes.data);
  // Filter outcomes for today
  const todayOutcomes = outcomes.data?.filter(outcome => {
    if (!outcome.dueDate) return false;
    const dueDate = new Date(outcome.dueDate);
    const today = new Date();
    return (
      dueDate.getDate() === today.getDate() &&
      dueDate.getMonth() === today.getMonth() &&
      dueDate.getFullYear() === today.getFullYear()
    );
  });

  // Filter outcomes for this week (excluding today)
  const weeklyOutcomes = outcomes.data?.filter(outcome => {
    if (!outcome.dueDate) return false;
    const dueDate = new Date(outcome.dueDate);
    const today = new Date();
    const endOfWeek = new Date();
    endOfWeek.setDate(today.getDate() + (7 - today.getDay()));
    
    return (
      dueDate > today &&
      dueDate <= endOfWeek &&
      !(dueDate.getDate() === today.getDate() &&
        dueDate.getMonth() === today.getMonth() &&
        dueDate.getFullYear() === today.getFullYear())
    );
  });

  // Add debugging for filtered outcomes
  useEffect(() => {
    console.log('📊 Today outcomes:', todayOutcomes);
    console.log('📊 Weekly outcomes:', weeklyOutcomes);
  }, [todayOutcomes, weeklyOutcomes]);

  return (
    <div className="w-full max-w-3xl mx-auto">
      <div className="relative mb-4">
        <Group justify="space-between" align="center">
          <Title order={2}></Title>
          <Button
            variant="subtle"
            size="sm"
            onClick={() => setIsAlignmentMode(!isAlignmentMode)}
          >
            <Group gap="xs">
              {isAlignmentMode ? <IconList size={16} /> : <IconLayoutKanban size={16} />}
              {isAlignmentMode ? 'Task View' : 'Alignment View'}
            </Group>
          </Button>
        </Group>
      </div>

      {isAlignmentMode && (
        <Paper shadow="sm" p="md" radius="md" className="mb-8 bg-[#262626] border border-blue-900/30">
          <Stack gap="md">
            <Title order={2} className="text-xl bg-gradient-to-r from-blue-500 to-cyan-500 bg-clip-text text-transparent">
              What would make today great?
            </Title>
            <Stack gap="xs">
              {todayOutcomes?.map((outcome) => (
                <CreateOutcomeModal
                  key={outcome.id}
                  outcome={outcome}
                  projectId={projectId}
                  trigger={
                    <Paper p="sm" className="bg-[#1E1E1E] cursor-pointer hover:bg-[#2C2C2C] transition-colors">
                      <Text>{outcome.description}</Text>
                    </Paper>
                  }
                />
              ))}
              {(!todayOutcomes || todayOutcomes.length === 0) && (
                <Text c="dimmed" size="sm" style={{ fontStyle: 'italic' }}>
                  No outcomes set for today. Add some in your morning routine.
                </Text>
              )}
            </Stack>
          </Stack>
          
        </Paper>
      )}

      {isAlignmentMode && (
        <Paper shadow="sm" p="md" radius="md" className="mb-8 bg-[#262626] border border-indigo-900/30">
          <Stack gap="md">
            <Title order={2} className="text-xl bg-gradient-to-r from-indigo-500 to-violet-500 bg-clip-text text-transparent">
              What would make this week great?
            </Title>
            <Stack gap="xs">
              {weeklyOutcomes?.map((outcome) => (
                <CreateOutcomeModal
                  key={outcome.id}
                  outcome={outcome}
                  projectId={projectId}
                  trigger={
                    <Paper p="sm" className="bg-[#1E1E1E] cursor-pointer hover:bg-[#2C2C2C] transition-colors">
                      <Group justify="space-between">
                        <Text>{outcome.description}</Text>
                        <Text size="sm" c="dimmed">
                          {new Date(outcome.dueDate!).toLocaleDateString(undefined, { weekday: 'short' })}
                        </Text>
                      </Group>
                    </Paper>
                  }
                />
              ))}
              {(!weeklyOutcomes || weeklyOutcomes.length === 0) && (
                <Text c="dimmed" size="sm" style={{ fontStyle: 'italic' }}>
                  No outcomes set for this week. Plan your week in your morning routine.
                </Text>
              )}
            </Stack>
          </Stack>
         
        </Paper>
      )}
      {isAlignmentMode && (
        <Paper shadow="sm" p="md" radius="md" className="mb-8 bg-[#262626] border border-indigo-900/30">
           <CreateOutcomeModal>
          <Button 
            variant="filled" 
            color="dark"
            leftSection="+"
          >
            Add Outcome
          </Button>
        </CreateOutcomeModal>
        </Paper>
       )}
      <ActionList viewName={viewName} actions={actions.data ?? []} />
      <div className="mt-6">
        <CreateActionModal viewName={viewName}/>
      </div>
    </div>
  );
} 