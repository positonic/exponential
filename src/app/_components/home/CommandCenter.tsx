"use client";

import { Container } from "@mantine/core";
import { GreetingHeader } from "./GreetingHeader";
import { WeeklyReviewBanner } from "./WeeklyReviewBanner";
import { DailyPlanBanner } from "./DailyPlanBanner";
import { GoalsProgressDashboard } from "./GoalsProgressDashboard";
import { ProjectStateOverview } from "./ProjectStateOverview";
import { RitualCards } from "./RitualCards";
import { WorkspaceSectionCards } from "./WorkspaceSectionCards";
import { WelcomeBanner } from "./WelcomeChecklist";
import { UserHomeDashboard } from "./UserHomeDashboard";

interface CommandCenterProps {
  variant?: "primary" | "workspace";
}

export function CommandCenter({ variant = "primary" }: CommandCenterProps) {
  if (variant === "primary") {
    return (
      <>
        <WelcomeBanner />
        <UserHomeDashboard />
      </>
    );
  }

  return (
    <Container size="lg" py="lg" className="min-h-screen">
      <GreetingHeader />
      <WelcomeBanner />
      <WeeklyReviewBanner />
      <DailyPlanBanner />
      <RitualCards />
      <WorkspaceSectionCards />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <GoalsProgressDashboard />
        <ProjectStateOverview />
      </div>
    </Container>
  );
}
