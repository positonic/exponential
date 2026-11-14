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
  /**
   * Folded shut in the sidebar (the items stay reachable by unfolding). Absent
   * on layouts saved before sections could collapse, which reads as open.
   */
  collapsed: z.boolean().optional(),
  items: z.array(navItemSchema),
});

export const navLayoutSchema = z.array(navSectionSchema);

export type NavItem = z.infer<typeof navItemSchema>;
export type NavSection = z.infer<typeof navSectionSchema>;

/**
 * Reserved section id for pinned shortcuts. It renders at the top of the
 * workspace nav without a heading or fold, like Notion's shortcut rows, and
 * is created on demand by {@link addShortcut}.
 */
export const SHORTCUTS_SECTION_ID = 'shortcuts';

/** A custom shortcut is any item that carries its own href. */
export function isCustomNavItem(item: NavItem): item is NavItem & { href: string } {
  return typeof item.href === 'string' && item.href.length > 0;
}

/**
 * The default sidebar. Section names are plain nouns for the kind of thing in
 * them (Plan, Work, People, Tools) rather than verbs the user has to decode;
 * a saved layout keeps whatever the user renamed them to.
 *
 * The default is deliberately short (decision 2026-11-14): a person who has
 * never arranged their sidebar sees the handful of places most people use, and
 * everything else is `hidden: true` — still listed under the sidebar's "More"
 * row, in the customiser and on the menu picker, one click from coming back.
 * Hiding by default rather than leaving the item out keeps its place in the
 * order for whoever switches it on.
 */
export const DEFAULT_NAV_LAYOUT: NavSection[] = [
  {
    id: 'align',
    name: 'Plan',
    hidden: false,
    items: [
      { id: 'goals', hidden: false },
      { id: 'decisions', hidden: false },
    ],
  },
  {
    id: 'deliver',
    name: 'Work',
    hidden: false,
    items: [
      { id: 'actions', hidden: true },
      { id: 'projects', hidden: false },
      { id: 'products', hidden: false },
      { id: 'metrics', hidden: true },
      { id: 'shipped', hidden: true },
      { id: 'pages', hidden: false },
    ],
  },
  {
    id: 'connect',
    name: 'People',
    hidden: false,
    items: [
      { id: 'crm', hidden: true },
    ],
  },
  {
    id: 'amplify',
    name: 'Tools',
    hidden: false,
    items: [
      { id: 'agents', hidden: true },
      { id: 'meetings', hidden: false },
      { id: 'knowledge', hidden: true },
    ],
  },
];

export interface NavItemConfig {
  label: string;
  /**
   * One plain sentence saying what the page is for, shown wherever a person
   * chooses what goes in their sidebar. Written for someone who has never
   * seen the product: no acronyms, no jargon, nothing that needs the label to
   * make sense. Keep it to about 45 characters so it stays on one line beside
   * its switch.
   */
  description: string;
  href: (workspaceSlug: string) => string;
  matchSegments?: string[];
  requiresPlugin?: string;
}

export const NAV_ITEM_CONFIG: Record<string, NavItemConfig> = {
  goals: {
    label: 'Goals',
    description: 'What you are aiming for, and your progress.',
    href: (s) => `/w/${s}/goals`,
    matchSegments: ['goals', 'okrs'],
  },
  decisions: {
    label: 'Decisions',
    description: 'What has been decided, and why.',
    href: (s) => `/w/${s}/decisions`,
  },
  actions: {
    label: 'Actions',
    description: 'All your tasks in one list.',
    href: (s) => `/w/${s}/actions`,
  },
  projects: {
    label: 'Projects',
    description: 'Pieces of work, each with its own tasks.',
    href: (s) => `/w/${s}/projects`,
  },
  products: {
    label: 'Products',
    description: 'Plan what you build: features and tickets.',
    href: (s) => `/w/${s}/products`,
    requiresPlugin: 'product',
  },
  metrics: {
    label: 'Metrics',
    description: 'Numbers that show how a product is doing.',
    href: (s) => `/w/${s}/metrics`,
    requiresPlugin: 'product',
  },
  // The per-workspace shipping timeline. Routed at `product-timeline` (the
  // workspace sibling of the public changelog) rather than `timeline`, which is
  // already the projects Gantt view.
  shipped: {
    label: 'Shipped',
    description: 'A timeline of what has been released.',
    href: (s) => `/w/${s}/product-timeline`,
    matchSegments: ['product-timeline'],
  },
  pages: {
    label: 'Pages',
    description: 'Notes and documents to write and share.',
    href: (s) => `/w/${s}/pages`,
  },
  crm: {
    label: 'CRM',
    description: 'The people and organisations you work with.',
    href: (s) => `/w/${s}/crm`,
  },
  agents: {
    label: 'Agents',
    description: 'AI assistants that help with your work.',
    href: (s) => `/w/${s}/agent`,
  },
  meetings: {
    label: 'Meetings',
    description: 'Notes and follow-ups from your meetings.',
    href: (s) => `/w/${s}/meetings`,
  },
  knowledge: {
    label: 'Knowledge',
    description: 'Articles, videos and links you have saved.',
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
 * shortcuts (items with their own `href`) are kept as they are. An item that
 * appears twice keeps only its first occurrence.
 */
function mergeWithDefaults(saved: NavSection[]): NavSection[] {
  // An item placed anywhere (moved to another section, pinned as a shortcut)
  // counts as present: only items missing from the whole layout are appended.
  const placedItemIds = new Set(saved.flatMap((s) => s.items.map((i) => i.id)));
  // Layouts saved under the old merge can hold an item twice (its moved
  // position and its default one). The first occurrence, in section order,
  // wins; the repair persists with the next save.
  const seen = new Set<string>();
  const merged = saved.map((section) => {
    const items = section.items.filter((i) => {
      if (!isCustomNavItem(i) && !Object.hasOwn(NAV_ITEM_CONFIG, i.id)) return false;
      if (seen.has(i.id)) return false;
      seen.add(i.id);
      return true;
    });
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

// --- Choosing what is in the sidebar -----------------------------------------

/** Where the menu picker lives once the welcome flow is over. */
export const MENU_PICKER_HREF = '/welcome/menu';

/**
 * What a person says they are here for on the menu picker. It only decides
 * which built-in items start switched on ({@link NAV_PRESETS}); every item can
 * still be switched individually afterwards.
 */
export const NAV_USE_CASES = ['personal', 'team', 'both'] as const;
export type NavUseCase = (typeof NAV_USE_CASES)[number];

/** Ids of the built-in items the default sidebar shows, in sidebar order. */
export const DEFAULT_VISIBLE_NAV_ITEM_IDS: readonly string[] = DEFAULT_NAV_LAYOUT.flatMap(
  (section) => (section.hidden ? [] : section.items.filter((i) => !i.hidden).map((i) => i.id)),
);

/**
 * The built-in items each use case starts with. `team` is the default sidebar
 * itself, so someone who skips the picker and someone who answers "with a
 * team" see the same thing; `personal` is a to-do list (tasks, the projects
 * they sit in, the goals they serve); `both` is the team set plus the task
 * list. Inbox, Today and Time are not here: they are always shown.
 */
export const NAV_PRESETS: Record<NavUseCase, readonly string[]> = {
  personal: ['goals', 'actions', 'projects'],
  team: DEFAULT_VISIBLE_NAV_ITEM_IDS,
  both: [...DEFAULT_VISIBLE_NAV_ITEM_IDS, 'actions'],
};

/** Every built-in item, in the order the default sidebar lists them. */
export const BUILT_IN_NAV_ITEM_IDS: readonly string[] = DEFAULT_NAV_LAYOUT.flatMap((section) =>
  section.items.map((i) => i.id),
);

/**
 * Ids of the built-in items a layout actually shows: not hidden, and not
 * inside a hidden section. Custom shortcuts are left out; they are not
 * something the menu picker offers.
 */
export function visibleNavItemIds(layout: NavSection[]): string[] {
  return layout.flatMap((section) =>
    section.hidden
      ? []
      : section.items.filter((i) => !i.hidden && !isCustomNavItem(i)).map((i) => i.id),
  );
}

/**
 * Shows exactly the built-in items in `visibleIds` and hides the rest, leaving
 * order, section names, folds and custom shortcuts as they were. A hidden
 * section that holds an item being shown is unhidden, since it would otherwise
 * swallow the item the person just switched on.
 *
 * Round-trips with {@link visibleNavItemIds}: applying a layout's own visible
 * ids changes nothing a person can see.
 */
export function applyNavVisibility(
  layout: NavSection[],
  visibleIds: Iterable<string>,
): NavSection[] {
  const visible = new Set(visibleIds);
  return layout.map((section) => {
    let showsBuiltIn = false;
    const items = section.items.map((item) => {
      if (isCustomNavItem(item)) return item;
      const hidden = !visible.has(item.id);
      if (!hidden) showsBuiltIn = true;
      return item.hidden === hidden ? item : { ...item, hidden };
    });
    return { ...section, hidden: showsBuiltIn ? false : section.hidden, items };
  });
}
