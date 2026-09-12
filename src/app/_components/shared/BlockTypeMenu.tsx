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
 * thing whatever the selection was. "Text" is the way out of any of the
 * others, so it clears the surrounding node first.
 *
 * Idempotence is enforced by the menu, not by the commands: `setBlockquote`
 * over a *selection* inside a quote wraps it in a second one, so choosing the
 * current row is short-circuited rather than trusted to be harmless.
 */
export const BLOCK_TYPES: {
  label: BlockTypeLabel;
  apply: (editor: Editor) => void;
}[] = [
  {
    label: "Text",
    // clearNodes lifts out of a blockquote/list wrapper as well as unsetting
    // the node type; setParagraph alone would leave the quote around it.
    apply: (e) => e.chain().focus().clearNodes().setParagraph().run(),
  },
  {
    label: "Heading 1",
    apply: (e) => e.chain().focus().setNode("heading", { level: 1 }).run(),
  },
  {
    label: "Heading 2",
    apply: (e) => e.chain().focus().setNode("heading", { level: 2 }).run(),
  },
  {
    label: "Heading 3",
    apply: (e) => e.chain().focus().setNode("heading", { level: 3 }).run(),
  },
  { label: "Quote", apply: (e) => e.chain().focus().setBlockquote().run() },
  { label: "Code block", apply: (e) => e.chain().focus().setCodeBlock().run() },
];

/**
 * Which block type the selection *is*.
 *
 * Specificity order, which is not the menu's display order: a paragraph inside
 * a blockquote makes both `paragraph` and `blockquote` active, and the answer
 * a reader wants is "Quote". Reading the display order instead would label a
 * quote "Text" — and then the Quote row, if it toggled, would delete the quote
 * the label said wasn't there.
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
 * *is*, in place of three unlabelled H1/H2/H3 buttons.
 *
 * The buttons could only set a heading — there was no way back to a paragraph,
 * and quote and code block were reachable only through the `/` menu — and
 * being icons, they never said which one was already applied.
 */
export function BlockTypeMenu({ editor }: { editor: Editor }) {
  const current = resolveBlockType(editor);

  return (
    <Menu position="bottom-start" shadow="md" width={180} withinPortal>
      <Menu.Target>
        <UnstyledButton
          aria-label="Block type"
          className="flex items-center gap-1 whitespace-nowrap px-2 py-1 text-sm text-text-primary hover:bg-surface-hover"
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
              // Radio semantics: picking what is already picked changes
              // nothing. See BLOCK_TYPES on why this is the menu's job.
              onClick={() => {
                if (!active) block.apply(editor);
              }}
              // Mantine hardcodes role="menuitem", so the "one of these is the
              // current one" relationship is carried by aria-current and a
              // check, not by radio semantics.
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
