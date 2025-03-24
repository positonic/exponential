"use client";

import { Modal, Button, Group, TextInput, Select } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useState } from "react";
import { api } from "~/trpc/react";
import { DateInput } from '@mantine/dates';
import '@mantine/dates/styles.css';

interface CreateOutcomeModalProps {
  children: React.ReactNode;
  projectId?: string;
}

type OutcomeType = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual' | 'life' | 'problem';

export function CreateOutcomeModal({ children, projectId }: CreateOutcomeModalProps) {
  const [opened, { open, close }] = useDisclosure(false);
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState<Date | null>(null);
  const [type, setType] = useState<OutcomeType>("daily");
  const [selectedProjectId, setSelectedProjectId] = useState<string | undefined>(projectId);

  const utils = api.useUtils();
  const { data: projects } = api.project.getAll.useQuery();

  const createOutcome = api.outcome.createOutcome.useMutation({
    onMutate: async (newOutcome) => {
      console.log('🟡 onMutate started', { newOutcome, projectId, selectedProjectId });

      // Cancel any outgoing refetches
      await utils.outcome.getMyOutcomes.cancel();
      if (selectedProjectId) {
        await utils.outcome.getProjectOutcomes.cancel();
      }
      console.log('🟡 Cancelled existing queries');

      // Snapshot the previous value
      const previousData = {
        myOutcomes: utils.outcome.getMyOutcomes.getData(),
        projectOutcomes: selectedProjectId
          ? utils.outcome.getProjectOutcomes.getData({ projectId: selectedProjectId })
          : null
      };
      console.log('🟡 Previous data:', previousData);

      const optimisticOutcome = {
        id: `temp-${Date.now()}`,
        description: newOutcome.description,
        dueDate: newOutcome.dueDate ?? null,
        type: newOutcome.type as OutcomeType,
        userId: "",
        projects: selectedProjectId ? [projects?.find(p => p.id === selectedProjectId)].filter(Boolean) : [],
        goals: []
      };
      console.log('🟡 Created optimistic outcome:', optimisticOutcome);

      // Update all the queries atomically
      utils.outcome.getMyOutcomes.setData(undefined, old => {
        const newData = [...(old ?? []), optimisticOutcome];
        console.log('🟡 Updated myOutcomes:', newData);
        return newData;
      });

      if (selectedProjectId) {
        utils.outcome.getProjectOutcomes.setData(
          { projectId: selectedProjectId },
          old => {
            const newData = [...(old ?? []), optimisticOutcome];
            console.log('🟡 Updated projectOutcomes:', newData);
            return newData;
          }
        );
      }

      return previousData;
    },

    onError: (error, variables, context) => {
      console.log('🔴 Error occurred:', error);
      console.log('🔴 Rolling back to:', context);
      // Add rollback logic if needed
    },

    onSuccess: async (newOutcome) => {
      console.log('🟢 Mutation succeeded:', newOutcome);
      
      // Immediately update the cache with the new data
      if (selectedProjectId) {
        console.log('🟢 Invalidating project outcomes for:', selectedProjectId);
        await utils.outcome.getProjectOutcomes.invalidate({ projectId: selectedProjectId });
      }
      console.log('🟢 Invalidating all outcomes');
      await utils.outcome.getMyOutcomes.invalidate();
      
      // Reset form and close modal
      setDescription("");
      setDueDate(null);
      setType("daily");
      setSelectedProjectId(undefined);
      close();
    },

    onSettled: () => {
      console.log('🔵 Mutation settled');
    }
  });

  const outcomeTypes = [
    { value: 'daily', label: 'Daily' },
    { value: 'weekly', label: 'Weekly' },
    { value: 'monthly', label: 'Monthly' },
    { value: 'quarterly', label: 'Quarterly' },
    { value: 'annual', label: 'Annual' },
    { value: 'life', label: 'Life' },
    { value: 'problem', label: 'Problem' }
  ] as const;

  return (
    <>
      <div onClick={open}>
        {children}
      </div>

      <Modal 
        opened={opened} 
        onClose={close}
        size="lg"
        radius="md"
        padding="lg"
        styles={{
          header: { display: 'none' },
          body: { padding: 0 },
          content: {
            backgroundColor: '#262626',
            color: '#C1C2C5',
          }
        }}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!description) return;
            
            console.log('Submitting with projectId:', selectedProjectId);
            createOutcome.mutate({
              description,
              dueDate: dueDate ?? undefined,
              type,
              projectId: selectedProjectId,
            });
          }}
          className="p-4"
        >
          <TextInput
            placeholder="What outcome do you want to achieve?"
            variant="unstyled"
            size="xl"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
            styles={{
              input: {
                fontSize: '24px',
                color: '#C1C2C5',
                '&::placeholder': {
                  color: '#C1C2C5',
                },
              },
            }}
          />

          <Select
            label="Outcome Type"
            data={outcomeTypes}
            value={type}
            onChange={(value) => setType((value ?? "daily") as OutcomeType)}
            required
            mt="md"
            styles={{
              input: {
                backgroundColor: '#262626',
                color: '#C1C2C5',
                borderColor: '#373A40',
              },
              label: {
                color: '#C1C2C5',
              },
              dropdown: {
                backgroundColor: '#262626',
                borderColor: '#373A40',
                color: '#C1C2C5',
              },
            }}
          />

          <Select
            label="Project (optional)"
            placeholder="Select a project"
            data={projects?.map(p => ({ value: p.id, label: p.name })) ?? []}
            value={selectedProjectId}
            onChange={(value) => setSelectedProjectId(value ?? undefined)}
            mt="md"
            styles={{
              input: {
                backgroundColor: '#262626',
                color: '#C1C2C5',
                borderColor: '#373A40',
              },
              label: {
                color: '#C1C2C5',
              },
              dropdown: {
                backgroundColor: '#262626',
                borderColor: '#373A40',
                color: '#C1C2C5',
              },
            }}
          />
          
          <DateInput
            value={dueDate}
            onChange={setDueDate}
            label="Due date (optional)"
            placeholder="Pick a date"
            mt="md"
            styles={{
              input: {
                backgroundColor: '#262626',
                color: '#C1C2C5',
                borderColor: '#373A40',
              },
              label: {
                color: '#C1C2C5',
              },
              
              calendarHeader: {
                backgroundColor: '#262626',
                color: '#C1C2C5',
              },
              monthCell: {
                color: '#C1C2C5',
              },
              month: {
                color: '#C1C2C5',
              },
              weekday: {
                color: '#909296',
              },
              day: {
                color: '#C1C2C5',
                '&[data-selected]': {
                  backgroundColor: '#1971c2',
                },
                '&[data-in-range]': {
                  backgroundColor: '#1971c2',
                },
                '&:hover': {
                  backgroundColor: '#373A40',
                },
              },
            }}
          />

          <Group justify="flex-end" mt="xl">
            <Button variant="subtle" color="gray" onClick={close}>
              Cancel
            </Button>
            <Button 
              type="submit"
              loading={createOutcome.isPending}
              disabled={!description}
            >
              Create Outcome
            </Button>
          </Group>
        </form>
      </Modal>
    </>
  );
} 