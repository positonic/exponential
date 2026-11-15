import {
  IconDashboard,
  IconMessageCircle,
  IconArrowLeft,
  IconStar,
  IconBulb,
  IconUsers,
  IconDatabase,
  IconGauge,
} from "@tabler/icons-react";
import type { ElementType } from "react";

export interface AdminNavItem {
  title: string;
  href?: string;
  icon?: ElementType;
  /** Listed only on an install that meters Assistant use (`BILLING_MODE` is not `off`). */
  meteredOnly?: boolean;
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
        title: "Users",
        href: "/admin/users",
        icon: IconUsers,
      },
      {
        title: "AI Interactions",
        href: "/admin/ai-interactions",
        icon: IconMessageCircle,
      },
      {
        title: "Feedback",
        href: "/admin/feedback",
        icon: IconStar,
      },
      {
        title: "Feature Requests",
        href: "/admin/feature-requests",
        icon: IconBulb,
      },
      {
        title: "Knowledge index",
        href: "/admin/knowledge-index",
        icon: IconDatabase,
      },
      {
        title: "Assistant usage",
        href: "/admin/assistant-usage",
        icon: IconGauge,
        meteredOnly: true,
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
