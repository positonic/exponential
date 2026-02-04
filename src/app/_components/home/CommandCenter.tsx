"use client";

import { Container, Paper, Text, SimpleGrid } from "@mantine/core";
import {
  IconBook,
  IconUsers,
  IconCalendarEvent,
  IconVideo,
  IconDeviceProjector,
  IconSettings,
  IconLayoutKanban,
  IconTarget,
} from "@tabler/icons-react";
import Link from "next/link";
import { GreetingHeader } from "./GreetingHeader";
import { WeeklyReviewBanner } from "./WeeklyReviewBanner";
import { DailyPlanBanner } from "./DailyPlanBanner";
import { GoalsProgressDashboard } from "./GoalsProgressDashboard";
import { MomentumWidget } from "./MomentumWidget";
import { HabitsDueToday } from "./HabitsDueToday";
import { ProjectStateOverview } from "./ProjectStateOverview";
import { IntegrationSuggestions } from "./IntegrationSuggestions";
import { useWorkspace } from "~/providers/WorkspaceProvider";

export function CommandCenter() {
  const { workspaceSlug } = useWorkspace();
  const basePath = workspaceSlug ? `/w/${workspaceSlug}` : "";

  return (
    <Container size="lg" py="lg" className="min-h-screen">
      {/* 1. Greeting (simplified) */}
      <GreetingHeader />

      {/* Quick Links */}
      <SimpleGrid cols={{ base: 2, sm: 3 }} spacing="md" className="mb-6">
        <Paper
          component={Link}
          href={`${basePath}/settings`}
          p="md"
          radius="md"
          className="border border-border-primary bg-surface-secondary hover:border-border-focus transition-colors cursor-pointer"
        >
          <IconSettings size={24} className="text-blue-500 mb-2" />
          <Text fw={500} size="sm" className="text-text-primary">
            Settings
          </Text>
        </Paper>

        <Paper
          component={Link}
          href={`${basePath}/projects`}
          p="md"
          radius="md"
          className="border border-border-primary bg-surface-secondary hover:border-border-focus transition-colors cursor-pointer"
        >
          <IconDeviceProjector size={24} className="text-violet-500 mb-2" />
          <Text fw={500} size="sm" className="text-text-primary">
            Projects
          </Text>
        </Paper>

        <Paper
          component={Link}
          href={`${basePath}/okrs`}
          p="md"
          radius="md"
          className="border border-border-primary bg-surface-secondary hover:border-border-focus transition-colors cursor-pointer"
        >
          <IconTarget size={24} className="text-brand-primary mb-2" />
          <Text fw={500} size="sm" className="text-text-primary">
            OKRs
          </Text>
        </Paper>

        <Paper
          component={Link}
          href={`${basePath}/knowledge`}
          p="md"
          radius="md"
          className="border border-border-primary bg-surface-secondary hover:border-border-focus transition-colors cursor-pointer"
        >
          <IconBook size={24} className="text-green-500 mb-2" />
          <Text fw={500} size="sm" className="text-text-primary">
            Knowledge Hub
          </Text>
        </Paper>

        <Paper
          component={Link}
          href={`${basePath}/crm`}
          p="md"
          radius="md"
          className="border border-border-primary bg-surface-secondary hover:border-border-focus transition-colors cursor-pointer"
        >
          <IconUsers size={24} className="text-cyan-500 mb-2" />
          <Text fw={500} size="sm" className="text-text-primary">
            CRM
          </Text>
        </Paper>

        <Paper
          component={Link}
          href={`${basePath}/actions`}
          p="md"
          radius="md"
          className="border border-border-primary bg-surface-secondary hover:border-border-focus transition-colors cursor-pointer"
        >
          <IconLayoutKanban size={24} className="text-yellow-500 mb-2" />
          <Text fw={500} size="sm" className="text-text-primary">
            Actions
          </Text>
        </Paper>

        <Paper
          component={Link}
          href={`${basePath}/meetings`}
          p="md"
          radius="md"
          className="border border-border-primary bg-surface-secondary hover:border-border-focus transition-colors cursor-pointer"
        >
          <IconVideo size={24} className="text-orange-500 mb-2" />
          <Text fw={500} size="sm" className="text-text-primary">
            Meetings
          </Text>
        </Paper>
      </SimpleGrid>

      {/* 2. Weekly Review Reminder (if not completed this week) */}
      <WeeklyReviewBanner />

      {/* 3. Daily Plan Reminder (if not completed today) */}
      <DailyPlanBanner />

      {/* 4. Goals & OKRs Dashboard (front and center) */}
      <GoalsProgressDashboard />

      {/* Daily Outcome Capture - temporarily hidden */}
      {/* <DailyOutcomeCapture /> */}

      {/* 5. Integration Suggestions */}
      <IntegrationSuggestions />

      {/* 6. Main content grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left sidebar - momentum + habits */}
        <div className="space-y-6 lg:col-span-3">
          <MomentumWidget />
          <HabitsDueToday />
        </div>

        {/* Main content - projects */}
        <div className="space-y-6 lg:col-span-9">
          <ProjectStateOverview />
        </div>
      </div>
    </Container>
  );
}
