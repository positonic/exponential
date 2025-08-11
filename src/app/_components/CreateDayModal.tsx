"use client";

import { Modal, Button, Group, Select } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useState } from "react";
import { api } from "~/trpc/react";
import { DateInput } from '@mantine/dates';

interface CreateDayModalProps {
  children: React.ReactNode;
}

export function CreateDayModal({ children }: CreateDayModalProps) {
  const [opened, { open, close }] = useDisclosure(false);
  const [date, setDate] = useState<Date | null>(new Date());

  const utils = api.useUtils();

  const createDay = api.day.createUserDay.useMutation({
    onMutate: async (newDay) => {
      await utils.day.getUserDays.cancel();
      const previousDays = utils.day.getUserDays.getData();

      utils.day.getUserDays.setData(undefined, (old) => {
        const optimisticDay = {
          id: -1,
          date: newDay.date,
          weekId: -1,
        };
        return old ? [...old, optimisticDay] : [optimisticDay];
      });

      return { previousDays };
    },
    onError: (err, newDay, context) => {
      if (context?.previousDays) {
        utils.day.getUserDays.setData(undefined, context.previousDays);
      }
    },
    onSettled: () => {
      void utils.day.getUserDays.invalidate();
    },
    onSuccess: () => {
      setDate(new Date());
      close();
    },
  });

  // TODO: Replace with actual weeks data
  const weekOptions = [
    { value: '1', label: 'Week 1' },
    { value: '2', label: 'Week 2' },
    { value: '3', label: 'Week 3' },
  ];

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
            backgroundColor: 'var(--color-bg-elevated)',
            color: 'var(--color-text-primary)',
          }
        }}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!date) return;
            
            createDay.mutate({ date });
          }}
          className="p-4"
        >
          <DateInput
            value={date}
            onChange={setDate}
            label="Select date"
            placeholder="Pick a date"
            required
            mt="md"
            styles={{
              input: {
                backgroundColor: 'var(--color-surface-secondary)',
                color: 'var(--color-text-primary)',
                borderColor: 'var(--color-border-primary)',
              },
              label: {
                color: 'var(--color-text-primary)',
              },
            }}
          />
          
          <Select
            label="Select week"
            data={weekOptions}
            value={weekOptions[0]?.value || ''}
            onChange={(value) => setDate(value ? new Date(value) : null)}
            required
            mt="md"
            styles={{
              input: {
                backgroundColor: 'var(--color-surface-secondary)',
                color: 'var(--color-text-primary)',
                borderColor: 'var(--color-border-primary)',
              },
              label: {
                color: 'var(--color-text-primary)',
              },
              dropdown: {
                backgroundColor: 'var(--color-surface-secondary)',
                borderColor: 'var(--color-border-primary)',
                color: 'var(--color-text-primary)',
              },
            }}
          />

          <Group justify="flex-end" mt="xl">
            <Button variant="subtle" color="gray" onClick={close}>
              Cancel
            </Button>
            <Button 
              type="submit"
              loading={createDay.isPending}
              disabled={!date}
            >
              Create Day
            </Button>
          </Group>
        </form>
      </Modal>
    </>
  );
} 