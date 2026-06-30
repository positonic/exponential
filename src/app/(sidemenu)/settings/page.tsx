"use client";

import React, { useState, useCallback, useRef } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { api } from "~/trpc/react";
import {
  Container,
  Title,
  Text,
  Stack,
  Group,
  Switch,
  Paper,
  Loader,
  Button,
  Card,
  TextInput,
} from "@mantine/core";
import {
  IconGripVertical,
  IconRefresh,
  IconCheck,
  IconAlertCircle,
  IconQuote,
  IconSparkles,
  IconChevronRight,
  IconEye,
  IconEyeOff,
} from "@tabler/icons-react";
import Link from "next/link";
import { notifications } from "@mantine/notifications";
import {
  parseNavLayout,
  DEFAULT_NAV_LAYOUT,
  NAV_ITEM_CONFIG,
  type NavSection,
  type NavItem,
} from "~/lib/navLayout";

// Drag ID helpers
type DragInfo =
  | { type: 'section'; sectionId: string; itemId: null }
  | { type: 'item'; sectionId: string; itemId: string };

function secId(id: string): string {
  return `sec:${id}`;
}

function itmId(sectionId: string, itemId: string): string {
  return `itm:${sectionId}:${itemId}`;
}

function parseDragId(id: string): DragInfo | null {
  if (id.startsWith('sec:')) return { type: 'section', sectionId: id.slice(4), itemId: null };
  if (id.startsWith('itm:')) {
    const parts = id.slice(4).split(':');
    return { type: 'item', sectionId: parts[0] ?? '', itemId: parts[1] ?? '' };
  }
  return null;
}

// --- SortableItem ---
interface SortableNavItemRowProps {
  item: NavItem;
  sectionId: string;
  onToggle: () => void;
}

function SortableNavItemRow({ item, sectionId, onToggle }: SortableNavItemRowProps): React.ReactElement {
  const dndId = itmId(sectionId, item.id);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: dndId });
  const config = NAV_ITEM_CONFIG[item.id];
  const label = config?.label ?? item.id;

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-surface-primary border border-border-primary">
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={`Drag to reorder ${label}`}
        className="cursor-grab text-text-muted hover:text-text-primary touch-none"
      >
        <IconGripVertical size={14} />
      </button>
      <span className={`flex-1 text-sm ${item.hidden ? 'text-text-muted line-through' : 'text-text-primary'}`}>
        {label}
      </span>
      {config?.requiresPlugin && (
        <span className="text-[10px] text-text-muted px-1.5 py-0.5 rounded bg-surface-tertiary">plugin</span>
      )}
      <button
        type="button"
        onClick={onToggle}
        aria-label={`${item.hidden ? 'Show' : 'Hide'} ${label}`}
        className="text-text-muted hover:text-text-primary"
      >
        {item.hidden ? <IconEyeOff size={14} /> : <IconEye size={14} />}
      </button>
    </div>
  );
}

// Drag overlay version (no sortable hooks)
interface NavItemRowOverlayProps {
  label: string;
}

function NavItemRowOverlay({ label }: NavItemRowOverlayProps): React.ReactElement {
  return (
    <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-surface-secondary border border-border-focus shadow-lg opacity-95">
      <IconGripVertical size={14} className="text-text-muted" />
      <span className="flex-1 text-sm text-text-primary">{label}</span>
    </div>
  );
}

// --- SortableSection ---
interface SortableSectionRowProps {
  section: NavSection;
  onToggle: () => void;
  onRename: (name: string) => void;
  onToggleItem: (itemId: string) => void;
}

function SortableSectionRow({ section, onToggle, onRename, onToggleItem }: SortableSectionRowProps): React.ReactElement {
  const dndId = secId(section.id);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: dndId });
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(section.name);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const commitRename = () => {
    setEditing(false);
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== section.name) onRename(trimmed);
    else setEditValue(section.name);
  };

  return (
    <div ref={setNodeRef} style={style}>
      <Paper withBorder p="sm" className="bg-surface-secondary border-border-primary">
        <Stack gap="xs">
          {/* Section header */}
          <Group gap="xs" wrap="nowrap">
            <button
              type="button"
              {...attributes}
              {...listeners}
              aria-label={`Drag to reorder ${section.name} section`}
              className="cursor-grab text-text-muted hover:text-text-primary touch-none shrink-0"
            >
              <IconGripVertical size={16} />
            </button>

            {editing ? (
              <TextInput
                value={editValue}
                size="xs"
                className="flex-1"
                onChange={(e) => setEditValue(e.currentTarget.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename();
                  if (e.key === 'Escape') { setEditing(false); setEditValue(section.name); }
                }}
                autoFocus
              />
            ) : (
              <button
                className="flex-1 text-left text-sm font-semibold text-text-primary tracking-wide uppercase hover:text-brand-primary transition-colors"
                onClick={() => { setEditing(true); setEditValue(section.name); }}
                title="Click to rename"
              >
                {section.name}
              </button>
            )}

            <Switch
              size="xs"
              checked={!section.hidden}
              onChange={onToggle}
            />
          </Group>

          {/* Items */}
          {!section.hidden && (
            <div className="flex flex-col gap-1 pl-5">
              <SortableContext
                items={section.items.map((i) => itmId(section.id, i.id))}
                strategy={verticalListSortingStrategy}
              >
                {section.items.map((item) => (
                  <SortableNavItemRow
                    key={item.id}
                    item={item}
                    sectionId={section.id}
                    onToggle={() => onToggleItem(item.id)}
                  />
                ))}
              </SortableContext>
            </div>
          )}
        </Stack>
      </Paper>
    </div>
  );
}

interface SectionRowOverlayProps {
  name: string;
}

function SectionRowOverlay({ name }: SectionRowOverlayProps): React.ReactElement {
  return (
    <Paper withBorder p="sm" className="bg-surface-secondary border-border-focus shadow-lg opacity-95">
      <Group gap="xs">
        <IconGripVertical size={16} className="text-text-muted" />
        <span className="text-sm font-semibold text-text-primary tracking-wide uppercase">{name}</span>
      </Group>
    </Paper>
  );
}

// --- Main page ---
/**
 * Settings page for editing and persisting the user's navigation layout
 * preferences — section/item ordering, renaming, and visibility — via a
 * drag-and-drop editor backed by the `navigationPreference` router.
 */
export default function NavigationSettingsPage(): React.ReactElement {
  const utils = api.useUtils();

  const { data: preferences, isLoading } = api.navigationPreference.getPreferences.useQuery();

  const [layout, setLayout] = useState<NavSection[]>(() =>
    parseNavLayout(null)
  );

  // Sync layout from preferences once loaded
  React.useEffect(() => {
    if (preferences !== undefined) {
      setLayout(parseNavLayout(preferences.navLayout));
    }
  }, [preferences]);

  const [activeId, setActiveId] = useState<string | null>(null);

  const updateNavLayout = api.navigationPreference.updateNavLayout.useMutation({
    onSuccess: () => void utils.navigationPreference.getPreferences.invalidate(),
    onError: (error) => {
      notifications.show({
        title: "Error",
        message: error.message ?? "Failed to save",
        color: "red",
        icon: <IconAlertCircle size={16} />,
      });
    },
  });

  const resetToDefaults = api.navigationPreference.resetToDefaults.useMutation({
    onSuccess: () => {
      setLayout(DEFAULT_NAV_LAYOUT);
      void utils.navigationPreference.getPreferences.invalidate();
      notifications.show({ title: "Reset", message: "Navigation restored to defaults", color: "blue", icon: <IconCheck size={16} /> });
    },
  });

  const toggleInspiringQuote = api.navigationPreference.toggleInspiringQuote.useMutation({
    onSuccess: () => void utils.navigationPreference.getPreferences.invalidate(),
  });

  const toggleSuggestedFocus = api.navigationPreference.toggleSuggestedFocus.useMutation({
    onSuccess: () => void utils.navigationPreference.getPreferences.invalidate(),
  });

  // Serialize layout writes: every edit (toggle/rename/reorder) sends the full
  // NavSection[] snapshot, so concurrent in-flight saves could land out of
  // order and let a stale snapshot overwrite a newer one. Chaining each save
  // onto the previous one guarantees the server receives them in edit order.
  const saveChain = useRef<Promise<unknown>>(Promise.resolve());
  const saveLayout = useCallback((newLayout: NavSection[]) => {
    saveChain.current = saveChain.current
      .then(() => updateNavLayout.mutateAsync(newLayout))
      .catch(() => undefined);
  }, [updateNavLayout]);

  // --- Layout mutation helpers ---
  const toggleSection = (sectionId: string) => {
    const next = layout.map((s) =>
      s.id === sectionId ? { ...s, hidden: !s.hidden } : s
    );
    setLayout(next);
    saveLayout(next);
  };

  const renameSection = (sectionId: string, name: string) => {
    const next = layout.map((s) =>
      s.id === sectionId ? { ...s, name } : s
    );
    setLayout(next);
    saveLayout(next);
  };

  const toggleItem = (sectionId: string, itemId: string) => {
    const next = layout.map((s) =>
      s.id === sectionId
        ? { ...s, items: s.items.map((i) => i.id === itemId ? { ...i, hidden: !i.hidden } : i) }
        : s
    );
    setLayout(next);
    saveLayout(next);
  };

  // --- DnD ---
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeInfo = parseDragId(active.id as string);
    const overInfo = parseDragId(over.id as string);
    if (!activeInfo || !overInfo || activeInfo.type !== 'item') return;

    const activeItemId = activeInfo.itemId;
    const targetSectionId = overInfo.sectionId;

    // Move item to new section
    setLayout((prev) => {
      // Resolve the item's CURRENT section from the latest state — the active
      // drag id still encodes the item's original section, so re-deriving it
      // here lets the item move between (and back to) sections within one drag.
      const source = prev.find((s) => s.items.some((i) => i.id === activeItemId));
      const target = prev.find((s) => s.id === targetSectionId);
      if (!source || !target) return prev;
      if (source.id === targetSectionId) return prev;

      const item = source.items.find((i) => i.id === activeItemId);
      if (!item) return prev;

      const overItemIdx = overInfo.type === 'item'
        ? target.items.findIndex((i) => i.id === overInfo.itemId)
        : target.items.length;

      const insertAt = overItemIdx === -1 ? target.items.length : overItemIdx;

      return prev.map((s) => {
        if (s.id === source.id) return { ...s, items: s.items.filter((i) => i.id !== activeItemId) };
        if (s.id === targetSectionId) {
          const newItems = [...s.items];
          newItems.splice(insertAt, 0, item);
          return { ...s, items: newItems };
        }
        return s;
      });
    });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    if (!over || active.id === over.id) return;

    const activeInfo = parseDragId(active.id as string);
    const overInfo = parseDragId(over.id as string);
    if (!activeInfo || !overInfo) return;

    let next = layout;

    if (activeInfo.type === 'section') {
      const oldIdx = layout.findIndex((s) => s.id === activeInfo.sectionId);
      const newIdx = layout.findIndex((s) => s.id === overInfo.sectionId);
      if (oldIdx !== -1 && newIdx !== -1) {
        next = arrayMove(layout, oldIdx, newIdx);
      }
    } else if (activeInfo.type === 'item') {
      // Resolve the item's CURRENT section from the latest layout — onDragOver
      // may have already moved it across sections during this drag, so
      // activeInfo.sectionId (the original section) can be stale. Finalize the
      // reorder within whichever section now holds the item, at the drop point.
      const activeItemId = activeInfo.itemId;
      const currentSection = layout.find((s) => s.items.some((i) => i.id === activeItemId));
      if (currentSection && overInfo.sectionId === currentSection.id) {
        next = layout.map((s) => {
          if (s.id !== currentSection.id) return s;
          const oldIdx = s.items.findIndex((i) => i.id === activeItemId);
          const newIdx = s.items.findIndex((i) => i.id === overInfo.itemId);
          if (oldIdx === -1 || newIdx === -1) return s;
          return { ...s, items: arrayMove(s.items, oldIdx, newIdx) };
        });
      }
    }
    // Cross-section moves are already finalized by onDragOver.

    setLayout(next);
    saveLayout(next);
  };

  // Overlay content
  const activeInfo = activeId ? parseDragId(activeId) : null;
  const overlayLabel = activeInfo
    ? activeInfo.type === 'section'
      ? (layout.find((s) => s.id === activeInfo.sectionId)?.name ?? '')
      : (NAV_ITEM_CONFIG[activeInfo.itemId ?? '']?.label ?? activeInfo.itemId ?? '')
    : '';

  if (isLoading) {
    return (
      <Container size="md" py="xl">
        <div className="flex justify-center py-12">
          <Loader size="lg" />
        </div>
      </Container>
    );
  }

  return (
    <Container size="md" py="xl">
      <Stack gap="xl">
        {/* Header */}
        <Group justify="space-between" align="flex-start">
          <div>
            <Title order={2} className="text-text-primary">Navigation</Title>
            <Text c="dimmed" mt="xs" size="sm">
              Drag to reorder sections and items. Click a section name to rename it. Toggle visibility with the eye icon or switch.
            </Text>
          </div>
          <Button
            variant="light"
            leftSection={<IconRefresh size={16} />}
            onClick={() => resetToDefaults.mutate()}
            loading={resetToDefaults.isPending}
            size="sm"
          >
            Reset
          </Button>
        </Group>

        {/* Nav layout editor */}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={layout.map((s) => secId(s.id))}
            strategy={verticalListSortingStrategy}
          >
            <Stack gap="sm">
              {layout.map((section) => (
                <SortableSectionRow
                  key={section.id}
                  section={section}
                  onToggle={() => toggleSection(section.id)}
                  onRename={(name) => renameSection(section.id, name)}
                  onToggleItem={(itemId) => toggleItem(section.id, itemId)}
                />
              ))}
            </Stack>
          </SortableContext>

          <DragOverlay>
            {activeId && activeInfo && (
              activeInfo.type === 'section'
                ? <SectionRowOverlay name={overlayLabel} />
                : <NavItemRowOverlay label={overlayLabel} />
            )}
          </DragOverlay>
        </DndContext>

        {/* Home Screen */}
        <Card className="bg-surface-secondary border-border-primary" withBorder p="lg">
          <Title order={4} className="text-text-primary" mb="md">Home Screen</Title>
          <Stack gap="sm">
            <Paper p="sm" withBorder className="bg-surface-primary">
              <Group justify="space-between">
                <Group gap="sm">
                  <IconQuote size={18} className="text-text-muted" />
                  <div>
                    <Text size="sm" fw={500}>Daily Inspiring Quote</Text>
                    <Text size="xs" c="dimmed">Show a motivational quote each day</Text>
                  </div>
                </Group>
                <Switch
                  checked={preferences?.showInspiringQuote ?? true}
                  onChange={(e) => toggleInspiringQuote.mutate({ visible: e.currentTarget.checked })}
                  disabled={toggleInspiringQuote.isPending}
                />
              </Group>
            </Paper>

            <Paper p="sm" withBorder className="bg-surface-primary">
              <Group justify="space-between">
                <Group gap="sm">
                  <IconSparkles size={18} className="text-text-muted" />
                  <div>
                    <Text size="sm" fw={500}>AI Suggested Focus</Text>
                    <Text size="xs" c="dimmed">Show AI-powered daily focus suggestions</Text>
                  </div>
                </Group>
                <Switch
                  checked={preferences?.showSuggestedFocus ?? true}
                  onChange={(e) => toggleSuggestedFocus.mutate({ visible: e.currentTarget.checked })}
                  disabled={toggleSuggestedFocus.isPending}
                />
              </Group>
            </Paper>

            <Paper
              p="sm"
              withBorder
              className="bg-surface-primary cursor-pointer hover:bg-surface-secondary transition-colors"
              component={Link}
              href="/quotes"
            >
              <Group justify="space-between">
                <Group gap="sm">
                  <IconQuote size={18} className="text-text-muted" />
                  <div>
                    <Text size="sm" fw={500}>Browse All Quotes</Text>
                    <Text size="xs" c="dimmed">View our collection of inspirational quotes</Text>
                  </div>
                </Group>
                <IconChevronRight size={18} className="text-text-muted" />
              </Group>
            </Paper>
          </Stack>
        </Card>
      </Stack>
    </Container>
  );
}
