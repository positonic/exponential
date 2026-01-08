import {
  IconRocket,
  IconBolt,
  IconBrandSlack,
  IconBrandWhatsapp,
  IconFlame,
  IconNetwork,
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
        title: "Integrations",
        href: "/docs/features/integrations",
        icon: IconPlug,
      },
    ],
  },
  {
    title: "ARCHITECTURE",
    items: [
      {
        title: "Data Flow",
        href: "/docs/architecture/data-flow",
        icon: IconNetwork,
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
