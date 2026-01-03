"use client";

import { useState } from "react";
import {
  Container,
  Title,
  Text,
  Button,
  Stack,
  Group,
  TextInput,
  Card,
  Grid,
  Box,
  Progress,
  ActionIcon,
  Anchor,
} from "@mantine/core";
import {
  IconCheck,
  IconPlus,
  IconX,
  IconArrowRight,
  IconArrowLeft,
  IconList,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { notifications } from "@mantine/notifications";
import { api } from "~/trpc/react";

interface TaskInput {
  id: string;
  name: string;
}

type WizardStep = 1 | 2;

export function ProjectSetupWizard() {
  const router = useRouter();
  const [step, setStep] = useState<WizardStep>(1);
  const [isLoading, setIsLoading] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [tasks, setTasks] = useState<TaskInput[]>([
    { id: "1", name: "" },
    { id: "2", name: "" },
    { id: "3", name: "" },
  ]);

  // Fetch the project created during onboarding
  const { data: setupData, isLoading: dataLoading } =
    api.projectSetup.getOnboardingProject.useQuery();

  // Mutations
  const updateProjectMutation = api.projectSetup.updateProject.useMutation();
  const createTasksMutation = api.projectSetup.createProjectTasks.useMutation();
  const completeSetupMutation = api.projectSetup.completeSetup.useMutation();
  const skipSetupMutation = api.projectSetup.skipSetup.useMutation();

  const handleAddTask = () => {
    setTasks((prev) => [...prev, { id: Date.now().toString(), name: "" }]);
  };

  const handleRemoveTask = (id: string) => {
    if (tasks.length > 1) {
      setTasks((prev) => prev.filter((t) => t.id !== id));
    }
  };

  const handleTaskChange = (id: string, name: string) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, name } : t)));
  };

  const handleContinueToStep2 = async () => {
    if (!projectName.trim()) {
      notifications.show({
        title: "Project name required",
        message: "Please enter a name for your project.",
        color: "orange",
      });
      return;
    }

    // Update project name if changed
    if (setupData?.project && projectName !== setupData.project.name) {
      setIsLoading(true);
      try {
        await updateProjectMutation.mutateAsync({
          projectId: setupData.project.id,
          name: projectName.trim(),
        });
      } catch {
        notifications.show({
          title: "Error",
          message: "Failed to update project name. Please try again.",
          color: "red",
        });
        setIsLoading(false);
        return;
      }
      setIsLoading(false);
    }

    setStep(2);
  };

  const handleCompleteSetup = async () => {
    if (!setupData?.project) return;

    setIsLoading(true);
    try {
      // Filter out empty tasks
      const validTasks = tasks.filter((t) => t.name.trim().length > 0);

      // Create tasks if any
      if (validTasks.length > 0) {
        await createTasksMutation.mutateAsync({
          projectId: setupData.project.id,
          tasks: validTasks.map((t) => ({ name: t.name.trim() })),
        });
      }

      // Mark setup as complete
      await completeSetupMutation.mutateAsync();

      notifications.show({
        title: "Setup complete!",
        message: "Your project is ready. Let's get started!",
        color: "green",
        icon: <IconCheck size={16} />,
      });

      // Redirect to the project
      router.push(`/projects/${setupData.project.slug}-${setupData.project.id}`);
    } catch {
      notifications.show({
        title: "Error",
        message: "Failed to complete setup. Please try again.",
        color: "red",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSkip = async () => {
    setIsLoading(true);
    try {
      await skipSetupMutation.mutateAsync();
      router.push("/home");
    } catch {
      notifications.show({
        title: "Error",
        message: "Failed to skip setup. Please try again.",
        color: "red",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Filter tasks with content for preview
  const previewTasks = tasks.filter((t) => t.name.trim().length > 0);

  if (dataLoading) {
    return (
      <Container size="lg" py="xl">
        <Box className="text-center">
          <Title order={3}>Loading...</Title>
          <Progress value={50} animated mt="md" />
        </Box>
      </Container>
    );
  }

  return (
    <Container size="xl" py="xl" className="min-h-screen">
      <Grid gutter="xl">
        {/* Left Column - Form */}
        <Grid.Col span={{ base: 12, md: 7 }}>
          <Stack gap="xl">
            {/* Progress indicator */}
            <Group gap="xs">
              <Box
                className={`h-1 flex-1 rounded ${step >= 1 ? "bg-brand-primary" : "bg-surface-tertiary"}`}
              />
              <Box
                className={`h-1 flex-1 rounded ${step >= 2 ? "bg-brand-primary" : "bg-surface-tertiary"}`}
              />
            </Group>

            {/* Step 1: Project Name */}
            {step === 1 && (
              <Stack gap="xl">
                <div>
                  <Title order={1} className="mb-2 text-3xl font-bold">
                    Let&apos;s set up your first project
                  </Title>
                  <Text size="lg" className="text-text-secondary">
                    What&apos;s something you and your team are currently
                    working on?
                  </Text>
                </div>

                <TextInput
                  size="lg"
                  placeholder="e.g., Website Redesign, Q1 Marketing Campaign"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  className="text-xl"
                  styles={{
                    input: {
                      fontSize: "1.25rem",
                      padding: "1rem",
                    },
                  }}
                  autoFocus
                />

                <Group justify="space-between" mt="xl">
                  <Anchor
                    component="button"
                    onClick={handleSkip}
                    className="text-text-secondary hover:text-text-primary"
                    disabled={isLoading}
                  >
                    Skip for now
                  </Anchor>
                  <Button
                    size="lg"
                    onClick={handleContinueToStep2}
                    loading={isLoading}
                    rightSection={<IconArrowRight size={18} />}
                  >
                    Continue
                  </Button>
                </Group>
              </Stack>
            )}

            {/* Step 2: Tasks */}
            {step === 2 && (
              <Stack gap="xl">
                <div>
                  <Button
                    variant="subtle"
                    leftSection={<IconArrowLeft size={16} />}
                    onClick={() => setStep(1)}
                    className="mb-4 -ml-3"
                    disabled={isLoading}
                  >
                    Back
                  </Button>
                  <Title order={1} className="mb-2 text-3xl font-bold">
                    What are a few tasks that you have to do for{" "}
                    {projectName || "your project"}?
                  </Title>
                  <Text size="lg" className="text-text-secondary">
                    Add some initial tasks to get started. You can always add
                    more later.
                  </Text>
                </div>

                <Stack gap="md">
                  {tasks.map((task, index) => (
                    <Group key={task.id} gap="sm">
                      <TextInput
                        placeholder={
                          index === 0
                            ? "e.g., Research competitors"
                            : index === 1
                              ? "e.g., Create wireframes"
                              : "e.g., Review with team"
                        }
                        value={task.name}
                        onChange={(e) =>
                          handleTaskChange(task.id, e.target.value)
                        }
                        className="flex-1"
                        size="md"
                      />
                      {tasks.length > 1 && (
                        <ActionIcon
                          variant="subtle"
                          color="gray"
                          onClick={() => handleRemoveTask(task.id)}
                          disabled={isLoading}
                        >
                          <IconX size={16} />
                        </ActionIcon>
                      )}
                    </Group>
                  ))}

                  <Button
                    variant="subtle"
                    leftSection={<IconPlus size={16} />}
                    onClick={handleAddTask}
                    className="w-fit"
                    disabled={isLoading}
                  >
                    Add another task
                  </Button>
                </Stack>

                <Group justify="space-between" mt="xl">
                  <Anchor
                    component="button"
                    onClick={handleSkip}
                    className="text-text-secondary hover:text-text-primary"
                    disabled={isLoading}
                  >
                    Skip for now
                  </Anchor>
                  <Button
                    size="lg"
                    onClick={handleCompleteSetup}
                    loading={isLoading}
                    rightSection={<IconCheck size={18} />}
                  >
                    Complete Setup
                  </Button>
                </Group>
              </Stack>
            )}
          </Stack>
        </Grid.Col>

        {/* Right Column - Preview */}
        <Grid.Col span={{ base: 12, md: 5 }} visibleFrom="md">
          <Box className="sticky top-8">
            <Card
              shadow="md"
              radius="lg"
              className="border-border-primary bg-surface-secondary p-6"
            >
              {/* Preview Header */}
              <Group gap="sm" className="mb-6">
                <Box className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-primary/20">
                  <IconList size={20} className="text-brand-primary" />
                </Box>
                <Title order={3} className="text-xl font-semibold">
                  {projectName || "Your Project"}
                </Title>
              </Group>

              {/* Preview Tasks */}
              <Stack gap="sm">
                {previewTasks.length > 0 ? (
                  previewTasks.map((task) => (
                    <Group key={task.id} gap="sm" className="py-2">
                      <Box className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-border-secondary" />
                      <Text className="text-text-primary">{task.name}</Text>
                    </Group>
                  ))
                ) : (
                  <>
                    {/* Placeholder tasks */}
                    {[1, 2, 3, 4, 5].map((i) => (
                      <Group key={i} gap="sm" className="py-2">
                        <Box className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-border-secondary" />
                        <Box
                          className="h-4 rounded bg-surface-tertiary"
                          style={{ width: `${60 + Math.random() * 80}px` }}
                        />
                      </Group>
                    ))}
                  </>
                )}
              </Stack>
            </Card>
          </Box>
        </Grid.Col>
      </Grid>
    </Container>
  );
}
