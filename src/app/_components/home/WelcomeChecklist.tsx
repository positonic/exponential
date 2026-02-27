"use client";

import { useEffect, useCallback } from "react";
import {
  Container,
  Stack,
  Text,
  Paper,
  Group,
  Button,
  Progress,
  ThemeIcon,
  ActionIcon,
} from "@mantine/core";
import {
  IconCheck,
  IconFolder,
  IconTarget,
  IconChartLine,
  IconCheckbox,
  IconCalendar,
  IconLayoutList,
  IconCircleCheck,
  IconMessageChatbot,
  IconArrowRight,
  IconX,
} from "@tabler/icons-react";
import Link from "next/link";
import confetti from "canvas-confetti";
import { api } from "~/trpc/react";
import { useAgentModal } from "~/providers/AgentModalProvider";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { useRouter } from "next/navigation";

interface ChecklistItem {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  completedText: string;
  ctaLabel: string;
  ctaHref?: string;
  isComplete: boolean;
}

export function WelcomeChecklist() {
  const { workspaceSlug } = useWorkspace();
  const { openModal, setMessages } = useAgentModal();
  const router = useRouter();
  const utils = api.useUtils();

  const { data, isLoading } = api.user.getWelcomeProgress.useQuery();
  const completeWelcome = api.user.completeWelcome.useMutation({
    onSuccess: () => {
      void utils.user.getWelcomeProgress.invalidate();
    },
  });

  const steps = data?.steps;
  const userName = data?.userName;

  const basePath = workspaceSlug ? `/w/${workspaceSlug}` : "";

  const items: ChecklistItem[] = steps
    ? [
        {
          id: "project",
          title: "Create your first project",
          description:
            "Projects are the foundation for organizing your work. Group related actions, goals, and outcomes together.",
          icon: IconFolder,
          completedText: "Project created",
          ctaLabel: "Create a project",
          ctaHref: `${basePath}/projects`,
          isComplete: steps.hasProject,
        },
        {
          id: "goal",
          title: "Set your first goal",
          description:
            "Goals keep you focused on what matters most. They cascade into outcomes and actions to drive execution.",
          icon: IconTarget,
          completedText: "Goal set",
          ctaLabel: "Create a goal",
          ctaHref: `${basePath}/goals`,
          isComplete: steps.hasGoal,
        },
        {
          id: "outcome",
          title: "Define an outcome",
          description:
            "Outcomes are measurable results linked to your goals. They help you track whether you're making real progress.",
          icon: IconChartLine,
          completedText: "Outcome defined",
          ctaLabel: "Create an outcome",
          ctaHref: `${basePath}/outcomes`,
          isComplete: steps.hasOutcome,
        },
        {
          id: "actions",
          title: "Add actions to a project",
          description:
            "Actions are the concrete tasks that move projects forward. Link them to projects to keep everything connected.",
          icon: IconCheckbox,
          completedText: "Actions added",
          ctaLabel: "Add an action",
          ctaHref: `${basePath}/projects`,
          isComplete: steps.hasProjectActions,
        },
        {
          id: "calendar",
          title: "Connect your calendar",
          description:
            "Sync your Google or Outlook calendar to unify planning and execution in one place.",
          icon: IconCalendar,
          completedText: "Calendar connected",
          ctaLabel: "Connect calendar",
          ctaHref: `${basePath}/settings`,
          isComplete: steps.hasCalendar,
        },
        {
          id: "dailyPlan",
          title: "Plan your first day",
          description:
            "The daily plan turns your goals and actions into a realistic schedule. It's where execution happens.",
          icon: IconLayoutList,
          completedText: "Day planned",
          ctaLabel: "Plan your day",
          ctaHref: `${basePath}/daily-plan`,
          isComplete: steps.hasDailyPlan,
        },
        {
          id: "complete",
          title: "Complete your first action",
          description:
            "Check off your first task to see how momentum builds. Small wins compound into big results.",
          icon: IconCircleCheck,
          completedText: "First action completed",
          ctaLabel: "View your actions",
          ctaHref: `${basePath}/today`,
          isComplete: steps.hasCompletedAction,
        },
      ]
    : [];

  const completedCount = items.filter((i) => i.isComplete).length;
  const totalCount = items.length;
  const allComplete = totalCount > 0 && completedCount === totalCount;
  const progressPercent = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  // Celebration when all items complete
  const fireCelebration = useCallback(() => {
    void confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 },
    });
  }, []);

  useEffect(() => {
    if (allComplete && !data?.welcomeCompletedAt) {
      fireCelebration();
      completeWelcome.mutate();
    }
  }, [allComplete, data?.welcomeCompletedAt, fireCelebration, completeWelcome]);

  const handleOpenAIChat = () => {
    const usageContext = data?.usageType
      ? ` for ${data.usageType} use`
      : "";
    const roleContext = data?.userRole
      ? ` as a ${data.userRole}`
      : "";

    setMessages([
      {
        type: "system",
        content: `The user just signed up and is setting up their workspace${usageContext}${roleContext}. Help them understand how Goals, Outcomes, and Actions work together in Exponential. Guide them through their setup checklist. Be encouraging and concise.`,
      },
      {
        type: "ai",
        agentName: "Assistant",
        content: `Welcome${userName ? `, ${userName}` : ""}! I'm here to help you get set up. Exponential works on a simple framework:\n\n**Goals** define what you want to achieve\n**Outcomes** measure whether you're getting there\n**Actions** are the concrete tasks that move things forward\n**Projects** group related work together\n\nWould you like help setting up your first goal, or is there something specific you'd like to explore?`,
      },
    ]);
    openModal();
  };

  const handleSkip = () => {
    completeWelcome.mutate(undefined, {
      onSuccess: () => {
        router.push("/home");
      },
    });
  };

  if (isLoading) {
    return (
      <Container size="sm" py="xl" className="min-h-screen">
        <Stack gap="lg">
          <div className="h-8 w-64 animate-pulse rounded bg-surface-hover" />
          <div className="h-4 w-96 animate-pulse rounded bg-surface-hover" />
          <div className="h-2 w-full animate-pulse rounded bg-surface-hover" />
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg bg-surface-hover" />
          ))}
        </Stack>
      </Container>
    );
  }

  return (
    <Container size="sm" py="xl" className="min-h-screen">
      <Stack gap="lg">
        {/* Header */}
        <div>
          <Text className="text-3xl font-semibold text-text-primary">
            {allComplete
              ? `You're all set${userName ? `, ${userName}` : ""}!`
              : `Welcome${userName ? `, ${userName}` : ""}!`}
          </Text>
          <Text size="md" className="mt-1 text-text-secondary">
            {allComplete
              ? "You've completed all the setup steps. Your workspace is ready."
              : "Complete these steps to get the most out of your workspace."}
          </Text>
        </div>

        {/* Progress bar */}
        <div>
          <Group justify="space-between" mb={4}>
            <Text size="sm" fw={500} className="text-text-secondary">
              {completedCount} of {totalCount} complete
            </Text>
            <Text size="sm" className="text-text-muted">
              {Math.round(progressPercent)}%
            </Text>
          </Group>
          <Progress
            value={progressPercent}
            size="md"
            radius="xl"
            color="brand"
          />
        </div>

        {/* Checklist items */}
        <Stack gap="sm">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <Paper
                key={item.id}
                withBorder
                radius="md"
                p="md"
                className={`border-border-primary transition-colors ${
                  item.isComplete
                    ? "bg-brand-success/5"
                    : "bg-surface-secondary"
                }`}
              >
                <Group gap="md" wrap="nowrap" align="flex-start">
                  <ThemeIcon
                    size="lg"
                    radius="xl"
                    variant={item.isComplete ? "filled" : "light"}
                    color={item.isComplete ? "green" : "gray"}
                    className="mt-0.5 shrink-0"
                  >
                    {item.isComplete ? (
                      <IconCheck size={18} />
                    ) : (
                      <Icon size={18} />
                    )}
                  </ThemeIcon>
                  <div className="min-w-0 flex-1">
                    <Text
                      fw={500}
                      size="sm"
                      className={
                        item.isComplete
                          ? "text-text-muted line-through"
                          : "text-text-primary"
                      }
                    >
                      {item.isComplete ? item.completedText : item.title}
                    </Text>
                    {!item.isComplete && (
                      <Text size="xs" className="mt-0.5 text-text-secondary">
                        {item.description}
                      </Text>
                    )}
                    {!item.isComplete && item.ctaHref && (
                      <Button
                        component={Link}
                        href={item.ctaHref}
                        variant="light"
                        size="xs"
                        mt="xs"
                        rightSection={<IconArrowRight size={14} />}
                      >
                        {item.ctaLabel}
                      </Button>
                    )}
                  </div>
                </Group>
              </Paper>
            );
          })}
        </Stack>

        {/* Bottom actions */}
        {!allComplete && (
          <Group justify="space-between" mt="md">
            <Button
              variant="light"
              leftSection={<IconMessageChatbot size={18} />}
              onClick={handleOpenAIChat}
            >
              Chat with AI assistant
            </Button>
            <Button
              variant="subtle"
              color="gray"
              size="sm"
              onClick={handleSkip}
              loading={completeWelcome.isPending}
            >
              I&apos;ll explore on my own
            </Button>
          </Group>
        )}

        {allComplete && (
          <Button
            component={Link}
            href="/home"
            size="md"
            variant="filled"
            fullWidth
          >
            Go to your dashboard
          </Button>
        )}
      </Stack>
    </Container>
  );
}

/**
 * Banner version for CommandCenter — shown when welcome is not yet completed.
 */
export function WelcomeBanner() {
  const utils = api.useUtils();
  const { data, isLoading } = api.user.getWelcomeProgress.useQuery();
  const completeWelcome = api.user.completeWelcome.useMutation({
    onSuccess: () => {
      void utils.user.getWelcomeProgress.invalidate();
    },
  });

  if (isLoading || data?.welcomeCompletedAt) {
    return null;
  }

  const steps = data?.steps;
  if (!steps) return null;

  const completedCount = Object.values(steps).filter(Boolean).length;
  const totalCount = Object.values(steps).length;

  return (
    <Paper
      component={Link}
      href="/welcome"
      p="md"
      radius="md"
      mb="lg"
      className="block cursor-pointer border border-accent-indigo/20 bg-gradient-to-r from-accent-indigo/10 to-accent-periwinkle/10 transition-colors hover:from-accent-indigo/15 hover:to-accent-periwinkle/15"
    >
      <Group justify="space-between" wrap="nowrap">
        <Group gap="md" wrap="nowrap">
          <ThemeIcon size="lg" radius="xl" variant="light" color="indigo">
            <IconTarget size={18} />
          </ThemeIcon>
          <div>
            <Text fw={500} size="sm" className="text-text-primary">
              Continue setting up your workspace
            </Text>
            <Text size="xs" className="text-text-secondary">
              {completedCount} of {totalCount} steps complete
            </Text>
          </div>
        </Group>
        <Group gap="xs" wrap="nowrap">
          <Button variant="light" size="xs" component="span">
            Continue
          </Button>
          <ActionIcon
            variant="subtle"
            size="sm"
            onClick={(e: React.MouseEvent) => {
              e.preventDefault();
              e.stopPropagation();
              completeWelcome.mutate();
            }}
            aria-label="Dismiss setup banner"
          >
            <IconX size={14} />
          </ActionIcon>
        </Group>
      </Group>
    </Paper>
  );
}
