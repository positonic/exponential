"use client";

import { Container, Paper, Text, SimpleGrid } from "@mantine/core";
import { IconBook, IconUsers, IconCalendarEvent, IconVideo, IconTarget, IconDeviceProjector } from "@tabler/icons-react";
import Link from "next/link";
import { GreetingHeader } from "./GreetingHeader";
import { WeeklyReviewBanner } from "./WeeklyReviewBanner";
import { InspiringQuote } from "./InspiringQuote";
import { DailyOutcomeCapture } from "./DailyOutcomeCapture";
import { MomentumWidget } from "./MomentumWidget";
import { HabitsDueToday } from "./HabitsDueToday";
import { ProjectStateOverview } from "./ProjectStateOverview";
import { AiNextBestStep } from "./AiNextBestStep";
import { useWorkspace } from "~/providers/WorkspaceProvider";

export function CommandCenter() {
  const { workspaceSlug } = useWorkspace();
  const basePath = workspaceSlug ? `/w/${workspaceSlug}` : "";

  return (
    <Container size="lg" py="lg" className="min-h-screen">
      {/* 1. Greeting (simplified) */}
      <GreetingHeader />

      {/* 2. Weekly Review Reminder (if not completed this week) */}
      <WeeklyReviewBanner />

      {/* 3. Inspiring Quote (dismissible) */}
      <div className="mb-6">
        <InspiringQuote />
      </div>

      {/* 4. AI Suggested Focus */}
      <div className="mb-6">
        <AiNextBestStep />
      </div>

      {/* 5. Daily Outcome Capture */}
      <DailyOutcomeCapture />

      {/* Main content grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left sidebar - momentum + habits */}
        <div className="space-y-6 lg:col-span-3">
          <MomentumWidget />
          <HabitsDueToday />
        </div>

        {/* Main content - projects */}
        <div className="space-y-6 lg:col-span-9">
          {/* 6. Project State Overview */}
          <ProjectStateOverview />
        </div>
      </div>

      {/* Quick Links */}
      <SimpleGrid cols={{ base: 2, sm: 3 }} spacing="md" className="mt-8">
        <Paper
          component={Link}
          href={`${basePath}/alignment`}
          p="md"
          radius="md"
          className="border border-border-primary bg-surface-secondary hover:border-border-focus transition-colors cursor-pointer"
        >
          <IconTarget size={24} className="text-blue-500 mb-2" />
          <Text fw={500} size="sm" className="text-text-primary">
            Alignment
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
          href={`${basePath}/today`}
          p="md"
          radius="md"
          className="border border-border-primary bg-surface-secondary hover:border-border-focus transition-colors cursor-pointer"
        >
          <IconCalendarEvent size={24} className="text-yellow-500 mb-2" />
          <Text fw={500} size="sm" className="text-text-primary">
            Today
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
    </Container>
  );
}
