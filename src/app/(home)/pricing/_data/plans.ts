/**
 * Everything the pricing page says about plans, in one place. The cards, the
 * comparison table and the FAQ all read from here, so the page cannot say one
 * thing in a card and another in the table.
 *
 * Only Free and Self-hosted can be used today. Team is listed as "Coming
 * soon" with a design-partner CTA and no price: there is no billing yet, and
 * the page must not show a price nobody can pay. When billing ships, give Team
 * a price here and swap its CTA.
 */

export const RAILWAY_DEPLOY_URL = "https://railway.com/deploy/exponential";
export const SELF_HOSTING_GUIDE_URL = "/docs/self-hosting";
export const DESIGN_PARTNER_EMAIL = "support@exponential.im";
export const DESIGN_PARTNER_HREF = `mailto:${DESIGN_PARTNER_EMAIL}?subject=${encodeURIComponent(
  "Exponential design partner",
)}`;

export type PlanId = "free" | "team" | "selfHosted";

export interface Plan {
  id: PlanId;
  name: string;
  /** A short label beside the name, e.g. the licence or "Coming soon". */
  tag?: string;
  price: string;
  /** Shown after the price in smaller type. */
  priceNote?: string;
  description: string;
  features: string[];
  cta: { label: string; href: string; variant: "pill" | "ghost" };
  /** Small print under the CTA. */
  footnote?: string;
  /** Draws the card on a raised surface. */
  highlighted?: boolean;
}

export const PLANS: Plan[] = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    priceNote: "per month",
    description: "The whole product on our servers. No credit card.",
    features: [
      "Unlimited people",
      "Unlimited agents and assistants",
      "Goals, OKRs, projects and actions",
      "Meetings, pages and CRM",
      "MCP server, CLI and SDK",
    ],
    cta: { label: "Get started free", href: "/signin", variant: "pill" },
  },
  {
    id: "team",
    name: "Team",
    tag: "Coming soon",
    price: "Soon",
    description:
      "For growing startups that want more assistant use and a person on support.",
    features: [
      "Everything in Free",
      "More assistant use, pooled across the workspace",
      "Email support within one business day",
      "Monthly or annual billing",
    ],
    cta: {
      label: "Become a design partner",
      href: DESIGN_PARTNER_HREF,
      variant: "ghost",
    },
    footnote:
      "Workspaces created before Team launches stay free for 12 months after it does.",
    highlighted: true,
  },
  {
    id: "selfHosted",
    name: "Self-hosted",
    tag: "AGPL-3.0",
    price: "$0",
    priceNote: "forever",
    description: "The same code on your own infrastructure, with no limits.",
    features: [
      "Every feature, unlimited people",
      "Your database, your model keys",
      "One-click deploy on Railway",
      "Use it inside your company without publishing your changes",
      "Community support on GitHub",
    ],
    cta: { label: "Deploy on Railway", href: RAILWAY_DEPLOY_URL, variant: "ghost" },
  },
];

/** `true` draws a check, `false` a dash, a string is printed as is. */
export type Cell = boolean | string;

export interface ComparisonGroup {
  label: string;
  rows: { feature: string; values: Record<PlanId, Cell> }[];
}

const everywhere: Record<PlanId, Cell> = { free: true, team: true, selfHosted: true };

export const COMPARISON: ComparisonGroup[] = [
  {
    label: "People and agents",
    rows: [
      {
        feature: "People",
        values: { free: "Unlimited", team: "Unlimited", selfHosted: "Unlimited" },
      },
      {
        feature: "Agents and assistants",
        values: { free: "Unlimited", team: "Unlimited", selfHosted: "Unlimited" },
      },
      { feature: "MCP server, CLI and SDK", values: everywhere },
      { feature: "Assign work to an assistant", values: everywhere },
    ],
  },
  {
    label: "Planning",
    rows: [
      { feature: "Goals, OKRs and key results", values: everywhere },
      { feature: "Projects, actions and tickets", values: everywhere },
      { feature: "Daily planning and weekly review", values: everywhere },
    ],
  },
  {
    label: "Assistant",
    rows: [
      {
        feature: "Assistant use",
        values: { free: "Included", team: "More, pooled", selfHosted: "Your own keys" },
      },
    ],
  },
  {
    label: "Meetings, knowledge and CRM",
    rows: [
      { feature: "Meeting notes and ceremonies", values: everywhere },
      { feature: "Pages and resources", values: everywhere },
      { feature: "Contacts, deals, Gmail and Calendar import", values: everywhere },
    ],
  },
  {
    label: "Admin and support",
    rows: [
      { feature: "Workspace roles", values: everywhere },
      {
        feature: "Support",
        values: {
          free: "Community",
          team: "Email, 1 business day",
          selfHosted: "Community",
        },
      },
    ],
  },
];

export const PRICING_RULES = [
  {
    title: "Agents aren't seats",
    body: "Connect Claude Code, Codex or your own agents over MCP or the CLI. Each one gets its own identity and audit trail, at no cost.",
  },
  {
    title: "No credit card, no trial clock",
    body: "The hosted plan is free today with nothing to enter. Nothing on Free moves behind a paywall when Team launches.",
  },
  {
    title: "Leave whenever you want",
    body: "The code is open, so you can run your own copy of everything we host.",
  },
];

export const FAQ = [
  {
    question: "Is the hosted plan really free?",
    answer:
      "Yes. There's no credit card and no trial clock. When Team launches, nothing you use on Free moves to it, and workspaces created before then get Team free for 12 months.",
  },
  {
    question: "Do agents count as seats?",
    answer:
      "No. Agents connected over MCP or the CLI, and assistants you assign work to, are unlimited on every plan. When Team launches, it will charge for people only.",
  },
  {
    question: "Who pays for the AI?",
    answer:
      "On the hosted plan, we do. Self-hosted installs use your own model keys, and AI is optional there.",
  },
  {
    question: "Can my company use the open-source version?",
    answer:
      "Yes. The AGPL asks you to share your changes only if you offer a modified Exponential as a service to other people. Running it inside your company carries no obligation.",
  },
  {
    question: "What's the difference between hosted and self-hosted?",
    answer:
      "None in features: it's the same code. Hosted means we run it, update it and keep it backed up. Self-hosted means you do, on your own servers and with your own data.",
  },
  {
    question: "What is a design partner?",
    answer:
      "A startup that uses Exponential every week and talks to us about what it needs before Team launches. Design partners get Team free while we shape it.",
  },
];
