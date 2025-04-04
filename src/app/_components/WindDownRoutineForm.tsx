'use client';

import {
  Paper,
  Title,
  Text,
  Stack,
  Textarea,
  Group,
  Button,
  Checkbox,
  Divider,
} from "@mantine/core";
import { IconMoonStars, IconBrain, IconHeart, IconBolt } from "@tabler/icons-react";
import { useLocalStorage } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { useState, useEffect } from 'react';
import { WhatWentWellSection } from './sections/WhatWentWellSection';
import { EnergyReflectionSection } from './sections/EnergyReflectionSection';
import { LearningGrowthSection } from './sections/LearningGrowthSection';
import { ChallengesSection } from './sections/ChallengesSection';

interface DailyEntry {
  date: string;
  wentWell: string;
  energized: string;
  drained: string;
  gratitude: string;
  didMeditate: boolean;
  loggedFood: boolean;
  learnings: string;
  mistakes: string;
  causes: string;
  solutions: string;
}

type DailyEntries = Record<string, DailyEntry>;

const getTodayString = (): string => {
  const now = new Date();
  return now.toISOString().split('T')[0]!;
};

const createEmptyEntry = (date: string): DailyEntry => ({
  date,
  wentWell: '',
  energized: '',
  drained: '',
  gratitude: '',
  didMeditate: false,
  loggedFood: false,
  learnings: '',
  mistakes: '',
  causes: '',
  solutions: '',
});
interface WindDownRoutineProps {
  dayId?: string;
  date: Date;
}

export function WindDownRoutineForm({ dayId, date }: WindDownRoutineProps) {
  const todayString = getTodayString();
  
  // Local storage for daily entries
  const [dailyEntries, setDailyEntries] = useLocalStorage<DailyEntries>({
    key: 'wind-down-routine-entries',
    defaultValue: { [todayString]: createEmptyEntry(todayString) },
  });

  // Get today's entry or create a new one
  const todayEntry = dailyEntries[todayString] ?? createEmptyEntry(todayString);

  // Form state
  const [wentWell, setWentWell] = useState(todayEntry.wentWell);
  const [energized, setEnergized] = useState(todayEntry.energized);
  const [drained, setDrained] = useState(todayEntry.drained);
  const [gratitude, setGratitude] = useState(todayEntry.gratitude);
  const [didMeditate, setDidMeditate] = useState(todayEntry.didMeditate);
  const [loggedFood, setLoggedFood] = useState(todayEntry.loggedFood);
  const [learnings, setLearnings] = useState(todayEntry.learnings);
  const [mistakes, setMistakes] = useState(todayEntry.mistakes);
  const [causes, setCauses] = useState(todayEntry.causes);
  const [solutions, setSolutions] = useState(todayEntry.solutions);

  // Autosave functionality
  useEffect(() => {
    const autosaveInterval = setInterval(saveEntry, 30000); // Autosave every 30 seconds
    return () => clearInterval(autosaveInterval);
  }, [wentWell, energized, drained, gratitude, didMeditate, loggedFood, learnings, mistakes, causes, solutions]);

  // Save entry
  const saveEntry = () => {
    const updatedEntry: DailyEntry = {
      date: todayString,
      wentWell,
      energized,
      drained,
      gratitude,
      didMeditate,
      loggedFood,
      learnings,
      mistakes,
      causes,
      solutions,
    };

    setDailyEntries((prev: DailyEntries) => ({
      ...prev,
      [todayString]: updatedEntry,
    }));

    notifications.show({
      title: 'Progress Saved',
      message: 'Your evening reflection has been saved',
      color: 'blue',
    });
  };

  return (
    <Stack gap="xl">
      {/* What went well today */}
      <Paper shadow="sm" p="md" radius="md" className="bg-[#262626]">
        {/* What went well today - Using the new self-contained component */}
        <WhatWentWellSection dayId={dayId} date={date} />
      </Paper>
      <Divider my="sm" />
      
      {/* Energy Reflection */}
      <EnergyReflectionSection dayId={dayId} date={date} />
      
      {/* Learning and Growth */}
      <LearningGrowthSection dayId={dayId} date={date} />
      
      <Divider my="sm" />
      
      {/* Reflection on Challenges */}
      <ChallengesSection dayId={dayId} date={date} />

      

      {/* Daily Habits */}
      <Paper shadow="sm" p="md" radius="md" className="bg-[#262626]">
        <Stack gap="md">
          <Title order={2} className="text-2xl">Daily Habits</Title>
          <Group>
            <Checkbox
              label="Did you meditate today?"
              checked={didMeditate}
              onChange={(e) => setDidMeditate(e.currentTarget.checked)}
              size="md"
            />
            <Checkbox
              label="Did you log your food today?"
              checked={loggedFood}
              onChange={(e) => setLoggedFood(e.currentTarget.checked)}
              size="md"
            />
          </Group>
        </Stack>
      </Paper>

      <Group justify="space-between" className="sticky bottom-0 bg-[#1E1E1E] p-4 rounded-t-lg shadow-lg">
        <Text size="sm" c="dimmed">
          Last saved: {new Date().toLocaleTimeString()}
        </Text>
        <Button onClick={saveEntry} size="lg">
          Save Progress
        </Button>
      </Group>
    </Stack>
  );
} 