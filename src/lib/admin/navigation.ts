import {
  IconDashboard,
  IconMessageCircle,
  IconArrowLeft,
} from "@tabler/icons-react";
import type { ElementType } from "react";

export interface AdminNavItem {
  title: string;
  href?: string;
  icon?: ElementType;
}

export interface AdminNavSection {
  title: string;
  items: AdminNavItem[];
}

export const adminNavigation: AdminNavSection[] = [
  {
    title: "ADMIN",
    items: [
      {
        title: "Dashboard",
        href: "/admin",
        icon: IconDashboard,
      },
      {
        title: "AI Interactions",
        href: "/admin/ai-interactions",
        icon: IconMessageCircle,
      },
    ],
  },
  {
    title: "",
    items: [
      {
        title: "Back to App",
        href: "/home",
        icon: IconArrowLeft,
      },
    ],
  },
];
