"use client";

import { Card, Container, Group, Text } from "@mantine/core";
import { IconArrowRight, IconTargetArrow } from "@tabler/icons-react";
import Link from "next/link";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { GreetingHeader } from "./GreetingHeader";
import { WeeklyReviewBanner } from "./WeeklyReviewBanner";
import { DailyPlanBanner } from "./DailyPlanBanner";
import { GoalsProgressDashboard } from "./GoalsProgressDashboard";
import { MomentumWidget } from "./MomentumWidget";
import { HabitsDueToday } from "./HabitsDueToday";
import { ProjectStateOverview } from "./ProjectStateOverview";
import { IntegrationSuggestions } from "./IntegrationSuggestions";
import { RitualCards } from "./RitualCards";
import { WorkspaceSectionCards } from "./WorkspaceSectionCards";
interface CommandCenterProps {
  variant?: "primary" | "workspace";
}

export function CommandCenter({ variant = "primary" }: CommandCenterProps) {
  const isPrimaryHome = variant === "primary";
  const { workspaceSlug } = useWorkspace();

  return (
    <Container size="lg" py="lg" className="min-h-screen">
      {/* 1. Greeting (simplified) */}
      <GreetingHeader />

      {isPrimaryHome ? (
        <>
          {/* Banners + OKR card in a row */}
          <div className="mb-6 flex items-stretch gap-4">
            <WeeklyReviewBanner compact />
            <DailyPlanBanner compact />
            <Card
              component={Link}
              href={`/w/${workspaceSlug}/okrs`}
              withBorder
              radius="md"
              className="flex flex-1 cursor-pointer flex-col justify-between border-border-primary bg-surface-secondary transition-colors hover:bg-surface-hover"
              p="md"
            >
              <Group gap="sm" wrap="nowrap" mb="xs">
                <IconTargetArrow size={20} className="text-amber-400 flex-shrink-0" />
                <Text fw={600} size="sm" className="text-text-primary">
                  OKRs
                </Text>
              </Group>
              <Text size="xs" className="text-text-muted">
                Objectives and key results
              </Text>
              <IconArrowRight size={14} className="text-text-muted mt-auto self-end" />
            </Card>
          </div>

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
        </>
      ) : (
        <>
          <WeeklyReviewBanner />
          <DailyPlanBanner />
          <RitualCards />
          <WorkspaceSectionCards />
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <GoalsProgressDashboard />
            <ProjectStateOverview />
          </div>
        </>
      )}
    </Container>
  );
}
