"use client";

import { Container, Paper, Text, SimpleGrid } from "@mantine/core";
import {
  IconBook,
  IconUsers,
  IconVideo,
  IconDeviceProjector,
  IconSettings,
  IconLayoutKanban,
  IconTarget,
  IconArrowUpRight,
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

interface QuickLinkItem {
  key: string;
  title: string;
  description: string;
  href: string;
  icon: typeof IconSettings;
  iconClassName: string;
  iconWrapperClassName: string;
}

interface CommandCenterProps {
  variant?: "primary" | "workspace";
}

const quickLinks: QuickLinkItem[] = [
  {
    key: "settings",
    title: "Settings",
    description: "Manage workspace profile, members, and preferences.",
    href: "/settings",
    icon: IconSettings,
    iconClassName: "text-brand-primary",
    iconWrapperClassName: "bg-brand-primary/10",
  },
  {
    key: "projects",
    title: "Projects",
    description: "Track active workstreams and keep delivery on pace.",
    href: "/projects",
    icon: IconDeviceProjector,
    iconClassName: "text-brand-info",
    iconWrapperClassName: "bg-brand-info/10",
  },
  {
    key: "okrs",
    title: "OKRs",
    description: "Align objectives, outcomes, and momentum in one place.",
    href: "/okrs",
    icon: IconTarget,
    iconClassName: "text-brand-success",
    iconWrapperClassName: "bg-brand-success/10",
  },
  {
    key: "knowledge",
    title: "Knowledge Hub",
    description: "Capture notes, docs, and decisions for quick recall.",
    href: "/knowledge",
    icon: IconBook,
    iconClassName: "text-brand-warning",
    iconWrapperClassName: "bg-brand-warning/10",
  },
  {
    key: "crm",
    title: "CRM",
    description: "Manage relationships, pipeline, and follow-ups.",
    href: "/crm",
    icon: IconUsers,
    iconClassName: "text-brand-primary",
    iconWrapperClassName: "bg-brand-primary/10",
  },
  {
    key: "actions",
    title: "Actions",
    description: "Prioritize next steps and ship with focus.",
    href: "/actions",
    icon: IconLayoutKanban,
    iconClassName: "text-brand-warning",
    iconWrapperClassName: "bg-brand-warning/10",
  },
  {
    key: "meetings",
    title: "Meetings",
    description: "Prepare agendas and capture outcomes effortlessly.",
    href: "/meetings",
    icon: IconVideo,
    iconClassName: "text-brand-error",
    iconWrapperClassName: "bg-brand-error/10",
  },
];

export function CommandCenter({ variant = "primary" }: CommandCenterProps) {
  const { workspaceSlug } = useWorkspace();
  const basePath = workspaceSlug ? `/w/${workspaceSlug}` : "";
  const isPrimaryHome = variant === "primary";

  return (
    <Container size="lg" py="lg" className="min-h-screen">
      {/* 1. Greeting (simplified) */}
      <GreetingHeader />

      {/* Quick Links */}
      <div className="mb-4">
        <Text className="text-text-primary text-base font-semibold text-balance">
          Quick Links
        </Text>
        <Text size="sm" className="text-text-muted text-balance">
          Jump straight to the core areas of your workspace.
        </Text>
      </div>
      <div className="mb-6 overflow-x-auto">
        <SimpleGrid
          cols={{ base: 7, sm: 7, lg: 7 }}
          spacing="sm"
          className="min-w-max"
        >
          {quickLinks.map((item) => {
            const Icon = item.icon;
            return (
              <Paper
                key={item.key}
                component={Link}
                href={`${basePath}${item.href}`}
                p="sm"
                radius="md"
                className="group border border-border-primary bg-surface-secondary hover:border-border-focus hover:bg-surface-hover transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
              >
                <div className="flex items-start gap-2">
                  <div
                    className={`rounded-md p-2 ${item.iconWrapperClassName} ${item.iconClassName}`}
                    aria-hidden="true"
                  >
                    <Icon size={18} aria-hidden="true" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <Text fw={600} size="sm" className="text-text-primary text-balance">
                      {item.title}
                    </Text>
                    <Text size="xs" className="text-text-muted text-pretty break-words">
                      {item.description}
                    </Text>
                  </div>
                  <IconArrowUpRight
                    size={16}
                    aria-hidden="true"
                    className="text-text-muted transition-colors group-hover:text-text-secondary"
                  />
                </div>
              </Paper>
            );
          })}
        </SimpleGrid>
      </div>

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
