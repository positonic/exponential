import { z } from 'zod';

/**
 * Hrefs a custom shortcut may point at: a path inside the app (`/…`) or an
 * absolute http(s) URL. Rejects `javascript:` and friends.
 */
export function isSafeShortcutHref(href: string): boolean {
  const trimmed = href.trim();
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return true;
  return /^https?:\/\/[^\s]+$/i.test(trimmed);
}

/**
 * A sidebar entry. Built-in items carry only an `id` that keys into
 * {@link NAV_ITEM_CONFIG}. Custom shortcuts (added from the in-sidebar
 * customiser) also carry their own `label` and `href`. The href scheme is
 * checked here, in the schema, so the server rejects a `javascript:` link
 * regardless of which client sent it.
 */
export const navItemSchema = z.object({
  id: z.string().min(1),
  hidden: z.boolean(),
  label: z.string().min(1).max(80).optional(),
  href: z
    .string()
    .min(1)
    .max(500)
    .refine(isSafeShortcutHref, { message: 'Shortcut links must be an app path or an http(s) URL' })
    .optional(),
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

/**
 * Reserved section id for pinned shortcuts. It renders at the top of the
 * workspace nav without a heading or divider, like Notion's shortcut rows,
 * and is created on demand by {@link addShortcut}.
 */
export const SHORTCUTS_SECTION_ID = 'shortcuts';

/** A custom shortcut is any item that carries its own href. */
export function isCustomNavItem(item: NavItem): item is NavItem & { href: string } {
  return typeof item.href === 'string' && item.href.length > 0;
}


export const DEFAULT_NAV_LAYOUT: NavSection[] = [
  {
    id: 'align',
    name: 'Align',
    hidden: false,
    items: [
      { id: 'goals', hidden: false },
      { id: 'decisions', hidden: false },
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
      { id: 'metrics', hidden: false },
      { id: 'shipped', hidden: false },
      { id: 'pages', hidden: false },
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
    href: (s) => `/w/${s}/goals`,
    matchSegments: ['goals', 'okrs'],
  },
  decisions: {
    label: 'Decisions',
    href: (s) => `/w/${s}/decisions`,
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
  metrics: {
    label: 'Metrics',
    href: (s) => `/w/${s}/metrics`,
    requiresPlugin: 'product',
  },
  // The per-workspace shipping timeline. Routed at `product-timeline` (the
  // workspace sibling of the public changelog) rather than `timeline`, which is
  // already the projects Gantt view.
  shipped: {
    label: 'Shipped',
    href: (s) => `/w/${s}/product-timeline`,
    matchSegments: ['product-timeline'],
  },
  pages: {
    label: 'Pages',
    href: (s) => `/w/${s}/pages`,
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
 * default items missing from the whole layout are appended to their default
 * section (an item moved elsewhere stays there) and missing default sections
 * are appended at the end. Items whose id no longer exists in
 * {@link NAV_ITEM_CONFIG} (a retired nav entry, e.g. the old `alignment` item)
 * are dropped so they neither render nor linger in the settings editor; custom
 * shortcuts (items with their own `href`) are kept as they are.
 */
function mergeWithDefaults(saved: NavSection[]): NavSection[] {
  // An item placed anywhere (moved to another section, pinned as a shortcut)
  // counts as present: only items missing from the whole layout are appended.
  const placedItemIds = new Set(saved.flatMap((s) => s.items.map((i) => i.id)));
  const merged = saved.map((section) => {
    const items = section.items.filter(
      (i) => isCustomNavItem(i) || Object.hasOwn(NAV_ITEM_CONFIG, i.id),
    );
    const defaultSection = DEFAULT_NAV_LAYOUT.find((d) => d.id === section.id);
    if (!defaultSection) return { ...section, items };

    const missingItems = defaultSection.items
      .filter((i) => !placedItemIds.has(i.id))
      .map((i) => ({ ...i }));

    return { ...section, items: [...items, ...missingItems] };
  });

  const existingSectionIds = new Set(saved.map((s) => s.id));
  const missingSections = DEFAULT_NAV_LAYOUT.filter(
    (d) => !existingSectionIds.has(d.id),
  ).map((s) => ({
    ...s,
    items: s.items.filter((i) => !placedItemIds.has(i.id)).map((i) => ({ ...i })),
  }));

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

function uniqueId(prefix: string, taken: Set<string>): string {
  let n = 1;
  while (taken.has(`${prefix}-${n}`)) n += 1;
  return `${prefix}-${n}`;
}

/** Ids of built-in items not yet pinned in the shortcuts section. */
export function shortcutCandidates(layout: NavSection[]): string[] {
  const pinned = new Set(
    layout.find((s) => s.id === SHORTCUTS_SECTION_ID)?.items.map((i) => i.id) ?? [],
  );
  return Object.keys(NAV_ITEM_CONFIG).filter((id) => !pinned.has(id));
}

/**
 * Appends a built-in item or a custom link to the shortcuts section, creating
 * that section at the top when it does not exist yet. A built-in item already
 * placed elsewhere is moved rather than duplicated, and unhidden.
 */
export function addShortcut(
  layout: NavSection[],
  shortcut: { itemId: string } | { label: string; href: string },
): NavSection[] {
  let item: NavItem;
  let next = layout;
  if ('itemId' in shortcut) {
    item = { id: shortcut.itemId, hidden: false };
    next = layout.map((s) => ({ ...s, items: s.items.filter((i) => i.id !== shortcut.itemId) }));
  } else {
    const taken = new Set(layout.flatMap((s) => s.items.map((i) => i.id)));
    item = {
      id: uniqueId('link', taken),
      hidden: false,
      label: shortcut.label.trim(),
      href: shortcut.href.trim(),
    };
  }
  const existing = next.find((s) => s.id === SHORTCUTS_SECTION_ID);
  if (existing) {
    return next.map((s) =>
      s.id === SHORTCUTS_SECTION_ID ? { ...s, items: [...s.items, item] } : s,
    );
  }
  return [{ id: SHORTCUTS_SECTION_ID, name: 'Shortcuts', hidden: false, items: [item] }, ...next];
}

/** Appends an empty, user-named section. */
export function addSection(layout: NavSection[], name: string): NavSection[] {
  const taken = new Set(layout.map((s) => s.id));
  return [...layout, { id: uniqueId('section', taken), name: name.trim() || 'New section', hidden: false, items: [] }];
}

/**
 * Removes a custom shortcut. Built-in items are hidden rather than removed:
 * {@link parseNavLayout} re-appends any default item that is missing.
 */
export function removeNavItem(layout: NavSection[], itemId: string): NavSection[] {
  return layout.map((s) => ({ ...s, items: s.items.filter((i) => i.id !== itemId) }));
}

/**
 * Removes a user-added section (or the shortcuts section) with its items.
 * Default sections are left untouched: {@link parseNavLayout} would re-append
 * them, so they are hidden instead.
 */
export function removeSection(layout: NavSection[], sectionId: string): NavSection[] {
  if (DEFAULT_NAV_LAYOUT.some((d) => d.id === sectionId)) return layout;
  return layout.filter((s) => s.id !== sectionId);
}
