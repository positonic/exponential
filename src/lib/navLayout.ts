import { z } from 'zod';

export const navItemSchema = z.object({
  id: z.string(),
  hidden: z.boolean(),
});

export const navSectionSchema = z.object({
  id: z.string(),
  name: z.string(),
  hidden: z.boolean(),
  items: z.array(navItemSchema),
});

export const navLayoutSchema = z.array(navSectionSchema);

export type NavItem = z.infer<typeof navItemSchema>;
export type NavSection = z.infer<typeof navSectionSchema>;

export const DEFAULT_NAV_LAYOUT: NavSection[] = [
  {
    id: 'align',
    name: 'Align',
    hidden: false,
    items: [
      { id: 'goals', hidden: false },
      { id: 'alignment', hidden: false },
    ],
  },
  {
    id: 'deliver',
    name: 'Deliver',
    hidden: false,
    items: [
      { id: 'actions', hidden: false },
      { id: 'projects', hidden: false },
      { id: 'products', hidden: false },
    ],
  },
  {
    id: 'connect',
    name: 'Connect',
    hidden: false,
    items: [
      { id: 'crm', hidden: false },
    ],
  },
  {
    id: 'amplify',
    name: 'Amplify',
    hidden: false,
    items: [
      { id: 'agents', hidden: false },
      { id: 'meetings', hidden: false },
      { id: 'knowledge', hidden: false },
    ],
  },
];

export interface NavItemConfig {
  label: string;
  href: (workspaceSlug: string) => string;
  matchSegments?: string[];
  requiresPlugin?: string;
}

export const NAV_ITEM_CONFIG: Record<string, NavItemConfig> = {
  goals: {
    label: 'Goals',
    href: (s) => `/w/${s}/goals?tab=okrs`,
    matchSegments: ['goals', 'okrs'],
  },
  alignment: {
    label: 'Alignment',
    href: (s) => `/w/${s}/alignment`,
  },
  actions: {
    label: 'Actions',
    href: (s) => `/w/${s}/actions`,
  },
  projects: {
    label: 'Projects',
    href: (s) => `/w/${s}/projects`,
  },
  products: {
    label: 'Products',
    href: (s) => `/w/${s}/products`,
    requiresPlugin: 'product',
  },
  crm: {
    label: 'CRM',
    href: (s) => `/w/${s}/crm`,
  },
  agents: {
    label: 'Agents',
    href: (s) => `/w/${s}/agent`,
  },
  meetings: {
    label: 'Meetings',
    href: (s) => `/w/${s}/meetings`,
  },
  knowledge: {
    label: 'Knowledge',
    href: (s) => `/w/${s}/knowledge-base`,
  },
};

export function parseNavLayout(raw: unknown): NavSection[] {
  const result = navLayoutSchema.safeParse(raw);
  return result.success ? result.data : DEFAULT_NAV_LAYOUT;
}
