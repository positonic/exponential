"use client";

import { Container } from "@mantine/core";
import { GreetingHeader } from "./GreetingHeader";
import { WeeklyReviewBanner } from "./WeeklyReviewBanner";
import { InspiringQuote } from "./InspiringQuote";
import { DailyOutcomeCapture } from "./DailyOutcomeCapture";
import { MomentumWidget } from "./MomentumWidget";
import { HabitsDueToday } from "./HabitsDueToday";
import { ProjectStateOverview } from "./ProjectStateOverview";
import { AiNextBestStep } from "./AiNextBestStep";

interface CommandCenterProps {
  userName: string;
  workspaceId?: string;
}

export function CommandCenter({ userName, workspaceId }: CommandCenterProps) {
  return (
    <Container size="lg" py="lg" className="min-h-screen">
      {/* 1. Greeting (simplified) */}
      <GreetingHeader userName={userName} />

      {/* 2. Weekly Review Reminder (if not completed this week) */}
      <WeeklyReviewBanner />

      {/* 3. AI Suggested Focus */}
      <AiNextBestStep />

      {/* 4. Inspiring Quote (dismissible) */}
      <InspiringQuote />

      {/* 5. Daily Outcome Capture */}
      <DailyOutcomeCapture />

      {/* Main content grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left sidebar - momentum + habits */}
        <div className="space-y-6 lg:col-span-3">
          <MomentumWidget workspaceId={workspaceId} />
          <HabitsDueToday />
        </div>

        {/* Main content - projects */}
        <div className="space-y-6 lg:col-span-9">
          {/* 6. Project State Overview */}
          <ProjectStateOverview />
        </div>
      </div>
    </Container>
  );
}
