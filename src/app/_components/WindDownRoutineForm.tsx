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
} from "@mantine/core";
import { IconMoonStars, IconBrain, IconHeart, IconBolt } from "@tabler/icons-react";
import { useLocalStorage } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { useState, useEffect } from 'react';

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

export function WindDownRoutineForm() {
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
        <Stack gap="md">
          <Group>
            <IconMoonStars className="text-blue-400" size={24} />
            <Title order={2} className="text-2xl">
              What went well today?
            </Title>
          </Group>
          <Textarea
            placeholder="Reflect on your achievements and positive moments..."
            value={wentWell}
            onChange={(e) => setWentWell(e.target.value)}
            minRows={3}
            size="md"
            className="bg-[#1E1E1E]"
          />
        </Stack>
      </Paper>

      {/* Energy Section */}
      <Paper shadow="sm" p="md" radius="md" className="bg-[#262626]">
        <Stack gap="md">
          <Group>
            <IconBolt className="text-yellow-400" size={24} />
            <Title order={2} className="text-2xl">
              Energy Reflection
            </Title>
          </Group>
          <Textarea
            label="What energized you today?"
            placeholder="What activities or interactions gave you energy?"
            value={energized}
            onChange={(e) => setEnergized(e.target.value)}
            minRows={3}
            size="md"
            className="bg-[#1E1E1E]"
          />
          <Textarea
            label="What drained you today?"
            placeholder="What activities or situations depleted your energy?"
            value={drained}
            onChange={(e) => setDrained(e.target.value)}
            minRows={3}
            size="md"
            className="bg-[#1E1E1E]"
          />
        </Stack>
      </Paper>

      {/* Gratitude Section */}
      <Paper shadow="sm" p="md" radius="md" className="bg-[#262626]">
        <Stack gap="md">
          <Group>
            <IconHeart className="text-red-400" size={24} />
            <Title order={2} className="text-2xl">
              Gratitude
            </Title>
          </Group>
          <Textarea
            placeholder="What are you grateful for today?"
            value={gratitude}
            onChange={(e) => setGratitude(e.target.value)}
            minRows={3}
            size="md"
            className="bg-[#1E1E1E]"
          />
        </Stack>
      </Paper>

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

      {/* Learning and Growth */}
      <Paper shadow="sm" p="md" radius="md" className="bg-[#262626]">
        <Stack gap="md">
          <Group>
            <IconBrain className="text-purple-400" size={24} />
            <Title order={2} className="text-2xl">
              Learning and Growth
            </Title>
          </Group>
          <Textarea
            label="What did you learn today?"
            placeholder="Share your insights and discoveries..."
            value={learnings}
            onChange={(e) => setLearnings(e.target.value)}
            minRows={3}
            size="md"
            className="bg-[#1E1E1E]"
          />
        </Stack>
      </Paper>

      {/* Reflection on Mistakes */}
      <Paper shadow="sm" p="md" radius="md" className="bg-[#262626]">
        <Stack gap="md">
          <Title order={2} className="text-2xl">Reflection on Challenges</Title>
          <Textarea
            label="Where did you fall from grace?"
            placeholder="Reflect on any mistakes or areas for improvement..."
            value={mistakes}
            onChange={(e) => setMistakes(e.target.value)}
            minRows={3}
            size="md"
            className="bg-[#1E1E1E]"
          />
          <Textarea
            label="What caused that?"
            placeholder="Analyze the root causes..."
            value={causes}
            onChange={(e) => setCauses(e.target.value)}
            minRows={3}
            size="md"
            className="bg-[#1E1E1E]"
          />
          <Textarea
            label="The next time this happens, what can you do about it?"
            placeholder="Plan your future responses..."
            value={solutions}
            onChange={(e) => setSolutions(e.target.value)}
            minRows={3}
            size="md"
            className="bg-[#1E1E1E]"
          />
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