"use client";

import { useState } from "react";
import Link from "next/link";
import { IconChevronDown } from "@tabler/icons-react";

interface FeatureItem {
  icon: string;
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
        icon: "📎",
        title: "Goals",
        description: "Define what matters and why",
      },
      {
        icon: "🎯",
        title: "Outcomes",
        description: "Measurable results at any time horizon",
      },
      {
        icon: "📈",
        title: "OKRs",
        description: "Objectives & Key Results tracking",
      },
      {
        icon: "🔄",
        title: "Weekly Review",
        description: "Reflect, reset, realign",
      },
    ],
  },
  {
    label: "EXECUTION",
    items: [
      {
        icon: "📋",
        title: "Projects",
        description: "Containers for focused work",
      },
      {
        icon: "✓",
        title: "Actions",
        description: "Tasks that connect to outcomes",
      },
      {
        icon: "📅",
        title: "Today View",
        description: "Focus on what matters now",
      },
      {
        icon: "📥",
        title: "Inbox",
        description: "Capture anything, process later",
      },
    ],
  },
  {
    label: "AI FEATURES",
    items: [
      {
        icon: "🤖",
        title: "AI Assistant",
        description: "Chat with Paddy about your work",
      },
      {
        icon: "🎙️",
        title: "Meeting Intelligence",
        description: "Auto-capture action items",
      },
      {
        icon: "🔍",
        title: "Smart Search",
        description: "Find anything across your work",
      },
    ],
  },
  {
    label: "TEAM",
    items: [
      {
        icon: "👥",
        title: "Workspaces",
        description: "Organize by client or project",
      },
      {
        icon: "📊",
        title: "Weekly Planning",
        description: "See what everyone's doing",
      },
      {
        icon: "📆",
        title: "Team Capacity",
        description: "Track who's available",
      },
    ],
  },
];

const integrations = [
  { icon: "💬", name: "Slack" },
  { icon: "📝", name: "Notion" },
  { icon: "🐙", name: "GitHub" },
  { icon: "🎤", name: "Fireflies" },
  { icon: "💬", name: "WhatsApp" },
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
        Features
        <IconChevronDown
          size={16}
          className={`transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <>
          {/* Invisible bridge to prevent menu from closing */}
          <div className="absolute top-full left-0 h-4 w-full" />

          <div className="absolute top-full left-1/2 -translate-x-1/2 mt-4 w-[800px] bg-background-elevated border border-border-primary rounded-xl shadow-2xl overflow-hidden z-50">
            {/* Feature Columns */}
            <div className="grid grid-cols-4 gap-0 p-6">
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
                          <span className="text-lg flex-shrink-0">
                            {item.icon}
                          </span>
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
                  {integrations.map((integration) => (
                    <span
                      key={integration.name}
                      className="flex items-center gap-1.5 text-text-secondary text-sm hover:text-text-primary transition-colors cursor-pointer"
                    >
                      <span>{integration.icon}</span>
                      {integration.name}
                    </span>
                  ))}
                  <span className="text-text-muted text-sm italic">
                    More coming...
                  </span>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
