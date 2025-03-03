"use client";

import { Modal, Button, Group, TextInput, Select } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useState } from "react";
import { api } from "~/trpc/react";
import { DateInput } from '@mantine/dates';

interface CreateGoalModalProps {
  children: React.ReactNode;
}

export function CreateGoalModal({ children }: CreateGoalModalProps) {
  const [opened, { open, close }] = useDisclosure(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState<Date | null>(null);
  const [lifeDomainId, setLifeDomainId] = useState<number | null>(null);

  const utils = api.useUtils();

  const createGoal = api.goal.createGoal.useMutation({
    onMutate: async (newGoal) => {
      await utils.goal.getAllMyGoals.cancel();
      const previousGoals = utils.goal.getAllMyGoals.getData();

      utils.goal.getAllMyGoals.setData(undefined, (old) => {
        const optimisticGoal = {
          id: -1,
          title: newGoal.title,
          description: newGoal.description ?? null,
          dueDate: newGoal.dueDate ?? null,
          lifeDomainId: newGoal.lifeDomainId,
          userId: "",
          lifeDomain: {
            id: newGoal.lifeDomainId,
            title: "Loading...",
            description: null
          },
          projects: [],
          outcomes: []
        };
        return old ? [...old, optimisticGoal] : [optimisticGoal];
      });

      return { previousGoals };
    },
    onError: (err, newGoal, context) => {
      if (context?.previousGoals) {
        utils.goal.getAllMyGoals.setData(undefined, context.previousGoals);
      }
    },
    onSettled: () => {
      void utils.goal.getAllMyGoals.invalidate();
    },
    onSuccess: () => {
      setTitle("");
      setDescription("");
      setDueDate(null);
      setLifeDomainId(null);
      close();
    },
  });

  const { data: lifeDomains } = api.lifeDomain.getAllLifeDomains.useQuery();
  
  const lifeDomainOptions = lifeDomains?.map(domain => ({
    value: domain.id.toString(),
    label: domain.title
  })) ?? [];

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
            if (!title || !lifeDomainId) return;
            
            createGoal.mutate({
              title,
              description: description || undefined,
              dueDate: dueDate ?? undefined,
              lifeDomainId,
            });
          }}
          className="p-4"
        >
          <TextInput
            placeholder="What's your goal?"
            variant="unstyled"
            size="xl"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
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
          
          <TextInput
            placeholder="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            mt="md"
            styles={{
              input: {
                backgroundColor: '#262626',
                color: '#C1C2C5',
                borderColor: '#373A40',
              },
            }}
          />

          <Select
            label="Life Domain"
            data={lifeDomainOptions}
            value={lifeDomainId?.toString()}
            onChange={(value) => setLifeDomainId(value ? parseInt(value) : null)}
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
            }}
          />

          <Group justify="flex-end" mt="xl">
            <Button variant="subtle" color="gray" onClick={close}>
              Cancel
            </Button>
            <Button 
              type="submit"
              loading={createGoal.isPending}
              disabled={!title || !lifeDomainId}
            >
              Create Goal
            </Button>
          </Group>
        </form>
      </Modal>
    </>
  );
} 