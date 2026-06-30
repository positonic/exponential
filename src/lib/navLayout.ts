import { z } from 'zod';

export const navItemSchema = z.object({
  id: z.string().min(1),
  hidden: z.boolean(),
});

export const navSectionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
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

/**
 * Merges a persisted layout with {@link DEFAULT_NAV_LAYOUT} so that sections and
 * items added to the defaults in a later release roll out to existing users.
 * The user's existing order, custom names, and visibility flags are preserved;
 * missing default items are appended to their matching section and missing
 * default sections are appended at the end.
 */
function mergeWithDefaults(saved: NavSection[]): NavSection[] {
  const merged = saved.map((section) => {
    const defaultSection = DEFAULT_NAV_LAYOUT.find((d) => d.id === section.id);
    if (!defaultSection) return section;

    const existingItemIds = new Set(section.items.map((i) => i.id));
    const missingItems = defaultSection.items
      .filter((i) => !existingItemIds.has(i.id))
      .map((i) => ({ ...i }));

    return missingItems.length > 0
      ? { ...section, items: [...section.items, ...missingItems] }
      : section;
  });

  const existingSectionIds = new Set(saved.map((s) => s.id));
  const missingSections = DEFAULT_NAV_LAYOUT.filter(
    (d) => !existingSectionIds.has(d.id),
  ).map((s) => ({ ...s, items: s.items.map((i) => ({ ...i })) }));

  return [...merged, ...missingSections];
}

/**
 * Parses persisted navigation layout data into a validated `NavSection[]`.
 * Returns {@link DEFAULT_NAV_LAYOUT} when `raw` is null/undefined or fails
 * schema validation. On a successful parse the stored layout is merged with the
 * defaults (see {@link mergeWithDefaults}) so newly shipped nav entries appear
 * for existing users.
 *
 * @example
 * const layout = parseNavLayout(preferences?.navLayout ?? null);
 */
export function parseNavLayout(raw: unknown): NavSection[] {
  const result = navLayoutSchema.safeParse(raw);
  return result.success ? mergeWithDefaults(result.data) : DEFAULT_NAV_LAYOUT;
}
