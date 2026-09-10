"use client";

import { Menu, UnstyledButton } from "@mantine/core";
import { IconCheck, IconChevronDown } from "@tabler/icons-react";
import type { Editor } from "@tiptap/core";

/** The block types the bubble menu can turn a selection into, in the order a
 * document tends to use them. `isActive` and `apply` are the only things that
 * differ between them, so each row is data rather than a component. */
const BLOCK_TYPES: {
  label: string;
  isActive: (editor: Editor) => boolean;
  apply: (editor: Editor) => void;
}[] = [
  {
    label: "Text",
    isActive: (e) => e.isActive("paragraph"),
    apply: (e) => e.chain().focus().setParagraph().run(),
  },
  {
    label: "Heading 1",
    isActive: (e) => e.isActive("heading", { level: 1 }),
    apply: (e) => e.chain().focus().setNode("heading", { level: 1 }).run(),
  },
  {
    label: "Heading 2",
    isActive: (e) => e.isActive("heading", { level: 2 }),
    apply: (e) => e.chain().focus().setNode("heading", { level: 2 }).run(),
  },
  {
    label: "Heading 3",
    isActive: (e) => e.isActive("heading", { level: 3 }),
    apply: (e) => e.chain().focus().setNode("heading", { level: 3 }).run(),
  },
  {
    label: "Quote",
    isActive: (e) => e.isActive("blockquote"),
    apply: (e) => e.chain().focus().toggleBlockquote().run(),
  },
  {
    label: "Code block",
    isActive: (e) => e.isActive("codeBlock"),
    apply: (e) => e.chain().focus().toggleCodeBlock().run(),
  },
];

/**
 * The bubble menu's block-type control: one dropdown naming what the selection
 * *is*, in place of three unlabelled H1/H2/H3 buttons.
 *
 * The buttons could only set a heading — there was no way back to a paragraph,
 * and quote and code block were reachable only through the `/` menu — and
 * being icons, they never said which one was already applied.
 */
export function BlockTypeMenu({ editor }: { editor: Editor }) {
  const current = BLOCK_TYPES.find((b) => b.isActive(editor)) ?? BLOCK_TYPES[0]!;

  return (
    <Menu position="bottom-start" shadow="md" width={180} withinPortal>
      <Menu.Target>
        <UnstyledButton
          aria-label="Block type"
          className="flex items-center gap-1 whitespace-nowrap px-2 py-1 text-sm text-text-primary hover:bg-surface-hover"
        >
          {current.label}
          <IconChevronDown size={14} className="text-text-muted" />
        </UnstyledButton>
      </Menu.Target>
      <Menu.Dropdown>
        {BLOCK_TYPES.map((block) => {
          const active = block.label === current.label;
          return (
            <Menu.Item
              key={block.label}
              onClick={() => block.apply(editor)}
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
