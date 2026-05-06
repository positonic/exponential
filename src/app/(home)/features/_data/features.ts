import { PRODUCT_NAME } from "~/lib/brand";

export interface FeatureData {
  slug: string;
  category: string;
  title: string;
  headline: string;
  description: string;
  benefits: string[];
  icon: string;
}

export const features: FeatureData[] = [
  // ALIGNMENT
  {
    slug: "goals",
    category: `${PRODUCT_NAME}'s Goals`,
    title: "Goals",
    headline: "Define what matters. Stay focused on why.",
    description:
      "Set strategic goals that guide your daily decisions. Unlike task lists that grow endlessly, goals give you clarity on what success looks like—so you can ignore everything else.",
    benefits: [
      "Connect daily work to strategic objectives",
      "See progress at a glance",
      "Stay aligned across your team",
      "Know when to say no",
    ],
    icon: "📎",
  },
  {
    slug: "outcomes",
    category: `${PRODUCT_NAME}'s Outcomes`,
    title: "Outcomes",
    headline: "Measure success at any time horizon.",
    description:
      "Define measurable outcomes for your week, month, or quarter. Outcomes bridge the gap between lofty goals and daily tasks—giving you concrete milestones to aim for.",
    benefits: [
      "Weekly, monthly, and quarterly horizons",
      "Track completion automatically",
      "Link actions directly to outcomes",
      "Celebrate wins along the way",
    ],
    icon: "🎯",
  },
  {
    slug: "okrs",
    category: `${PRODUCT_NAME}'s OKRs`,
    title: "OKRs",
    headline: "Objectives & Key Results that actually work.",
    description:
      "Implement OKRs without the spreadsheet chaos. Set ambitious objectives, define measurable key results, and watch your team align around what matters most.",
    benefits: [
      "Simple OKR creation and tracking",
      "Automatic progress calculation",
      "Team visibility and alignment",
      "Quarterly and annual planning",
    ],
    icon: "📈",
  },
  {
    slug: "weekly-plan",
    category: `${PRODUCT_NAME}'s Weekly Plan`,
    title: "Weekly Plan",
    headline: "Reflect, reset, realign—every week.",
    description:
      "A structured weekly ritual that keeps you connected to your goals. Smart project ordering surfaces what needs attention first. Streak tracking keeps you motivated week after week.",
    benefits: [
      "Streak tracking with milestone celebrations",
      "Smart project ordering by health score",
      "Track your habit on the habits page",
      "Guided reflection prompts",
      "Automatic progress summaries",
    ],
    icon: "🔄",
  },

  // EXECUTION
  {
    slug: "projects",
    category: `${PRODUCT_NAME}'s Projects`,
    title: "Projects",
    headline: "Containers for focused work.",
    description:
      "Organize related work into projects that connect to your bigger goals. No more scattered tasks across apps—everything lives in context.",
    benefits: [
      "Group related actions together",
      "Connect projects to goals",
      "Track project progress automatically",
      "Archive completed work",
    ],
    icon: "📋",
  },
  {
    slug: "actions",
    category: `${PRODUCT_NAME}'s Actions`,
    title: "Actions",
    headline: "Tasks that connect to outcomes.",
    description:
      `Every action in ${PRODUCT_NAME} links to why it matters. No more orphan tasks floating in a void—see exactly how each task drives your bigger goals.`,
    benefits: [
      "AI-generated action suggestions",
      "Automatic outcome linking",
      "Priority based on impact",
      "Quick capture from anywhere",
    ],
    icon: "✓",
  },
  {
    slug: "today-view",
    category: `${PRODUCT_NAME}'s Today View`,
    title: "Today View",
    headline: "Focus on what matters now.",
    description:
      "Start each day with clarity. The Today view shows you exactly what needs your attention—no scrolling through endless lists, just the work that moves the needle.",
    benefits: [
      "Daily focus dashboard",
      "Smart prioritization",
      "Calendar integration",
      "Quick wins highlighted",
    ],
    icon: "📅",
  },
  {
    slug: "inbox",
    category: `${PRODUCT_NAME}'s Inbox`,
    title: "Inbox",
    headline: "Capture anything, process later.",
    description:
      "Quick capture for ideas, tasks, and notes that pop into your head. Get them out of your brain and into a trusted system—then process them when you're ready.",
    benefits: [
      "One-click capture",
      "Process in batches",
      "AI-assisted categorization",
      "Never lose an idea",
    ],
    icon: "📥",
  },

  // AI FEATURES
  {
    slug: "ai-assistant",
    category: `${PRODUCT_NAME}'s AI Assistant`,
    title: "AI Assistant",
    headline: "Chat with Zoe about your work.",
    description:
      "Your AI co-pilot who understands your goals, projects, and context. Ask questions, get suggestions, and let AI help you stay focused on what matters.",
    benefits: [
      "Context-aware conversations",
      "Task breakdown assistance",
      "Priority recommendations",
      "Natural language commands",
    ],
    icon: "🤖",
  },
  {
    slug: "meeting-intelligence",
    category: `${PRODUCT_NAME}'s Meeting Intelligence`,
    title: "Meeting Intelligence",
    headline: "Meetings become actions automatically.",
    description:
      "Connect your meeting tools and watch action items flow into your workflow. No more lost decisions or forgotten follow-ups—AI captures everything.",
    benefits: [
      "Auto-capture action items",
      "Meeting summaries",
      "Fireflies integration",
      "Decision tracking",
    ],
    icon: "🎙️",
  },
  {
    slug: "smart-search",
    category: `${PRODUCT_NAME}'s Smart Search`,
    title: "Smart Search",
    headline: "Find anything across your work.",
    description:
      "Semantic search that understands what you're looking for. Find that goal you set three months ago or the action item from last week's meeting—instantly.",
    benefits: [
      "Semantic understanding",
      "Search across all content",
      "Filter by type and date",
      "Instant results",
    ],
    icon: "🔍",
  },

  // AI AUTOMATION
  {
    slug: "ai-project-manager",
    category: "AI Automation",
    title: "AI Project Manager",
    headline: "Your AI that runs projects.",
    description:
      "Let AI handle project coordination so you can focus on the work. It tracks progress, identifies blockers, nudges the right people, and keeps everything moving forward.",
    benefits: [
      "Automatic progress tracking",
      "Proactive blocker identification",
      "Smart status updates",
      "Team coordination on autopilot",
    ],
    icon: "👔",
  },
  {
    slug: "ai-workflows",
    category: "AI Automation",
    title: "AI Workflows",
    headline: "Automate the work about work.",
    description:
      "Create automated workflows that handle repetitive tasks. From routing new items to the right project, to sending reminders, to updating statuses—let AI do the busywork.",
    benefits: [
      "No-code workflow builder",
      "Trigger-based automation",
      "Cross-tool integrations",
      "Custom business logic",
    ],
    icon: "⚡",
  },

  // TEAM
  {
    slug: "workspaces",
    category: `${PRODUCT_NAME}'s Workspaces`,
    title: "Workspaces",
    headline: "Organize by client or project.",
    description:
      "Keep work separated by context. Whether you're juggling multiple clients, projects, or life areas—workspaces keep everything organized without the chaos.",
    benefits: [
      "Separate work contexts",
      "Switch instantly",
      "Invite team members",
      "Custom settings per workspace",
    ],
    icon: "👥",
  },
  {
    slug: "weekly-planning",
    category: `${PRODUCT_NAME}'s Weekly Planning`,
    title: "Weekly Planning",
    headline: "See what everyone's doing.",
    description:
      "Team visibility without the status meetings. See weekly outcomes, current focus, and progress across your team—all in one view.",
    benefits: [
      "Team outcome visibility",
      "No status meetings needed",
      "Spot blockers early",
      "Celebrate team wins",
    ],
    icon: "📊",
  },
  {
    slug: "team-capacity",
    category: `${PRODUCT_NAME}'s Team Capacity`,
    title: "Team Capacity",
    headline: "Track who's available.",
    description:
      "Know your team's bandwidth before assigning work. See who has capacity, who's overloaded, and plan accordingly—no awkward conversations needed.",
    benefits: [
      "Real-time availability",
      "Workload visualization",
      "Prevent burnout",
      "Smart assignment suggestions",
    ],
    icon: "📆",
  },
];

export function getFeatureBySlug(slug: string): FeatureData | undefined {
  return features.find((f) => f.slug === slug);
}

export function getAllFeatureSlugs(): string[] {
  return features.map((f) => f.slug);
}
