'use client';

import { Paper, Title, Text, Stack, Textarea, Group, Button, Divider } from "@mantine/core";
import { IconMountain } from "@tabler/icons-react";
import { memo, useState, useEffect } from 'react';
import { api } from "~/trpc/react";
import { notifications } from '@mantine/notifications';

interface ChallengesSectionProps {
  dayId?: string;
  date: Date;
}

const SaveButton = memo(({ 
  onClick, 
  loading, 
  disabled,
  label = "Save"
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

export const ChallengesSection = memo(({
  dayId,
  date
}: ChallengesSectionProps) => {
  // State for all fields
  const [challenges, setChallenges] = useState('');
  const [mistakes, setMistakes] = useState('');
  const [causes, setCauses] = useState('');
  const [solutions, setSolutions] = useState('');

  // Get TRPC utils for invalidating queries
  const utils = api.useUtils();

  // Fetch existing notes for all types
  const { data: challengesNotes } = api.note.getByDate.useQuery({
    date,
    type: 'challenges'
  }, {
    enabled: !!dayId,
    staleTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });

  const { data: mistakesNotes } = api.note.getByDate.useQuery({
    date,
    type: 'mistakes'
  }, {
    enabled: !!dayId,
    staleTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });

  const { data: causesNotes } = api.note.getByDate.useQuery({
    date,
    type: 'causes'
  }, {
    enabled: !!dayId,
    staleTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });

  const { data: solutionsNotes } = api.note.getByDate.useQuery({
    date,
    type: 'solutions'
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
        message: `Your ${data.type} has been saved`,
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
    if (challengesNotes?.[0]?.content) {
      setChallenges(challengesNotes[0].content);
    }
  }, [challengesNotes]);

  useEffect(() => {
    if (mistakesNotes?.[0]?.content) {
      setMistakes(mistakesNotes[0].content);
    }
  }, [mistakesNotes]);

  useEffect(() => {
    if (causesNotes?.[0]?.content) {
      setCauses(causesNotes[0].content);
    }
  }, [causesNotes]);

  useEffect(() => {
    if (solutionsNotes?.[0]?.content) {
      setSolutions(solutionsNotes[0].content);
    }
  }, [solutionsNotes]);

  // Save functions for each field
  const saveChallenges = () => {
    if (dayId && challenges.trim()) {
      createNote.mutate({
        content: challenges,
        type: 'challenges',
        dayId: parseInt(dayId, 10),
      });
    }
  };

  const saveMistakes = () => {
    if (dayId && mistakes.trim()) {
      createNote.mutate({
        content: mistakes,
        type: 'mistakes',
        dayId: parseInt(dayId, 10),
      });
    }
  };

  const saveCauses = () => {
    if (dayId && causes.trim()) {
      createNote.mutate({
        content: causes,
        type: 'causes',
        dayId: parseInt(dayId, 10),
      });
    }
  };

  const saveSolutions = () => {
    if (dayId && solutions.trim()) {
      createNote.mutate({
        content: solutions,
        type: 'solutions',
        dayId: parseInt(dayId, 10),
      });
    }
  };

  return (
    <Paper shadow="sm" p="md" radius="md" className="bg-[#1E1E1E]">
      <Stack gap="md">
        <Group>
          <IconMountain className="text-amber-500" size={24} />
          <Title order={2} className="text-2xl">
            Reflection on Challenges
          </Title>
        </Group>

        {/* General challenges reflection */}
        <Textarea
          placeholder="How did I handle challenges today?"
          value={challenges}
          onChange={(e) => setChallenges(e.target.value)}
          minRows={3}
          size="md"
          className="bg-[#262626]"
        />
        <SaveButton 
          onClick={saveChallenges} 
          loading={createNote.isPending}
          disabled={!challenges.trim() || !dayId}
          label="Save Challenges Reflection"
        />

        <Divider my="sm" />

        {/* Mistakes */}
        <Textarea
          label="Where did you fall from grace?"
          placeholder="Reflect on any mistakes or areas for improvement..."
          value={mistakes}
          onChange={(e) => setMistakes(e.target.value)}
          minRows={3}
          size="md"
          className="bg-[#262626]"
        />
        <SaveButton 
          onClick={saveMistakes} 
          loading={createNote.isPending}
          disabled={!mistakes.trim() || !dayId}
          label="Save Mistakes"
        />

        {/* Causes */}
        <Textarea
          label="What caused that?"
          placeholder="Analyze the root causes..."
          value={causes}
          onChange={(e) => setCauses(e.target.value)}
          minRows={3}
          size="md"
          className="bg-[#262626]"
        />
        <SaveButton 
          onClick={saveCauses} 
          loading={createNote.isPending}
          disabled={!causes.trim() || !dayId}
          label="Save Causes"
        />

        {/* Solutions */}
        <Textarea
          label="The next time this happens, what can you do about it?"
          placeholder="Plan your future responses..."
          value={solutions}
          onChange={(e) => setSolutions(e.target.value)}
          minRows={3}
          size="md"
          className="bg-[#262626]"
        />
        <SaveButton 
          onClick={saveSolutions} 
          loading={createNote.isPending}
          disabled={!solutions.trim() || !dayId}
          label="Save Solutions"
        />
      </Stack>
    </Paper>
  );
});

ChallengesSection.displayName = 'ChallengesSection'; 