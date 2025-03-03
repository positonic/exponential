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
  const [weekId, setWeekId] = useState<number | null>(null);

  const utils = api.useUtils();

  const createDay = api.day.createUserDay.useMutation({
    onMutate: async (newDay) => {
      await utils.day.getUserDays.cancel();
      const previousDays = utils.day.getUserDays.getData();

      utils.day.getUserDays.setData(undefined, (old) => {
        const optimisticDay = {
          id: -1, // Temporary negative ID to indicate optimistic update
          date: newDay.date,
          weekId: newDay.weekId,
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
      setWeekId(null);
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
            backgroundColor: '#262626',
            color: '#C1C2C5',
          }
        }}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!date || !weekId) return;
            
            createDay.mutate({
              date,
              weekId,
            });
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
                backgroundColor: '#262626',
                color: '#C1C2C5',
                borderColor: '#373A40',
              },
              label: {
                color: '#C1C2C5',
              },
            }}
          />
          
          <Select
            label="Select week"
            data={weekOptions}
            value={weekId?.toString()}
            onChange={(value) => setWeekId(value ? parseInt(value) : null)}
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

          <Group justify="flex-end" mt="xl">
            <Button variant="subtle" color="gray" onClick={close}>
              Cancel
            </Button>
            <Button 
              type="submit"
              loading={createDay.isPending}
              disabled={!date || !weekId}
            >
              Create Day
            </Button>
          </Group>
        </form>
      </Modal>
    </>
  );
} 