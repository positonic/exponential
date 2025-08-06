'use client';

import { Paper, Title, Stack, Textarea, Group, Button } from "@mantine/core";
import { IconBulb } from "@tabler/icons-react";
import { memo, useState, useEffect } from 'react';
import { api } from "~/trpc/react";
import { notifications } from '@mantine/notifications';

interface WhatWentWellSectionProps {
  dayId?: string;
  date: Date;
}

const SaveButton = memo(({ 
  onClick, 
  loading, 
  disabled,
  label = "Save What Went Well"
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

export const WhatWentWellSection = memo(({
  dayId,
  date
}: WhatWentWellSectionProps) => {
  // State for the field
  const [wentWell, setWentWell] = useState('');

  // Get TRPC utils for invalidating queries
  const utils = api.useUtils();

  // Fetch existing notes
  const { data: wentWellNotes } = api.note.getByDate.useQuery({
    date,
    type: 'went-well'
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
        message: 'Your "What went well" entry has been saved',
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
    if (wentWellNotes?.[0]?.content) {
      setWentWell(wentWellNotes[0].content);
    }
  }, [wentWellNotes]);

  // Save function
  const saveWentWell = () => {
    if (dayId && wentWell.trim()) {
      createNote.mutate({
        content: wentWell,
        type: 'went-well',
        dayId: parseInt(dayId, 10),
      });
    }
  };

  return (
    <Paper shadow="sm" p="md" radius="md" className="bg-[#1E1E1E]">
      <Stack gap="md">
        <Group>
          <IconBulb className="text-blue-500" size={24} />
          <Title order={2} className="text-2xl">
            What went well today?
          </Title>
        </Group>
        <Textarea
          placeholder="Things that went well today..."
          value={wentWell}
          onChange={(e) => setWentWell(e.target.value)}
          minRows={3}
          size="md"
          className="bg-[#262626]"
        />
        <SaveButton 
          onClick={saveWentWell} 
          loading={createNote.isPending}
          disabled={!wentWell.trim() || !dayId}
        />
      </Stack>
    </Paper>
  );
});

WhatWentWellSection.displayName = 'WhatWentWellSection'; 