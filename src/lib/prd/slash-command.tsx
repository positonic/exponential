"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
} from "react";
import { Extension, type Editor, type Range } from "@tiptap/core";
import Suggestion, { type SuggestionOptions } from "@tiptap/suggestion";
import { ReactRenderer } from "@tiptap/react";
import { Paper, Text, UnstyledButton } from "@mantine/core";
import {
  IconH1,
  IconH2,
  IconH3,
  IconList,
  IconListCheck,
  IconListNumbers,
  IconCode,
  IconQuote,
  type TablerIcon,
} from "@tabler/icons-react";
import tippy, { type Instance, type GetReferenceClientRect } from "tippy.js";

/**
 * `/` slash-command block menu for the PRD editor (ADR-0024 Tier B). Built on
 * `@tiptap/suggestion`: typing `/` opens a keyboard-navigable list that inserts
 * structural blocks (headings, lists, task lists, code block, quote).
 */
interface SlashCommandItem {
  title: string;
  description: string;
  icon: TablerIcon;
  run: (args: { editor: Editor; range: Range }) => void;
}

const COMMANDS: SlashCommandItem[] = [
  {
    title: "Heading 1",
    description: "Big section heading",
    icon: IconH1,
    run: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setNode("heading", { level: 1 }).run(),
  },
  {
    title: "Heading 2",
    description: "Medium section heading",
    icon: IconH2,
    run: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setNode("heading", { level: 2 }).run(),
  },
  {
    title: "Heading 3",
    description: "Small section heading",
    icon: IconH3,
    run: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setNode("heading", { level: 3 }).run(),
  },
  {
    title: "Bullet list",
    description: "Unordered list",
    icon: IconList,
    run: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleBulletList().run(),
  },
  {
    title: "Numbered list",
    description: "Ordered list",
    icon: IconListNumbers,
    run: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
  },
  {
    title: "Task list",
    description: "Checklist with checkboxes",
    icon: IconListCheck,
    run: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleTaskList().run(),
  },
  {
    title: "Code block",
    description: "Fenced code with syntax",
    icon: IconCode,
    run: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleCodeBlock().run(),
  },
  {
    title: "Quote",
    description: "Block quote",
    icon: IconQuote,
    run: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleBlockquote().run(),
  },
];

interface SlashCommandListProps {
  items: SlashCommandItem[];
  command: (item: SlashCommandItem) => void;
}

export interface SlashCommandListRef {
  onKeyDown: (args: { event: KeyboardEvent }) => boolean;
}

const SlashCommandList = forwardRef<SlashCommandListRef, SlashCommandListProps>(
  function SlashCommandList({ items, command }, ref) {
    const [selected, setSelected] = useState(0);

    useEffect(() => setSelected(0), [items]);

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }) => {
        if (event.key === "ArrowUp") {
          setSelected((s) => (s + items.length - 1) % items.length);
          return true;
        }
        if (event.key === "ArrowDown") {
          setSelected((s) => (s + 1) % items.length);
          return true;
        }
        if (event.key === "Enter") {
          const item = items[selected];
          if (item) command(item);
          return true;
        }
        return false;
      },
    }));

    if (items.length === 0) return null;

    return (
      <Paper
        withBorder
        shadow="md"
        radius="md"
        p={4}
        className="bg-surface-secondary max-h-72 w-72 overflow-y-auto"
      >
        {items.map((item, index) => {
          const Icon = item.icon;
          return (
            <UnstyledButton
              key={item.title}
              onClick={() => command(item)}
              onMouseEnter={() => setSelected(index)}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left ${
                index === selected ? "bg-surface-hover" : ""
              }`}
            >
              <Icon size={18} className="text-text-muted shrink-0" />
              <div className="min-w-0">
                <Text size="sm" className="text-text-primary">
                  {item.title}
                </Text>
                <Text size="xs" className="text-text-muted truncate">
                  {item.description}
                </Text>
              </div>
            </UnstyledButton>
          );
        })}
      </Paper>
    );
  },
);

const suggestion: Omit<SuggestionOptions<SlashCommandItem>, "editor"> = {
  char: "/",
  startOfLine: false,
  items: ({ query }) =>
    COMMANDS.filter((item) =>
      item.title.toLowerCase().startsWith(query.toLowerCase()),
    ),
  command: ({ editor, range, props }) => props.run({ editor, range }),
  render: () => {
    let component: ReactRenderer<SlashCommandListRef, SlashCommandListProps>;
    let popup: Instance[];

    return {
      onStart: (props) => {
        component = new ReactRenderer(SlashCommandList, {
          props: {
            items: props.items,
            command: (item: SlashCommandItem) => props.command(item),
          },
          editor: props.editor,
        });
        if (!props.clientRect) return;
        popup = tippy("body", {
          getReferenceClientRect:
            props.clientRect as unknown as GetReferenceClientRect,
          appendTo: () => document.body,
          content: component.element,
          showOnCreate: true,
          interactive: true,
          trigger: "manual",
          placement: "bottom-start",
        });
      },
      onUpdate: (props) => {
        component.updateProps({
          items: props.items,
          command: (item: SlashCommandItem) => props.command(item),
        });
        if (props.clientRect) {
          popup?.[0]?.setProps({
            getReferenceClientRect:
              props.clientRect as unknown as GetReferenceClientRect,
          });
        }
      },
      onKeyDown: (props) => {
        if (props.event.key === "Escape") {
          popup?.[0]?.hide();
          return true;
        }
        return component.ref?.onKeyDown({ event: props.event }) ?? false;
      },
      onExit: () => {
        popup?.[0]?.destroy();
        component?.destroy();
      },
    };
  },
};

export const SlashCommand = Extension.create({
  name: "slashCommand",
  addProseMirrorPlugins() {
    return [Suggestion({ editor: this.editor, ...suggestion })];
  },
});
