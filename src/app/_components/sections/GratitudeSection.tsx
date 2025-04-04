'use client';

import { Paper, Title, Text, Stack, Textarea, Group, Button, Divider } from "@mantine/core";
import { IconStars, IconBulb, IconHeartbeat, IconGrowth, IconMountain } from "@tabler/icons-react";
import { memo, useState, useEffect } from 'react';
import { api } from "~/trpc/react";

interface GratitudeSectionProps {
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

export const GratitudeSection = memo(({
  dayId,
  date
}: GratitudeSectionProps) => {
  // State for each field
  const [wentWell, setWentWell] = useState('');
  const [energyReflection, setEnergyReflection] = useState('');
  const [gratitude, setGratitude] = useState('');
  const [learningGrowth, setLearningGrowth] = useState('');
  const [challenges, setChallenges] = useState('');

  // Get TRPC utils for invalidating queries
  const utils = api.useUtils();

  // Fetch existing notes for each type
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

  // Create note mutation
  const createNote = api.note.create.useMutation({
    onSuccess: (data) => {
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

  useEffect(() => {
    if (energyReflectionNotes?.[0]?.content) {
      setEnergyReflection(energyReflectionNotes[0].content);
    }
  }, [energyReflectionNotes]);

  useEffect(() => {
    if (gratitudeNotes?.[0]?.content) {
      setGratitude(gratitudeNotes[0].content);
    }
  }, [gratitudeNotes]);

  useEffect(() => {
    if (learningGrowthNotes?.[0]?.content) {
      setLearningGrowth(learningGrowthNotes[0].content);
    }
  }, [learningGrowthNotes]);

  useEffect(() => {
    if (challengesNotes?.[0]?.content) {
      setChallenges(challengesNotes[0].content);
    }
  }, [challengesNotes]);

  // Save functions for each field
  const saveWentWell = () => {
    if (dayId && wentWell.trim()) {
      createNote.mutate({
        content: wentWell,
        type: 'went-well',
        dayId: parseInt(dayId, 10),
      });
    }
  };

  const saveEnergyReflection = () => {
    if (dayId && energyReflection.trim()) {
      createNote.mutate({
        content: energyReflection,
        type: 'energy-reflection',
        dayId: parseInt(dayId, 10),
      });
    }
  };

  const saveGratitude = () => {
    if (dayId && gratitude.trim()) {
      createNote.mutate({
        content: gratitude,
        type: 'gratitude',
        dayId: parseInt(dayId, 10),
      });
    }
  };

  const saveLearningGrowth = () => {
    if (dayId && learningGrowth.trim()) {
      createNote.mutate({
        content: learningGrowth,
        type: 'learning-growth',
        dayId: parseInt(dayId, 10),
      });
    }
  };

  const saveChallenges = () => {
    if (dayId && challenges.trim()) {
      createNote.mutate({
        content: challenges,
        type: 'challenges',
        dayId: parseInt(dayId, 10),
      });
    }
  };

  return (
    <Paper shadow="sm" p="md" radius="md" className="bg-[#1E1E1E]">
      <Stack gap="lg">
        {/* What went well today */}
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
            label="Save What Went Well"
          />
        </Stack>

        <Divider my="sm" />

        {/* Energy Reflection */}
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
            label="Save Energy Reflection"
          />
        </Stack>

        <Divider my="sm" />

        {/* Gratitude */}
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
            className="bg-[#262626]"
          />
          <SaveButton 
            onClick={saveGratitude} 
            loading={createNote.isPending}
            disabled={!gratitude.trim() || !dayId}
            label="Save Gratitude"
          />
        </Stack>

        <Divider my="sm" />

        {/* Learning and Growth */}
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
            label="Save Learning & Growth"
          />
        </Stack>

        <Divider my="sm" />

        {/* Reflection on Challenges */}
        <Stack gap="md">
          <Group>
            <IconMountain className="text-amber-500" size={24} />
            <Title order={2} className="text-2xl">
              Reflection on Challenges
            </Title>
          </Group>
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
        </Stack>
      </Stack>
    </Paper>
  );
});

GratitudeSection.displayName = 'GratitudeSection'; 