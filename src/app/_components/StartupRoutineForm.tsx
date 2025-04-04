'use client';

import {
  Paper,
  Title,
  Text,
  Stack,
  TextInput,
  Checkbox,
  Textarea,
  Group,
  Button,
  Accordion,
  List,
  Loader,
} from "@mantine/core";
import { IconBulb, IconWriting, IconStars, IconList, IconSettings } from "@tabler/icons-react";
import { notifications } from '@mantine/notifications';
import { useState, useEffect, useMemo, useCallback, memo } from 'react';
import { RichTextEditor, Link } from '@mantine/tiptap';
import { useEditor } from '@tiptap/react';
import Highlight from '@tiptap/extension-highlight';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Superscript from '@tiptap/extension-superscript';
import SubScript from '@tiptap/extension-subscript';
import '@mantine/tiptap/styles.css';
import { api } from "~/trpc/react";
import { WindDownRoutineForm } from './WindDownRoutineForm';
import { startOfDay } from 'date-fns';

// Import section components
import { GratitudeSection } from './sections/GratitudeSection';
import { JournalSection } from './sections/JournalSection';
import { OutcomeSection } from './sections/OutcomeSection';
import { ExerciseSection } from './sections/ExerciseSection';
import { NotToDoSection } from './sections/NotToDoSection';
import { ConfigurationSection } from './sections/ConfigurationSection';
import { WhatWentWellSection } from './sections/WhatWentWellSection';
import { EnergyReflectionSection } from './sections/EnergyReflectionSection';
import { GratitudeOnlySection } from './sections/GratitudeOnlySection';
import { LearningGrowthSection } from './sections/LearningGrowthSection';
import { ChallengesSection } from './sections/ChallengesSection';

interface StartupRoutineState {
  intention: string;
  gratitude: string;
  exercise: string;
  journalName: string;
  journalContent: string;
  notToDo: string[];
  completedItems: string[];
}

const getTodayString = (): string => {
  const now = new Date();
  return now.toISOString().split('T')[0]!;
};

const todayString = getTodayString();

// Create optimized button components
const SaveButton = memo(({ 
  onClick, 
  loading, 
  disabled, 
  size,
  children = "Save All Progress"
}: { 
  onClick: () => void; 
  loading: boolean; 
  disabled: boolean;
  size?: string;
  children?: React.ReactNode;
}) => (
  <Button 
    onClick={onClick} 
    loading={loading} 
    disabled={disabled}
    size={size}
  >
    {children}
  </Button>
));

SaveButton.displayName = 'SaveButton';

export function StartupRoutineForm() {
  const todayString = getTodayString();
  
  // Memoize the date object to prevent recreating it on each render
  const today = useMemo(() => new Date(todayString), [todayString]);
  
  // Configuration state
  const [doMindset, setDoMindset] = useState(false);
  const [doConsider, setDoConsider] = useState(false);
  const [doNotToDo, setDoNotToDo] = useState(false);
  const [doQuestions, setDoQuestions] = useState(false);
  
  // New state for outcome input
  const [newOutcome, setNewOutcome] = useState("");
  
  // Get TRPC utils for invalidating queries
  const utils = api.useUtils();
  
  // Get today's day entry
  const { data: dayData, isLoading: isDayLoading } = api.day.getByDate.useQuery({ 
    date: today
  }, {
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
  });

  // Create a day if it doesn't exist - memoize the mutation to stabilize it
  const createUserDay = api.day.createUserDay.useMutation({
    onSuccess: (data) => {
      // Refetch the day data to get the new day ID
      void utils.day.getByDate.invalidate({ date: today });
    },
    onError: (error) => {
      console.error("Failed to create day:", error);
    }
  });

  // Create day if needed using a stable callback
  const createDayIfNeeded = useCallback(() => {
    if (!dayData && !isDayLoading && !createUserDay.isPending) {
      createUserDay.mutate({ date: today });
    }
  }, [dayData, isDayLoading, createUserDay.isPending, createUserDay.mutate, today]);

  // Use a more controlled effect that only runs once on mount and when day data changes
  useEffect(() => {
    createDayIfNeeded();
  }, [createDayIfNeeded]);
  
  // Only fetch notes once we have a day ID
  const dayId = dayData?.id;
  
  // Get notes for today - with proper dependency tracking and caching
  const { data: gratitudeNotes } = api.note.getByDate.useQuery({
    date: today,
    type: 'gratitude'
  }, {
    enabled: !!dayId,
    staleTime: 60 * 60 * 1000, // 1 hour - increase cache time
    refetchOnWindowFocus: false,
    refetchOnMount: false, // Don't refetch on component mount
    refetchOnReconnect: false, // Don't refetch on reconnect
  });

  const { data: journalNotes } = api.note.getByDate.useQuery({
    date: today,
    type: 'journal'
  }, {
    enabled: !!dayId,
    staleTime: 60 * 60 * 1000, // 1 hour - increase cache time
    refetchOnWindowFocus: false,
    refetchOnMount: false, // Don't refetch on component mount
    refetchOnReconnect: false, // Don't refetch on reconnect
  });
  
  // Fetch not-to-do items and completed items
  const { data: notToDoNotes } = api.note.getByDate.useQuery({
    date: today,
    type: 'not-to-do'
  }, {
    enabled: !!dayId,
    staleTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });
  
  const { data: completedItemsNotes } = api.note.getByDate.useQuery({
    date: today,
    type: 'completed-items'
  }, {
    enabled: !!dayId,
    staleTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });
  
  const { data: exerciseNotes } = api.note.getByDate.useQuery({
    date: today,
    type: 'exercise'
  }, {
    enabled: !!dayId,
    staleTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });

  // Create note mutation
  const createNote = api.note.create.useMutation({
    onSuccess: () => {
      notifications.show({
        title: 'Saved',
        message: 'Your entry has been saved to the database',
        color: 'green',
      });
      // Only invalidate if we have a day ID
      if (dayId) {
        void utils.note.getByDate.invalidate({ date: today, type: 'gratitude' });
        void utils.note.getByDate.invalidate({ date: today, type: 'journal' });
      }
    },
  });
  
  // Outcome creation mutation
  const createOutcome = api.outcome.createOutcome.useMutation({
    onSuccess: () => {
      setNewOutcome("");
      notifications.show({
        title: 'Outcome Created',
        message: 'Your outcome has been created successfully',
        color: 'green',
      });
    },
  });

  // Initialize form state from database
  const [intention, setIntention] = useState('');
  const [gratitude, setGratitude] = useState('');
  const [exercise, setExercise] = useState('');
  const [journalName, setJournalName] = useState('');
  const [journalContent, setJournalContent] = useState('');
  const [notToDo, setNotToDo] = useState<string[]>([]);
  const [completedItems, setCompletedItems] = useState<string[]>([]);
  const [newNotToDo, setNewNotToDo] = useState('');
  
  // Update form state when data from API changes
  useEffect(() => {
    if (gratitudeNotes?.[0]?.content) {
      setGratitude(gratitudeNotes[0].content);
    }
  }, [gratitudeNotes]);

  useEffect(() => {
    if (journalNotes?.[0]?.content) {
      setJournalContent(journalNotes[0].content);
    }
  }, [journalNotes]);
  
  useEffect(() => {
    if (exerciseNotes?.[0]?.content) {
      setExercise(exerciseNotes[0].content);
    }
  }, [exerciseNotes]);
  
  useEffect(() => {
    if (notToDoNotes?.[0]?.content) {
      try {
        const parsedItems = JSON.parse(notToDoNotes[0].content);
        if (Array.isArray(parsedItems)) {
          setNotToDo(parsedItems);
        }
      } catch (e) {
        console.error("Failed to parse not-to-do items:", e);
      }
    }
  }, [notToDoNotes]);
  
  useEffect(() => {
    if (completedItemsNotes?.[0]?.content) {
      try {
        const parsedItems = JSON.parse(completedItemsNotes[0].content);
        if (Array.isArray(parsedItems)) {
          setCompletedItems(parsedItems);
        }
      } catch (e) {
        console.error("Failed to parse completed items:", e);
      }
    }
  }, [completedItemsNotes]);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Link,
      Superscript,
      SubScript,
      Highlight,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
    ],
    content: journalContent,
    onUpdate: ({ editor }) => {
      setJournalContent(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: 'min-h-[300px] prose prose-invert max-w-none',
      },
    },
    immediatelyRender: false,
  }, []);

  useEffect(() => {
    if (editor && editor.getHTML() !== journalContent && journalContent) {
      editor.commands.setContent(journalContent);
    }
  }, [journalContent, editor]);

  // Add a mutation for saving not-to-do items and completed items
  const saveNotToDoMutation = api.note.create.useMutation({
    onSuccess: () => {
      notifications.show({
        title: 'Saved',
        message: 'Your not-to-do items have been saved',
        color: 'green',
      });
      if (dayId) {
        void utils.note.getByDate.invalidate({ date: today, type: 'not-to-do' });
      }
    }
  });

  const saveCompletedItemsMutation = api.note.create.useMutation({
    onSuccess: () => {
      notifications.show({
        title: 'Saved',
        message: 'Your completed items have been saved',
        color: 'green',
      });
      if (dayId) {
        void utils.note.getByDate.invalidate({ date: today, type: 'completed-items' });
      }
    }
  });

  // Update the saveEntry function to save everything to the database
  const saveEntry = useCallback(() => {
    // Only save to database if we have a day ID
    if (dayData && 'id' in dayData) {
      // Save gratitude
      if (gratitude.trim()) {
        createNote.mutate({
          content: gratitude,
          type: 'gratitude',
          dayId: dayData.id,
        });
      }

      // Save journal
      if (journalContent.trim()) {
        createNote.mutate({
          content: journalContent,
          type: 'journal',
          title: journalName || 'Daily Journal',
          dayId: dayData.id,
        });
      }
      
      // Save not-to-do items
      if (notToDo.length > 0) {
        saveNotToDoMutation.mutate({
          content: JSON.stringify(notToDo),
          type: 'not-to-do',
          dayId: dayData.id,
        });
      }
      
      // Save completed items
      if (completedItems.length > 0) {
        saveCompletedItemsMutation.mutate({
          content: JSON.stringify(completedItems),
          type: 'completed-items',
          dayId: dayData.id,
        });
      }
      
      // Save exercise
      if (exercise.trim()) {
        createNote.mutate({
          content: exercise,
          type: 'exercise',
          dayId: dayData.id,
        });
      }
    } else {
      notifications.show({
        title: 'Error',
        message: 'Unable to save entries. Please try again later.',
        color: 'red',
      });
    }
  }, [
    gratitude, journalContent, journalName, notToDo, 
    completedItems, exercise, dayData, createNote,
    saveNotToDoMutation, saveCompletedItemsMutation
  ]);

  // Update the toggle completion function to save to the database
  const toggleCompletion = (item: string) => {
    setCompletedItems(prev => {
      const newItems = prev.includes(item)
        ? prev.filter(i => i !== item)
        : [...prev, item];
      
      // Save to database if we have a day ID
      if (dayData && 'id' in dayData) {
        saveCompletedItemsMutation.mutate({
          content: JSON.stringify(newItems),
          type: 'completed-items',
          dayId: dayData.id,
        });
      }
      
      return newItems;
    });
  };

  // Update the add not-to-do function to save to the database
  const addNotToDo = () => {
    if (newNotToDo.trim()) {
      const updatedItems = [...notToDo, newNotToDo.trim()];
      setNotToDo(updatedItems);
      setNewNotToDo('');
      
      // Save to database if we have a day ID
      if (dayData && 'id' in dayData) {
        saveNotToDoMutation.mutate({
          content: JSON.stringify(updatedItems),
          type: 'not-to-do',
          dayId: dayData.id,
        });
      }
    }
  };

  // Handler for adding outcomes
  const handleAddOutcome = useCallback(() => {
    if (!newOutcome.trim()) return;
    createOutcome.mutate({
      description: newOutcome,
      dueDate: new Date(),
    });
  }, [newOutcome, createOutcome]);

  // Add the exercise creation mutation
  const createUserExercise = api.exercise.createUserExercise.useMutation({
    onSuccess: () => {
      notifications.show({
        title: 'Exercise Added',
        message: 'Your exercise has been saved successfully',
        color: 'green',
      });
      if (dayId) {
        void utils.exercise.getUserExercises.invalidate({ dayId });
      }
    }
  });

  // Handler for adding a user exercise
  const handleAddExercise = useCallback(() => {
    if (!exercise.trim() || !dayData?.id) return;
    
    createUserExercise.mutate({
      title: exercise,
      dayId: dayData.id
    });
  }, [exercise, dayData, createUserExercise]);

  return (
    <Stack gap="xl">
      <Accordion 
        defaultValue={["diverge", "converge", "winddown", "configure"]} 
        multiple 
        variant="filled"
        styles={{
          item: {
            backgroundColor: 'transparent',
            border: 'none',
          },
          control: {
            padding: 0,
            marginBottom: '1rem',
          },
          chevron: {
            display: 'none',
          },
          content: {
            padding: 0,
          },
          panel: {
            padding: 0,
          },
        }}
      >
        <Accordion.Item value="diverge">
          <Accordion.Control>
            <Title order={2} className="text-2xl bg-gradient-to-r from-yellow-500 to-amber-500 bg-clip-text text-transparent">
              Diverge
            </Title>
          </Accordion.Control>
          <Accordion.Panel>
            <Paper shadow="sm" p="lg" radius="md" className="bg-[#262626] border border-yellow-900/30">
              <Stack gap="md">
                <Text c="dimmed" size="sm" className="italic">
                  Expand your thinking—generate ideas freely without judgment. Let your mind explore possibilities and capture all thoughts, whether they seem practical or not.
                </Text>

                
                {/* Gratitude Section */}
                <GratitudeOnlySection 
                  dayId={dayData?.id?.toString()}
                  date={today}
                />

                {/* Journal Section */}
                <JournalSection 
                  journalContent={journalContent}
                  setJournalContent={setJournalContent}
                  saveJournal={saveEntry}
                  isSaving={createNote.isPending}
                  isDisabled={createUserDay.isPending}
                />
              </Stack>
            </Paper>
          </Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item value="converge">
          <Accordion.Control>
            <Title order={2} className="text-2xl bg-gradient-to-r from-blue-500 to-cyan-500 bg-clip-text text-transparent">
              Converge
            </Title>
          </Accordion.Control>
          <Accordion.Panel>
            <Paper shadow="sm" p="lg" radius="md" className="bg-[#262626] border border-blue-900/30">
              <Stack gap="md">
                <Text c="dimmed" size="sm" className="italic">
                  Focus and prioritize—transform your ideas into actionable steps. Define what matters most and create clear intentions for your day.
                </Text>

                {/* What would make today great */}
                <OutcomeSection 
                  newOutcome={newOutcome}
                  setNewOutcome={setNewOutcome}
                  addOutcome={handleAddOutcome}
                  isLoading={createOutcome.isPending}
                />

                {/* Exercise Section */}
                <ExerciseSection
                  exercise={exercise}
                  setExercise={setExercise}
                  saveExercise={handleAddExercise}
                  isSaving={createUserExercise.isPending}
                  isDisabled={createUserDay.isPending}
                />

                {/* Not-to-Do List */}
                {doNotToDo && (
                  <NotToDoSection 
                    notToDo={notToDo}
                    newNotToDo={newNotToDo}
                    setNewNotToDo={setNewNotToDo}
                    addNotToDo={addNotToDo}
                    completedItems={completedItems}
                    toggleCompletion={toggleCompletion}
                  />
                )}

                {/* Consider Section - Axioms */}
                {doConsider && <Paper shadow="sm" p="md" radius="md" className="bg-[#1E1E1E]">
                  <Stack gap="md">
                    <Title order={2} className="text-2xl">Consider</Title>
                    <Text size="lg" fw={500} className="text-purple-400">
                      Axioms
                    </Text>
                    <List spacing="sm">
                      {[
                        'Confidence is comfort with failure',
                        'Selfish behaviour stems from lack of self respect',
                        'Who you blame is who you give your power to',
                        'Nothing meaningful in life is easy, nothing easy in life is meaningful',
                        'People respect you only as much as you respect yourself'
                      ].map((axiom: string, index: number) => (
                        <List.Item key={index}>
                          <Checkbox
                            label={axiom}
                            checked={completedItems.includes(`axiom-${index}`)}
                            onChange={() => toggleCompletion(`axiom-${index}`)}
                            className="my-1"
                          />
                        </List.Item>
                      ))}
                    </List>
                  </Stack>
                </Paper>}

                {/* Important Questions */}
                {doQuestions && <Paper shadow="sm" p="md" radius="md" className="bg-[#1E1E1E]">
                  <Stack gap="md">
                    <Title order={2} className="text-2xl">Important questions</Title>
                    <Text c="dimmed">You want to consider daily</Text>
                    <List spacing="sm">
                      {[
                        'How do I feel today?',
                        'What are you currently procrastinating on?',
                        'How can I respect myself today?',
                        'What negative emotions do I often feel?',
                        'What positive emotions do I often feel?'
                      ].map((question: string, index: number) => (
                        <List.Item key={index}>
                          <Checkbox
                            label={question}
                            checked={completedItems.includes(`question-${index}`)}
                            onChange={() => toggleCompletion(`question-${index}`)}
                            className="my-1"
                          />
                        </List.Item>
                      ))}
                    </List>
                  </Stack>
                </Paper>}

                {/* Mindset Section */}
                {doMindset && <Paper shadow="sm" p="md" radius="md" className="bg-[#1E1E1E]">
                  <Stack gap="md">
                    <Title order={2} className="text-2xl">Mindset</Title>
                    <Text c="dimmed">At least 2 minutes</Text>
                    <Button 
                      variant="light" 
                      color="blue" 
                      size="lg"
                      className="w-full"
                      onClick={() => toggleCompletion('mindset-sculpting')}
                      data-completed={completedItems.includes('mindset-sculpting')}
                    >
                      Mindset and identity sculpting
                    </Button>
                    <Button 
                      variant="light" 
                      color="grape" 
                      size="lg"
                      className="w-full"
                      onClick={() => toggleCompletion('visualization')}
                      data-completed={completedItems.includes('visualization')}
                    >
                      Do your visualization at this point
                    </Button>
                  </Stack>
                </Paper>}
              </Stack>
            </Paper>
          </Accordion.Panel>
        </Accordion.Item>

        {/* Wind Down Section */}
        <Accordion.Item value="winddown">
          <Accordion.Control>
            <Title order={2} className="text-2xl bg-gradient-to-r from-green-500 to-emerald-500 bg-clip-text text-transparent">
              Synthesize
            </Title>
          </Accordion.Control>
          <Accordion.Panel>
            <Paper shadow="sm" p="lg" radius="md" className="bg-[#262626] border border-green-900/30">
              <Stack gap="md">
                <Text c="dimmed" size="sm" className="italic">
                  End your day mindfully—reflect, plan, and prepare for restful sleep.
                </Text>
                <WindDownRoutineForm dayId={dayData?.id?.toString()} date={today}/>
              </Stack>
            </Paper>
          </Accordion.Panel>
        </Accordion.Item>

        {/* Configure Section */}
        <Accordion.Item value="configure">
          <Accordion.Control>
            <IconSettings size={24} className="text-white" />
          </Accordion.Control>
          <Accordion.Panel>
            <Paper shadow="sm" p="lg" radius="md" className="bg-[#262626] border border-purple-900/30">
              <ConfigurationSection
                doMindset={doMindset}
                setDoMindset={setDoMindset}
                doConsider={doConsider}
                setDoConsider={setDoConsider}
                doNotToDo={doNotToDo}
                setDoNotToDo={setDoNotToDo}
                doQuestions={doQuestions}
                setDoQuestions={setDoQuestions}
              />
            </Paper>
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>

      <Group justify="space-between" className="sticky bottom-0 bg-[#1E1E1E] p-4 rounded-t-lg shadow-lg">
        <Text size="sm" c="dimmed" component="div">
          {isDayLoading || !dayData ? (
            <Group gap="xs"><Loader size="xs" />Creating day record...</Group>
          ) : (
            `Last saved: ${new Date().toLocaleTimeString()}`
          )}
        </Text>
        <SaveButton 
          onClick={saveEntry} 
          loading={createNote.isPending}
          disabled={createUserDay.isPending}
          size="lg"
        >
          Save All Progress
        </SaveButton>
      </Group>
    </Stack>
  );
} 