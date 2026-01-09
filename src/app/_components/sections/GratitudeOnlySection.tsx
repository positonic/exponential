'use client';

import { Paper, Title, Stack, Textarea, Group, Button, Text } from "@mantine/core";
import { IconStars } from "@tabler/icons-react";
import { memo, useState, useEffect } from 'react';
import { api } from "~/trpc/react";
import { notifications } from '@mantine/notifications';

interface GratitudeOnlySectionProps {
  dayId?: string;
  date: Date;
}

const SaveButton = memo(({ 
  onClick, 
  loading, 
  disabled,
  label = "Save Gratitude"
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

export const GratitudeOnlySection = memo(({
  dayId,
  date
}: GratitudeOnlySectionProps) => {
  // State for the field
  const [gratitude, setGratitude] = useState('');

  // Get TRPC utils for invalidating queries
  const utils = api.useUtils();

  // Fetch existing notes
  const { data: gratitudeNotes } = api.note.getByDate.useQuery({
    date,
    type: 'gratitude'
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
        message: 'Your gratitude has been saved',
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
    if (gratitudeNotes?.[0]?.content) {
      setGratitude(gratitudeNotes[0].content);
    }
  }, [gratitudeNotes]);

  // Save function
  const saveGratitude = () => {
    if (dayId && gratitude.trim()) {
      createNote.mutate({
        content: gratitude,
        type: 'gratitude',
        dayId: parseInt(dayId, 10),
      });
    }
  };

  return (
    <Paper shadow="sm" p="md" radius="md" className="bg-surface-primary">
      <Stack gap="md">
        <Group>
          <IconStars className="text-purple-500" size={24} />
          <Title order={2} className="text-2xl">
            Gratitude
          </Title>
        </Group>
        <Textarea
          placeholder="I'm grateful for..."
          value={gratitude}
          onChange={(e) => setGratitude(e.target.value)}
          minRows={3}
          size="md"
          className="bg-surface-secondary"
          onKeyDown={(e) => {
            if (
              e.key === 'Enter' &&
              e.metaKey &&
              !createNote.isPending &&
              gratitude.trim() &&
              dayId
            ) {
              e.preventDefault();
              saveGratitude();
            }
          }}
        />
        <Group justify="space-between" align="center">
          <Text size="xs" c="dimmed">⌘↵ to save</Text>
          <SaveButton
            onClick={saveGratitude}
            loading={createNote.isPending}
            disabled={!gratitude.trim() || !dayId}
          />
        </Group>
      </Stack>
    </Paper>
  );
});

GratitudeOnlySection.displayName = 'GratitudeOnlySection'; 