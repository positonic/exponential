"use client";

import { useState } from "react";
import Link from "next/link";
import {
  IconBolt,
  IconBrandGithub,
  IconBriefcase,
  IconCalendar,
  IconCalendarStats,
  IconChartBar,
  IconChartLine,
  IconCheck,
  IconChevronDown,
  IconFolder,
  IconInbox,
  IconMessageCircle,
  IconMicrophone,
  IconNotes,
  IconRefresh,
  IconRobot,
  IconSearch,
  IconTarget,
  IconUsers,
  type Icon,
} from "@tabler/icons-react";

interface FeatureItem {
  icon: Icon;
  title: string;
  description: string;
  href?: string;
}

interface FeatureColumn {
  label: string;
  items: FeatureItem[];
}

const featureColumns: FeatureColumn[] = [
  {
    label: "ALIGNMENT",
    items: [
      {
        icon: IconTarget,
        title: "Goals",
        description: "Define what matters and why",
        href: "/features/goals",
      },
      {
        icon: IconChartLine,
        title: "OKRs",
        description: "Objectives & Key Results tracking",
        href: "/features/okrs",
      },
      {
        icon: IconRefresh,
        title: "Weekly Plan",
        description: "Reflect, reset, realign",
        href: "/features/weekly-plan",
      },
    ],
  },
  {
    label: "EXECUTION",
    items: [
      {
        icon: IconFolder,
        title: "Projects",
        description: "Containers for focused work",
        href: "/features/projects",
      },
      {
        icon: IconCheck,
        title: "Actions",
        description: "Tasks that connect to your goals",
        href: "/features/actions",
      },
      {
        icon: IconCalendar,
        title: "Today View",
        description: "Focus on what matters now",
        href: "/features/today-view",
      },
      {
        icon: IconInbox,
        title: "Inbox",
        description: "Capture anything, process later",
        href: "/features/inbox",
      },
    ],
  },
  {
    label: "AI ASSISTANT",
    items: [
      {
        icon: IconRobot,
        title: "AI Assistant",
        description: "Chat with Zoe about your work",
        href: "/features/ai-assistant",
      },
      {
        icon: IconSearch,
        title: "Smart Search",
        description: "Find anything across your work",
        href: "/features/smart-search",
      },
      {
        icon: IconMicrophone,
        title: "Meeting Intelligence",
        description: "Auto-capture action items",
        href: "/features/meeting-intelligence",
      },
    ],
  },
  {
    label: "AGENTS",
    items: [
      {
        icon: IconBriefcase,
        title: "AI Project Manager",
        description: "Status, risks and follow-ups drafted for you",
        href: "/features/ai-project-manager",
      },
      {
        icon: IconBolt,
        title: "AI Workflows",
        description: "Hand work to agents and review the result",
        href: "/features/ai-workflows",
      },
    ],
  },
  {
    label: "ORGANIZATION",
    items: [
      {
        icon: IconUsers,
        title: "Workspaces",
        description: "Organize teams and AI agents",
        href: "/features/workspaces",
      },
      {
        icon: IconChartBar,
        title: "Team Weekly Review",
        description: "See what everyone and every agent is doing",
        href: "/features/team-weekly-review",
      },
      {
        icon: IconCalendarStats,
        title: "Team Capacity",
        description: "Track human and AI capacity",
        href: "/features/team-capacity",
      },
    ],
  },
];

const integrations: { icon: Icon; name: string; href?: string }[] = [
  { icon: IconRobot, name: "Claude", href: "/features/integrations/claude" },
  { icon: IconMessageCircle, name: "Slack" },
  { icon: IconNotes, name: "Notion" },
  { icon: IconBrandGithub, name: "GitHub" },
  { icon: IconMicrophone, name: "Fireflies" },
  { icon: IconMessageCircle, name: "WhatsApp" },
];

export function FeaturesMenu() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div
      className="relative"
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
    >
      {/* Trigger */}
      <button
        className="flex items-center gap-1 text-text-secondary hover:text-text-primary transition-colors text-sm font-medium"
        onClick={() => setIsOpen(!isOpen)}
      >
        Product
        <IconChevronDown
          size={16}
          className={`transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {/* Dropdown — always in the HTML and hidden with CSS, so crawlers see
          the feature-page links (a conditional render left the homepage with
          no links to them at all). */}
      <div className={isOpen ? undefined : "hidden"}>
          {/* Invisible bridge to prevent menu from closing */}
          <div className="absolute top-full left-0 h-4 w-full" />

          <div className="absolute top-full left-1/2 -translate-x-1/2 mt-4 w-[1000px] bg-background-elevated border border-border-primary rounded-xl shadow-2xl overflow-hidden z-50">
            {/* Feature Columns */}
            <div className="grid grid-cols-5 gap-0 p-6">
              {featureColumns.map((column) => (
                <div key={column.label} className="px-4">
                  <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-4">
                    {column.label}
                  </h4>
                  <ul className="space-y-4">
                    {column.items.map((item) => (
                      <li key={item.title}>
                        <Link
                          href={item.href ?? "#features"}
                          className="group flex items-start gap-3 hover:bg-surface-hover rounded-lg p-2 -m-2 transition-colors"
                        >
                          <item.icon
                            size={18}
                            stroke={1.5}
                            className="text-text-muted flex-shrink-0 mt-0.5"
                          />
                          <div>
                            <p className="font-medium text-text-primary text-sm group-hover:text-accent-indigo transition-colors">
                              {item.title}
                            </p>
                            <p className="text-xs text-text-muted leading-snug">
                              {item.description}
                            </p>
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            {/* Integrations Strip */}
            <div className="bg-surface-secondary border-t border-border-primary px-6 py-4">
              <div className="flex items-center gap-6">
                <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">
                  Integrations
                </span>
                <div className="flex items-center gap-4">
                  {integrations.map((integration) =>
                    integration.href ? (
                      <Link
                        key={integration.name}
                        href={integration.href}
                        className="flex items-center gap-1.5 text-text-secondary text-sm hover:text-text-primary transition-colors"
                      >
                        <integration.icon size={16} stroke={1.5} />
                        {integration.name}
                      </Link>
                    ) : (
                      <span
                        key={integration.name}
                        className="flex items-center gap-1.5 text-text-secondary text-sm"
                      >
                        <integration.icon size={16} stroke={1.5} />
                        {integration.name}
                      </span>
                    ),
                  )}
                  <span className="text-text-muted text-sm italic">
                    More coming...
                  </span>
                </div>
              </div>
            </div>
          </div>
      </div>
    </div>
  );
}
