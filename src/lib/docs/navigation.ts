import {
  IconRocket,
  IconBolt,
  IconBrandSlack,
  IconBrandWhatsapp,
  IconFlame,
  IconPlug,
  IconBook,
  IconSettings,
  IconDeviceMobile,
  IconFolders,
  IconChecklist,
  IconTargetArrow,
  IconNotebook,
  IconInbox,
  IconCalendarWeek,
  IconCircles,
  IconSunrise,
  IconRepeat,
  IconDatabase,
  IconTarget,
  IconAddressBook,
  IconBuildingSkyscraper,
  IconUsers,
  IconRobot,
  IconKey,
  IconPlayerPlay,
  IconLayoutNavbar,
  IconMicrophone,
  IconChartBar,
} from "@tabler/icons-react";
import type { DocNavSection, DocBreadcrumb } from "./types";

export const docsNavigation: DocNavSection[] = [
  {
    title: "GET STARTED",
    items: [
      {
        title: "Introduction",
        href: "/docs",
        icon: IconBook,
      },
      {
        title: "Quickstart",
        href: "/docs/getting-started",
        icon: IconBolt,
      },
      {
        title: "Configuration",
        href: "/docs/getting-started/configuration",
        icon: IconSettings,
      },
      {
        title: "Mobile App",
        href: "/docs/getting-started/mobile-app",
        icon: IconDeviceMobile,
      },
    ],
  },
  {
    title: "FEATURES",
    items: [
      {
        title: "Overview",
        href: "/docs/features",
        icon: IconRocket,
      },
      {
        title: "Projects",
        href: "/docs/features/projects",
        icon: IconFolders,
      },
      {
        title: "Actions & Tasks",
        href: "/docs/features/actions",
        icon: IconChecklist,
      },
      {
        title: "Goals & Outcomes",
        href: "/docs/features/goals-outcomes",
        icon: IconTargetArrow,
      },
      {
        title: "Inbox & Today",
        href: "/docs/features/inbox-today",
        icon: IconInbox,
      },
      {
        title: "Daily Journal",
        href: "/docs/features/journal",
        icon: IconNotebook,
      },
      {
        title: "Weekly Review",
        href: "/docs/features/weekly-review",
        icon: IconCalendarWeek,
      },
      {
        title: "Wheel of Life",
        href: "/docs/features/wheel-of-life",
        icon: IconCircles,
      },
      {
        title: "Routines",
        href: "/docs/features/routines",
        icon: IconSunrise,
      },
      {
        title: "Habits",
        href: "/docs/features/habits",
        icon: IconRepeat,
      },
      {
        title: "Slack Integration",
        href: "/docs/features/slack",
        icon: IconBrandSlack,
      },
      {
        title: "WhatsApp Integration",
        href: "/docs/features/whatsapp-gateway",
        icon: IconBrandWhatsapp,
      },
      {
        title: "Fireflies Workflow",
        href: "/docs/features/fireflies",
        icon: IconFlame,
      },
      {
        title: "iOS Shortcut",
        href: "/docs/features/ios-shortcut",
        icon: IconDeviceMobile,
      },
      {
        title: "Chrome Extension",
        href: "/docs/features/chrome-extension",
        icon: IconMicrophone,
      },
      {
        title: "Knowledge Base",
        href: "/docs/features/knowledge-base",
        icon: IconDatabase,
      },
      {
        title: "Integrations",
        href: "/docs/features/integrations",
        icon: IconPlug,
      },
      {
        title: "Workspaces",
        href: "/docs/features/workspaces",
        icon: IconBuildingSkyscraper,
      },
      {
        title: "Teams",
        href: "/docs/features/teams",
        icon: IconUsers,
      },
      {
        title: "AI Assistant",
        href: "/docs/features/ai-assistant",
        icon: IconRobot,
      },
      {
        title: "Sprint Insights",
        href: "/docs/features/sprint-insights",
        icon: IconChartBar,
      },
      {
        title: "Workflows",
        href: "/docs/features/workflows",
        icon: IconPlayerPlay,
      },
      {
        title: "API Access",
        href: "/docs/features/api-access",
        icon: IconKey,
      },
      {
        title: "Settings",
        href: "/docs/features/settings",
        icon: IconLayoutNavbar,
      },
    ],
  },
  {
    title: "PLUGINS",
    items: [
      {
        title: "Plugins Overview",
        href: "/docs/features/plugins",
        icon: IconPlug,
      },
      {
        title: "OKRs",
        href: "/docs/features/okr",
        icon: IconTarget,
      },
      {
        title: "CRM",
        href: "/docs/features/crm",
        icon: IconAddressBook,
      },
    ],
  },
];

// Helper to flatten navigation for prev/next
export function flattenNavigation(): { title: string; href: string }[] {
  const flat: { title: string; href: string }[] = [];

  for (const section of docsNavigation) {
    for (const item of section.items) {
      if (item.href) {
        flat.push({ title: item.title, href: item.href });
      }
      if (item.children) {
        for (const child of item.children) {
          if (child.href) {
            flat.push({ title: child.title, href: child.href });
          }
        }
      }
    }
  }

  return flat;
}

// Helper to get current section from slug
export function getCurrentSection(pathname: string): string | null {
  for (const section of docsNavigation) {
    for (const item of section.items) {
      if (item.href === pathname) {
        return section.title;
      }
      if (item.children) {
        for (const child of item.children) {
          if (child.href === pathname) {
            return section.title;
          }
        }
      }
    }
  }
  return null;
}

// Helper to get prev/next pages
export function getPrevNextPages(pathname: string): {
  prev: { title: string; href: string } | null;
  next: { title: string; href: string } | null;
} {
  const flat = flattenNavigation();
  const currentIndex = flat.findIndex((item) => item.href === pathname);

  return {
    prev: currentIndex > 0 ? flat[currentIndex - 1] ?? null : null,
    next: currentIndex < flat.length - 1 ? flat[currentIndex + 1] ?? null : null,
  };
}

// Helper to get breadcrumbs for current page
export function getBreadcrumbs(pathname: string): DocBreadcrumb[] {
  const breadcrumbs: DocBreadcrumb[] = [{ title: "Docs", href: "/docs" }];

  for (const section of docsNavigation) {
    for (const item of section.items) {
      if (item.href === pathname) {
        breadcrumbs.push({ title: section.title });
        return breadcrumbs;
      }
      if (item.children) {
        for (const child of item.children) {
          if (child.href === pathname) {
            breadcrumbs.push({ title: section.title });
            if (item.href) {
              breadcrumbs.push({ title: item.title, href: item.href });
            }
            return breadcrumbs;
          }
        }
      }
    }
  }

  return breadcrumbs;
}
