"use client";

import { Menu, UnstyledButton } from "@mantine/core";
import { IconCheck, IconChevronDown } from "@tabler/icons-react";
import type { Editor } from "@tiptap/core";

export type BlockTypeLabel =
  | "Text"
  | "Heading 1"
  | "Heading 2"
  | "Heading 3"
  | "Quote"
  | "Code block";

/**
 * The block types the bubble menu can turn a selection into, in the order the
 * menu lists them.
 *
 * Every `apply` is a *set*, never a toggle, so choosing a row means the same
 * thing whatever the selection was. "Text" and the headings clear the
 * surrounding quote or list first, so the trigger names what was chosen
 * afterwards (a heading left inside a quote would still read "Quote").
 *
 * Idempotence is the menu's job, not the commands': `setBlockquote` over a
 * selection inside a quote wraps it in a second one, so a row whose structure
 * the selection already has is skipped rather than trusted to be harmless.
 * That test is `isCurrent`, the structure itself, not the trigger's label:
 * "Text" is also the label's fallback (a list item, a mixed selection), and
 * those still need Text's `clearNodes()`.
 */
const WRAPPERS = ["bulletList", "orderedList", "taskList", "blockquote"] as const;
const inWrapper = (e: Editor) => WRAPPERS.some((wrapper) => e.isActive(wrapper));

export const BLOCK_TYPES: {
  label: BlockTypeLabel;
  /** The selection already is exactly this, so applying it would change nothing (or nest). */
  isCurrent: (editor: Editor) => boolean;
  apply: (editor: Editor) => void;
}[] = [
  {
    label: "Text",
    isCurrent: (e) =>
      e.isActive("paragraph") && !inWrapper(e) && !e.isActive("heading") && !e.isActive("codeBlock"),
    apply: (e) => e.chain().focus().clearNodes().setParagraph().run(),
  },
  ...([1, 2, 3] as const).map((level) => ({
    label: `Heading ${level}` as BlockTypeLabel,
    isCurrent: (e: Editor) => e.isActive("heading", { level }) && !inWrapper(e),
    apply: (e: Editor) =>
      e.chain().focus().clearNodes().setNode("heading", { level }).run(),
  })),
  {
    label: "Quote",
    isCurrent: (e) => e.isActive("blockquote"),
    apply: (e) => e.chain().focus().setBlockquote().run(),
  },
  {
    label: "Code block",
    isCurrent: (e) => e.isActive("codeBlock"),
    apply: (e) => e.chain().focus().setCodeBlock().run(),
  },
];

/** What choosing a row does: apply it unless the selection already is exactly that. */
export function chooseBlockType(editor: Editor, block: (typeof BLOCK_TYPES)[number]): void {
  if (!block.isCurrent(editor)) block.apply(editor);
}

/**
 * Which block type the selection *is*.
 *
 * Specificity order, not the menu's display order: a paragraph inside a
 * blockquote makes both `paragraph` and `blockquote` active, and the answer a
 * reader wants is "Quote". Reading the display order instead would label a
 * quote "Text".
 *
 * Exported for its unit test.
 */
export function resolveBlockType(editor: Editor): BlockTypeLabel {
  if (editor.isActive("codeBlock")) return "Code block";
  if (editor.isActive("blockquote")) return "Quote";
  if (editor.isActive("heading", { level: 1 })) return "Heading 1";
  if (editor.isActive("heading", { level: 2 })) return "Heading 2";
  if (editor.isActive("heading", { level: 3 })) return "Heading 3";
  return "Text";
}

/**
 * The bubble menu's block-type control: one dropdown naming what the selection
 * is, in place of the three H1/H2/H3 icon buttons. Those could only set a
 * heading (never take one back to a paragraph), never said which was applied,
 * and left Quote and Code block reachable only through `/`.
 */
export function BlockTypeMenu({ editor }: { editor: Editor }) {
  const current = resolveBlockType(editor);

  return (
    <Menu position="bottom-start" shadow="md" width={180} withinPortal>
      <Menu.Target>
        <UnstyledButton
          aria-label="Block type"
          className="flex items-center gap-1 whitespace-nowrap rounded-sm px-2 text-sm text-text-primary hover:bg-surface-hover"
        >
          {current}
          <IconChevronDown size={14} className="text-text-muted" />
        </UnstyledButton>
      </Menu.Target>
      <Menu.Dropdown>
        {BLOCK_TYPES.map((block) => {
          const active = block.label === current;
          return (
            <Menu.Item
              key={block.label}
              // Radio semantics: picking what the selection already is
              // changes nothing. See BLOCK_TYPES on why this is the menu's job
              // and why it asks the structure, not the label.
              onClick={() => chooseBlockType(editor, block)}
              // Mantine hardcodes role="menuitem", so "this one is current" is
              // carried by aria-current and a check, not radio semantics.
              aria-current={active ? "true" : undefined}
              rightSection={active ? <IconCheck size={14} /> : null}
            >
              {block.label}
            </Menu.Item>
          );
        })}
      </Menu.Dropdown>
    </Menu>
  );
}
