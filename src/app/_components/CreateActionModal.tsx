import { Modal, TextInput, Textarea, Button, Group, ActionIcon, Select, Popover, Stack, UnstyledButton, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconCalendar, IconAlarm, IconDots, IconChevronLeft, IconChevronRight, IconClock } from '@tabler/icons-react';
import { useState } from "react";
import { api } from "~/trpc/react";
import { type RouterOutputs } from "~/trpc/react";
import { notifications } from '@mantine/notifications';

type Action = RouterOutputs["action"]["getAll"][0];

type ActionPriority = 
  | "1st Priority"
  | "2nd Priority"
  | "3rd Priority"
  | "4th Priority"
  | "5th Priority"
  | "Quick"
  | "Scheduled"
  | "Errand"
  | "Remember"
  | "Watch"
  | "Someday Maybe";

const PRIORITY_OPTIONS: ActionPriority[] = [
  "1st Priority",
  "2nd Priority",
  "3rd Priority",
  "4th Priority",
  "5th Priority",
  "Quick",
  "Scheduled",
  "Errand",
  "Remember",
  "Watch"
];

// Helper functions
const getNextWeekDate = () => {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  return date;
};

const getNextWeekendDate = () => {
  const date = new Date();
  while (date.getDay() !== 6) {
    date.setDate(date.getDate() + 1);
  }
  return date;
};

export function CreateActionModal({ viewName }: { viewName: string }) {
  
  const initProjectId = (viewName.includes("project-")) ? viewName.split("-")[2] : '';
  const [opened, { open, close }] = useDisclosure(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [projectId, setProjectId] = useState(initProjectId);
  const [priority, setPriority] = useState<ActionPriority>("Quick");
  const [dueDate, setDueDate] = useState<Date | null>(null);

  const utils = api.useUtils();
  const projects = api.project.getAll.useQuery();

  const createAction = api.action.create.useMutation({
    onMutate: async (newAction) => {
      // Cancel all related queries
      const queriesToCancel = [
        utils.project.getAll,
        utils.action.getAll,
        utils.action.getToday,
      ];
      await Promise.all(queriesToCancel.map(query => query.cancel()));

      // Snapshot all previous states
      const previousState = {
        projects: utils.project.getAll.getData(),
        actions: utils.action.getAll.getData(),
        todayActions: utils.action.getToday.getData(),
      };

      // Create optimistic action
      const optimisticAction = {
        id: `temp-${Date.now()}`,
        name: newAction.name,
        description: newAction.description ?? null,
        status: "ACTIVE",
        priority: newAction.priority ?? "Quick",
        projectId: newAction.projectId ?? null,
        createdById: previousState.projects?.[0]?.createdById ?? "",
        dueDate: newAction.dueDate ?? null,
        project: newAction.projectId 
          ? previousState.projects?.find(p => p.id === newAction.projectId) ?? null
          : null,
      } satisfies Action;

      // Helper function to add action to a list
      const addActionToList = (list: Action[] | undefined) => {
        if (!list) return [optimisticAction];
        return [...list, optimisticAction];
      };

      // Update all action lists
      utils.action.getAll.setData(undefined, addActionToList);

      // Update today's actions - only if we're in the today view
      if (viewName.toLowerCase() === 'today') {
        utils.action.getToday.setData(undefined, addActionToList);
      }

      // Update project if action belongs to one
      if (newAction.projectId) {
        utils.project.getAll.setData(undefined, (old) => {
          if (!old) return previousState.projects;
          
          return old.map(project => 
            project.id === newAction.projectId
              ? {
                  ...project,
                  actions: Array.isArray(project.actions)
                    ? [...project.actions, optimisticAction]
                    : [optimisticAction],
                }
              : project
          );
        });
      }

      return previousState;
    },

    onError: (err, newAction, context) => {
      if (!context) return;

      // Restore all previous states
      const { projects, actions, todayActions } = context;
      utils.project.getAll.setData(undefined, projects);
      utils.action.getAll.setData(undefined, actions);
      utils.action.getToday.setData(undefined, todayActions);
    },

    onSettled: async () => {
      // Invalidate all related queries
      const queriesToInvalidate = [
        utils.project.getAll,
        utils.action.getAll,
        utils.action.getToday,
      ];
      await Promise.all(queriesToInvalidate.map(query => query.invalidate()));
    },

    onSuccess: () => {
      // Reset form state
      setName("");
      setDescription("");
      setProjectId("");
      setPriority("Quick");
      setDueDate(null);
      close();
    },
  });

  const handleSubmit = () => {
    if (!name) return;

    const getDueDate = () => {
      const viewNameLower = viewName.toLowerCase();
      if (viewNameLower === 'today') {
        return new Date();
      }
      if (viewNameLower === 'upcoming') {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        return tomorrow;
      }
      return undefined;
    };

    const actionData = {
      name,
      description: description || undefined,
      projectId: projectId || undefined,
      priority: priority || "Quick",
      dueDate: getDueDate(),
    };

    createAction.mutate(actionData);
  };

  const quickOptions = [
    { label: 'Today', date: new Date(), icon: '📅', color: '#22c55e' },
    { label: 'Tomorrow', date: new Date(Date.now() + 86400000), icon: '☀️', color: '#f97316' },
    { label: 'Next week', date: getNextWeekDate(), icon: '📝', color: '#a855f7' },
    { label: 'Next weekend', date: getNextWeekendDate(), icon: '🛋️', color: '#3b82f6' },
    { label: 'No Date', date: null, icon: '⭕', color: '#6b7280' },
  ];

  return (
    <>
      <Button onClick={open}>Create Action</Button>

      <Modal 
        opened={opened} 
        onClose={close}
        size="lg"
        radius="md"
        padding="lg"
        fullScreen={window.innerWidth < 640}
        styles={{
          header: { display: 'none' },
          body: { padding: 0 },
          content: {
            backgroundColor: '#262626',
            color: '#C1C2C5',
          },
          inner: {
            padding: '16px',
          }
        }}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
          className="p-4"
        >
          <TextInput
            placeholder="Task name"
            variant="unstyled"
            size="xl"
            value={name}
            onChange={(e) => setName(e.target.value)}
            styles={{
              input: {
                fontSize: '24px',
                color: '#C1C2C5',
                '&::placeholder': {
                  color: '#C1C2C5',
                },
              },
              wrapper: {
                width: '100%',
              }
            }}
          />
          
          <Textarea
            placeholder="Description"
            variant="unstyled"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            styles={{
              input: {
                color: '#909296',
                '&::placeholder': {
                  color: '#909296',
                },
              },
              wrapper: {
                width: '100%',
              }
            }}
          />

          <Group gap="xs" mt="md" className="flex-wrap">
            <Select
              placeholder="Priority"
              value={priority}
              onChange={(value) => setPriority(value as ActionPriority)}
              data={PRIORITY_OPTIONS.map(p => ({ value: p, label: p }))}
              className="w-full sm:w-auto"
              styles={{
                input: {
                  backgroundColor: '#262626',
                  color: '#C1C2C5',
                  borderColor: '#373A40',
                },
                dropdown: {
                  backgroundColor: '#262626',
                  borderColor: '#373A40',
                  color: '#C1C2C5',
                },
              }}
            />
            <Popover width={300} position="bottom-start">
              <Popover.Target>
                <ActionIcon variant="subtle" color="gray" radius="xl">
                  <IconCalendar size={20} />
                </ActionIcon>
              </Popover.Target>

              <Popover.Dropdown bg="#1a1b1e" p={0}>
                <Stack gap="xs" p="md">
                  {quickOptions.map((option) => (
                    <UnstyledButton
                      key={option.label}
                      onClick={() => {
                        setDueDate(option.date);
                        notifications.show({
                          title: 'Date Updated',
                          message: option.date 
                            ? `Task scheduled for ${option.date.toLocaleDateString('en-US', { 
                                weekday: 'long', 
                                day: 'numeric', 
                                month: 'long' 
                              })}`
                            : 'Date removed from task',
                          color: option.date ? 'blue' : 'gray',
                          icon: option.icon,
                          withBorder: true,
                        });
                      }}
                      className="flex items-center justify-between p-2 hover:bg-[#25262b] rounded"
                    >
                      <Group gap="sm">
                        <Text size="lg" style={{ color: option.color }}>{option.icon}</Text>
                        <Text>{option.label}</Text>
                      </Group>
                      {option.date && (
                        <Text size="sm" c="dimmed">
                          {option.date.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' })}
                        </Text>
                      )}
                    </UnstyledButton>
                  ))}

                  <div className="border-t border-[#2C2E33] mt-2 pt-2">
                    <Group justify="space-between" mb="xs">
                      <Text>February 2025</Text>
                      <Group gap="xs">
                        <ActionIcon variant="subtle" size="sm">
                          <IconChevronLeft size={16} />
                        </ActionIcon>
                        <ActionIcon variant="subtle" size="sm">
                          <IconChevronRight size={16} />
                        </ActionIcon>
                      </Group>
                    </Group>

                    {/* Calendar grid here */}
                    {/* Add calendar implementation */}

                    <UnstyledButton
                      className="w-full p-3 border-t border-[#2C2E33] hover:bg-[#25262b] mt-2 flex items-center justify-center gap-2"
                    >
                      <IconClock size={16} />
                      <Text>Time</Text>
                    </UnstyledButton>
                  </div>
                </Stack>
              </Popover.Dropdown>
            </Popover>
          </Group>

          <div className="border-t border-gray-800 p-4 mt-4">
            <Group justify="space-between">
              <Select
                placeholder="Select a project (optional)"
                variant="unstyled"
                value={projectId}
                onChange={(value) => setProjectId(value ?? '')}
                data={projects.data?.map((p) => ({ value: p.id, label: p.name })) ?? []}
                styles={{
                  input: {
                    color: '#C1C2C5',
                  },
                }}
              />
              <Group>
                <Button variant="subtle" color="gray" onClick={close}>
                  Cancel
                </Button>
                <Button 
                  type="submit"
                  loading={createAction.isPending}
                >
                  New action
                </Button>
              </Group>
            </Group>
          </div>
        </form>
      </Modal>
    </>
  );
} 