"use client";

import { Container } from "@mantine/core";
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
import { PMAgentWidget } from "./PMAgentWidget";
import { OkrTile } from "./OkrTile";
import { WelcomeBanner } from "./WelcomeChecklist";

interface CommandCenterProps {
  variant?: "primary" | "workspace";
}

export function CommandCenter({ variant = "primary" }: CommandCenterProps) {
  const isPrimaryHome = variant === "primary";

  return (
    <Container size="lg" py="lg" className="min-h-screen">
      {/* 1. Greeting (simplified) */}
      <GreetingHeader />

      {/* Welcome setup banner for new users */}
      <WelcomeBanner />

      {isPrimaryHome ? (
        <>
          {/* Banners + OKR card in a row */}
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <WeeklyReviewBanner compact />
            <DailyPlanBanner compact />
            <OkrTile />
          </div>

          {/* Daily Outcome Capture - temporarily hidden */}
          {/* <DailyOutcomeCapture /> */}

          {/* 5. Integration Suggestions */}
          <IntegrationSuggestions />

          {/* 6. Main content grid */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* Left sidebar - momentum + habits + PM agent */}
            <div className="space-y-6 lg:col-span-3">
              <MomentumWidget />
              <HabitsDueToday />
              <PMAgentWidget />
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
