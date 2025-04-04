'use client';

import { Paper, Title, Text, Stack, Textarea, Group, Button } from "@mantine/core";
import { IconGrowth } from "@tabler/icons-react";
import { memo, useState, useEffect } from 'react';
import { api } from "~/trpc/react";
import { notifications } from '@mantine/notifications';

interface LearningGrowthSectionProps {
  dayId?: string;
  date: Date;
}

const SaveButton = memo(({ 
  onClick, 
  loading, 
  disabled,
  label = "Save Learning & Growth"
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

export const LearningGrowthSection = memo(({
  dayId,
  date
}: LearningGrowthSectionProps) => {
  // State for the field
  const [learningGrowth, setLearningGrowth] = useState('');

  // Get TRPC utils for invalidating queries
  const utils = api.useUtils();

  // Fetch existing notes
  const { data: learningGrowthNotes } = api.note.getByDate.useQuery({
    date,
    type: 'learning-growth'
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
        message: 'Your learning and growth reflections have been saved',
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
    if (learningGrowthNotes?.[0]?.content) {
      setLearningGrowth(learningGrowthNotes[0].content);
    }
  }, [learningGrowthNotes]);

  // Save function
  const saveLearningGrowth = () => {
    if (dayId && learningGrowth.trim()) {
      createNote.mutate({
        content: learningGrowth,
        type: 'learning-growth',
        dayId: parseInt(dayId, 10),
      });
    }
  };

  return (
    <Paper shadow="sm" p="md" radius="md" className="bg-[#1E1E1E]">
      <Stack gap="md">
        <Group>
          <IconGrowth className="text-green-500" size={24} />
          <Title order={2} className="text-2xl">
            Learning and Growth
          </Title>
        </Group>
        <Textarea
          placeholder="What did I learn today?"
          value={learningGrowth}
          onChange={(e) => setLearningGrowth(e.target.value)}
          minRows={3}
          size="md"
          className="bg-[#262626]"
        />
        <SaveButton 
          onClick={saveLearningGrowth} 
          loading={createNote.isPending}
          disabled={!learningGrowth.trim() || !dayId}
        />
      </Stack>
    </Paper>
  );
});

LearningGrowthSection.displayName = 'LearningGrowthSection'; 