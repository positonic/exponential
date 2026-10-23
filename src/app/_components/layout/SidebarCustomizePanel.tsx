"use client";

import React, { useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button, Menu, TextInput } from "@mantine/core";
import {
  IconEye,
  IconEyeOff,
  IconGripVertical,
  IconLink,
  IconPlus,
  IconTrash,
  type Icon,
} from "@tabler/icons-react";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { useWorkspaceNavLayout } from "~/hooks/useWorkspaceNavLayout";
import {
  DEFAULT_NAV_LAYOUT,
  NAV_ITEM_CONFIG,
  SHORTCUTS_SECTION_ID,
  addSection,
  addShortcut,
  isCustomNavItem,
  isSafeShortcutHref,
  removeNavItem,
  removeSection,
  shortcutCandidates,
  type NavItem,
  type NavSection,
} from "~/lib/navLayout";
import { ITEM_ICONS } from "./NavLinks";

// --- Drag ids ---------------------------------------------------------------

type DragInfo =
  | { type: "section"; sectionId: string; itemId: null }
  | { type: "item"; sectionId: string; itemId: string };

const secId = (id: string) => `sec:${id}`;
const itmId = (sectionId: string, itemId: string) => `itm:${sectionId}:${itemId}`;

function parseDragId(id: string): DragInfo | null {
  if (id.startsWith("sec:")) return { type: "section", sectionId: id.slice(4), itemId: null };
  if (id.startsWith("itm:")) {
    const [sectionId = "", itemId = ""] = id.slice(4).split(":");
    return { type: "item", sectionId, itemId };
  }
  return null;
}

function itemLabel(item: NavItem): string {
  if (isCustomNavItem(item)) return item.label ?? item.href;
  return NAV_ITEM_CONFIG[item.id]?.label ?? item.id;
}

function itemIcon(item: NavItem): Icon {
  return isCustomNavItem(item) ? IconLink : (ITEM_ICONS[item.id] ?? IconLink);
}

// --- Rows -------------------------------------------------------------------

function Grip(props: React.HTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className="sb-cz-grip" aria-label="Drag to reorder" {...props}>
      <IconGripVertical size={14} />
    </button>
  );
}

interface ItemRowProps {
  sectionId: string;
  item: NavItem;
  onToggle: () => void;
  onRemove: () => void;
}

function SortableItemRow({ sectionId, item, onToggle, onRemove }: ItemRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: itmId(sectionId, item.id),
  });
  const Glyph = itemIcon(item);
  const custom = isCustomNavItem(item);
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`sb-cz-row ${item.hidden ? "sb-cz-row--hidden" : ""} ${isDragging ? "sb-cz-row--dragging" : ""}`}
    >
      <Grip {...attributes} {...listeners} />
      <span className="sb-cz-row__icon"><Glyph size={15} /></span>
      <span className="sb-cz-row__label">{itemLabel(item)}</span>
      {custom ? (
        <button type="button" className="sb-cz-action" onClick={onRemove} aria-label={`Remove ${itemLabel(item)}`}>
          <IconTrash size={14} />
        </button>
      ) : (
        <button
          type="button"
          className="sb-cz-action"
          onClick={onToggle}
          aria-label={`${item.hidden ? "Show" : "Hide"} ${itemLabel(item)}`}
          aria-pressed={!item.hidden}
        >
          {item.hidden ? <IconEyeOff size={14} /> : <IconEye size={14} />}
        </button>
      )}
    </div>
  );
}

interface SectionBlockProps {
  section: NavSection;
  onToggle: () => void;
  onRename: (name: string) => void;
  onRemove: () => void;
  onToggleItem: (itemId: string) => void;
  onRemoveItem: (itemId: string) => void;
}

function SortableSectionBlock({ section, onToggle, onRename, onRemove, onToggleItem, onRemoveItem }: SectionBlockProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: secId(section.id),
  });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(section.name);
  const isDefault = DEFAULT_NAV_LAYOUT.some((d) => d.id === section.id);

  const commit = () => {
    setEditing(false);
    const name = draft.trim();
    if (name && name !== section.name) onRename(name);
    else setDraft(section.name);
  };

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`sb-cz-section ${isDragging ? "sb-cz-row--dragging" : ""}`}
    >
      <div className={`sb-cz-row sb-cz-row--section ${section.hidden ? "sb-cz-row--hidden" : ""}`}>
        <Grip {...attributes} {...listeners} />
        {editing ? (
          <input
            className="sb-cz-rename"
            value={draft}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") { setDraft(section.name); setEditing(false); }
            }}
            aria-label="Section name"
          />
        ) : (
          <button type="button" className="sb-cz-row__label sb-cz-row__label--section" onClick={() => setEditing(true)} title="Rename section">
            {section.name}
          </button>
        )}
        {isDefault ? (
          <button
            type="button"
            className="sb-cz-action"
            onClick={onToggle}
            aria-label={`${section.hidden ? "Show" : "Hide"} ${section.name}`}
            aria-pressed={!section.hidden}
          >
            {section.hidden ? <IconEyeOff size={14} /> : <IconEye size={14} />}
          </button>
        ) : (
          <button type="button" className="sb-cz-action" onClick={onRemove} aria-label={`Remove ${section.name}`}>
            <IconTrash size={14} />
          </button>
        )}
      </div>
      <SortableContext items={section.items.map((i) => itmId(section.id, i.id))} strategy={verticalListSortingStrategy}>
        <div className="sb-cz-items">
          {section.items.map((item) => (
            <SortableItemRow
              key={item.id}
              sectionId={section.id}
              item={item}
              onToggle={() => onToggleItem(item.id)}
              onRemove={() => onRemoveItem(item.id)}
            />
          ))}
          {section.items.length === 0 && <div className="sb-cz-empty">Drag items here</div>}
        </div>
      </SortableContext>
    </div>
  );
}

// --- Panel ------------------------------------------------------------------

interface SidebarCustomizePanelProps {
  onDone: () => void;
}

/**
 * Notion-style in-place sidebar editor (ADR-0073). Replaces the nav while
 * open: pinned shortcuts at the top, then each section with its items, all
 * sortable by their grip, with show/hide for built-ins, remove for custom
 * entries, "Add shortcut", "Add section", and a Done button. Every edit saves
 * the current workspace's layout immediately.
 */
export function SidebarCustomizePanel({ onDone }: SidebarCustomizePanelProps): React.ReactElement {
  const { workspaceId } = useWorkspace();
  const { layout, isCustomised, isLoading, saveLayout, resetLayout, saveError } =
    useWorkspaceNavLayout(workspaceId);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [linkForm, setLinkForm] = useState<{ label: string; href: string } | null>(null);
  const [sectionDraft, setSectionDraft] = useState<string | null>(null);

  const shortcuts = layout.find((s) => s.id === SHORTCUTS_SECTION_ID);
  const candidates = shortcutCandidates(layout);

  // --- edits ---
  const commit = (next: NavSection[]) => saveLayout(next);
  const mapSection = (sectionId: string, fn: (s: NavSection) => NavSection) =>
    commit(layout.map((s) => (s.id === sectionId ? fn(s) : s)));

  const toggleSection = (id: string) => mapSection(id, (s) => ({ ...s, hidden: !s.hidden }));
  const renameSection = (id: string, name: string) => mapSection(id, (s) => ({ ...s, name }));
  const toggleItem = (sectionId: string, itemId: string) =>
    mapSection(sectionId, (s) => ({
      ...s,
      items: s.items.map((i) => (i.id === itemId ? { ...i, hidden: !i.hidden } : i)),
    }));

  const submitLink = () => {
    if (!linkForm) return;
    const label = linkForm.label.trim();
    const href = linkForm.href.trim();
    if (!label || !isSafeShortcutHref(href)) return;
    commit(addShortcut(layout, { label, href }));
    setLinkForm(null);
  };

  const submitSection = () => {
    if (sectionDraft === null) return;
    if (sectionDraft.trim()) commit(addSection(layout, sectionDraft));
    setSectionDraft(null);
  };

  // --- drag and drop (same semantics as the settings page editor) ---
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Drags mutate a local working copy so cross-section moves preview live;
  // the result is saved once on drop.
  const [working, setWorking] = useState<NavSection[] | null>(null);
  const view = working ?? layout;

  const handleDragStart = (e: DragStartEvent) => {
    setActiveId(String(e.active.id));
    setWorking(layout);
  };

  const handleDragOver = (e: DragOverEvent) => {
    const { active, over } = e;
    if (!over) return;
    const a = parseDragId(String(active.id));
    const o = parseDragId(String(over.id));
    if (!a || !o || a.type !== "item") return;
    setWorking((prev) => {
      const base = prev ?? layout;
      const source = base.find((s) => s.items.some((i) => i.id === a.itemId));
      const target = base.find((s) => s.id === o.sectionId);
      if (!source || !target || source.id === target.id) return base;
      const item = source.items.find((i) => i.id === a.itemId);
      if (!item) return base;
      const overIdx = o.type === "item" ? target.items.findIndex((i) => i.id === o.itemId) : target.items.length;
      const insertAt = overIdx === -1 ? target.items.length : overIdx;
      return base.map((s) => {
        if (s.id === source.id) return { ...s, items: s.items.filter((i) => i.id !== a.itemId) };
        if (s.id === target.id) {
          const items = [...s.items];
          items.splice(insertAt, 0, item);
          return { ...s, items };
        }
        return s;
      });
    });
  };

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    setActiveId(null);
    const base = working ?? layout;
    setWorking(null);
    if (!over) return;
    const a = parseDragId(String(active.id));
    const o = parseDragId(String(over.id));
    if (!a || !o) return;

    let next = base;
    if (a.type === "section") {
      if (o.sectionId === SHORTCUTS_SECTION_ID) return;
      const oldIdx = base.findIndex((s) => s.id === a.sectionId);
      const newIdx = base.findIndex((s) => s.id === o.sectionId);
      if (oldIdx !== -1 && newIdx !== -1) next = arrayMove(base, oldIdx, newIdx);
    } else {
      const current = base.find((s) => s.items.some((i) => i.id === a.itemId));
      if (current && o.sectionId === current.id && o.type === "item") {
        next = base.map((s) => {
          if (s.id !== current.id) return s;
          const oldIdx = s.items.findIndex((i) => i.id === a.itemId);
          const newIdx = s.items.findIndex((i) => i.id === o.itemId);
          if (oldIdx === -1 || newIdx === -1) return s;
          return { ...s, items: arrayMove(s.items, oldIdx, newIdx) };
        });
      }
    }
    if (next !== layout) commit(next);
  };

  const activeInfo = activeId ? parseDragId(activeId) : null;
  const overlayLabel = activeInfo
    ? activeInfo.type === "section"
      ? (view.find((s) => s.id === activeInfo.sectionId)?.name ?? "")
      : itemLabel(view.flatMap((s) => s.items).find((i) => i.id === activeInfo.itemId) ?? { id: activeInfo.itemId, hidden: false })
    : "";

  const viewShortcuts = view.find((s) => s.id === SHORTCUTS_SECTION_ID) ?? shortcuts;
  const viewSections = view.filter((s) => s.id !== SHORTCUTS_SECTION_ID);

  if (isLoading) {
    return (
      <div className="sb-cz" data-testid="sidebar-customize-panel">
        <div className="sb-cz-empty">Loading your layout…</div>
        <div className="sb-cz-footer">
          <Button fullWidth size="sm" variant="default" onClick={onDone}>Cancel</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="sb-cz" data-testid="sidebar-customize-panel">
      <div className="sb-cz-scroll">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={() => { setActiveId(null); setWorking(null); }}
      >
        {/* Shortcuts */}
        <SortableContext
          items={(viewShortcuts?.items ?? []).map((i) => itmId(SHORTCUTS_SECTION_ID, i.id))}
          strategy={verticalListSortingStrategy}
        >
          <div className="sb-cz-items sb-cz-items--top">
            {(viewShortcuts?.items ?? []).map((item) => (
              <SortableItemRow
                key={item.id}
                sectionId={SHORTCUTS_SECTION_ID}
                item={item}
                onToggle={() => toggleItem(SHORTCUTS_SECTION_ID, item.id)}
                onRemove={() => commit(removeNavItem(layout, item.id))}
              />
            ))}
          </div>
        </SortableContext>

        {linkForm ? (
          <form
            className="sb-cz-form"
            onSubmit={(e) => { e.preventDefault(); submitLink(); }}
          >
            <TextInput
              size="xs"
              placeholder="Label"
              value={linkForm.label}
              autoFocus
              onChange={(e) => setLinkForm({ ...linkForm, label: e.currentTarget.value })}
              aria-label="Shortcut label"
            />
            <TextInput
              size="xs"
              placeholder="/w/… or https://…"
              value={linkForm.href}
              onChange={(e) => setLinkForm({ ...linkForm, href: e.currentTarget.value })}
              error={linkForm.href.trim() !== "" && !isSafeShortcutHref(linkForm.href) ? "Use a /path or an https:// URL" : undefined}
              aria-label="Shortcut URL"
            />
            <div className="sb-cz-form__actions">
              <Button size="compact-xs" variant="subtle" color="gray" onClick={() => setLinkForm(null)}>Cancel</Button>
              <Button size="compact-xs" type="submit" disabled={!linkForm.label.trim() || !isSafeShortcutHref(linkForm.href)}>Add</Button>
            </div>
          </form>
        ) : (
          <Menu shadow="md" width={200} position="bottom-start" withinPortal>
            <Menu.Target>
              <button type="button" className="sb-cz-add">
                <IconPlus size={14} /> Add shortcut
              </button>
            </Menu.Target>
            <Menu.Dropdown>
              {candidates.map((id) => {
                const Glyph = ITEM_ICONS[id] ?? IconLink;
                return (
                  <Menu.Item key={id} leftSection={<Glyph size={14} />} onClick={() => commit(addShortcut(layout, { itemId: id }))}>
                    {NAV_ITEM_CONFIG[id]?.label ?? id}
                  </Menu.Item>
                );
              })}
              {candidates.length > 0 && <Menu.Divider />}
              <Menu.Item leftSection={<IconLink size={14} />} onClick={() => setLinkForm({ label: "", href: "" })}>
                Custom link…
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        )}

        <div className="sb-divider" />

        {/* Sections */}
        <SortableContext items={viewSections.map((s) => secId(s.id))} strategy={verticalListSortingStrategy}>
          <div className="sb-cz-sections">
            {viewSections.map((section) => (
              <SortableSectionBlock
                key={section.id}
                section={section}
                onToggle={() => toggleSection(section.id)}
                onRename={(name) => renameSection(section.id, name)}
                onRemove={() => commit(removeSection(layout, section.id))}
                onToggleItem={(itemId) => toggleItem(section.id, itemId)}
                onRemoveItem={(itemId) => commit(removeNavItem(layout, itemId))}
              />
            ))}
          </div>
        </SortableContext>

        {sectionDraft !== null ? (
          <form className="sb-cz-form" onSubmit={(e) => { e.preventDefault(); submitSection(); }}>
            <TextInput
              size="xs"
              placeholder="Section name"
              value={sectionDraft}
              autoFocus
              onChange={(e) => setSectionDraft(e.currentTarget.value)}
              onKeyDown={(e) => { if (e.key === "Escape") setSectionDraft(null); }}
              aria-label="Section name"
            />
            <div className="sb-cz-form__actions">
              <Button size="compact-xs" variant="subtle" color="gray" onClick={() => setSectionDraft(null)}>Cancel</Button>
              <Button size="compact-xs" type="submit" disabled={!sectionDraft.trim()}>Add</Button>
            </div>
          </form>
        ) : (
          <button type="button" className="sb-cz-add" onClick={() => setSectionDraft("")}>
            <IconPlus size={14} /> Add section
          </button>
        )}

        <DragOverlay>
          {activeInfo && (
            <div className={`sb-cz-row sb-cz-row--overlay ${activeInfo.type === "section" ? "sb-cz-row--section" : ""}`}>
              <span className="sb-cz-grip"><IconGripVertical size={14} /></span>
              <span className="sb-cz-row__label">{overlayLabel}</span>
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {saveError && (
        <div className="sb-cz-error" role="alert">
          Your last change could not be saved. It will be retried on your next edit.
        </div>
      )}
      </div>

      <div className="sb-cz-footer">
        <Button fullWidth size="sm" onClick={onDone}>Done</Button>
        {isCustomised && (
          <button type="button" className="sb-cz-reset" onClick={resetLayout}>
            Reset this workspace to my default layout
          </button>
        )}
      </div>
    </div>
  );
}
