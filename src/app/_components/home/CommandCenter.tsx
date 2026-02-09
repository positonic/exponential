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
interface CommandCenterProps {
  variant?: "primary" | "workspace";
}

export function CommandCenter({ variant = "primary" }: CommandCenterProps) {
  const isPrimaryHome = variant === "primary";

  return (
    <Container size="lg" py="lg" className="min-h-screen">
      {/* 1. Greeting (simplified) */}
      <GreetingHeader />

      {/* 2. Weekly Review Reminder (if not completed this week) */}
      <WeeklyReviewBanner />

      {/* 3. Daily Plan Reminder (if not completed today) */}
      <DailyPlanBanner />

      {isPrimaryHome ? (
        <>
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
        </>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <GoalsProgressDashboard />
          <ProjectStateOverview />
        </div>
      )}
    </Container>
  );
}
