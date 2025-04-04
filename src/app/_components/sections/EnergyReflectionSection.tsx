'use client';

import { Paper, Title, Text, Stack, Textarea, Group, Button } from "@mantine/core";
import { IconHeartbeat } from "@tabler/icons-react";
import { memo, useState, useEffect } from 'react';
import { api } from "~/trpc/react";
import { notifications } from '@mantine/notifications';

interface EnergyReflectionSectionProps {
  dayId?: string;
  date: Date;
}

const SaveButton = memo(({ 
  onClick, 
  loading, 
  disabled,
  label = "Save Energy Reflection"
}: { 
  onClick: () => void; 
  loading: boolean; 
  disabled: boolean;
  label?: string;
}) => (
  <Button 
    onClick={onClick} 
    loading={loading} 
    disabled={disabled}
  >
    {label}
  </Button>
));

SaveButton.displayName = 'SaveButton';

export const EnergyReflectionSection = memo(({
  dayId,
  date
}: EnergyReflectionSectionProps) => {
  // State for the field
  const [energyReflection, setEnergyReflection] = useState('');

  // Get TRPC utils for invalidating queries
  const utils = api.useUtils();

  // Fetch existing notes
  const { data: energyReflectionNotes } = api.note.getByDate.useQuery({
    date,
    type: 'energy-reflection'
  }, {
    enabled: !!dayId,
    staleTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });

  // Create note mutation
  const createNote = api.note.create.useMutation({
    onSuccess: (data) => {
      notifications.show({
        title: 'Saved',
        message: 'Your energy reflection has been saved',
        color: 'green',
      });
      // Invalidate the relevant query based on the note type
      if (dayId) {
        void utils.note.getByDate.invalidate({ date, type: data.type });
      }
    },
  });

  // Update state when data from API changes
  useEffect(() => {
    if (energyReflectionNotes?.[0]?.content) {
      setEnergyReflection(energyReflectionNotes[0].content);
    }
  }, [energyReflectionNotes]);

  // Save function
  const saveEnergyReflection = () => {
    if (dayId && energyReflection.trim()) {
      createNote.mutate({
        content: energyReflection,
        type: 'energy-reflection',
        dayId: parseInt(dayId, 10),
      });
    }
  };

  return (
    <Paper shadow="sm" p="md" radius="md" className="bg-[#1E1E1E]">
      <Stack gap="md">
        <Group>
          <IconHeartbeat className="text-red-500" size={24} />
          <Title order={2} className="text-2xl">
            Energy Reflection
          </Title>
        </Group>
        <Textarea
          placeholder="How was your energy level today?"
          value={energyReflection}
          onChange={(e) => setEnergyReflection(e.target.value)}
          minRows={3}
          size="md"
          className="bg-[#262626]"
        />
        <SaveButton 
          onClick={saveEnergyReflection} 
          loading={createNote.isPending}
          disabled={!energyReflection.trim() || !dayId}
        />
      </Stack>
    </Paper>
  );
});

EnergyReflectionSection.displayName = 'EnergyReflectionSection'; 