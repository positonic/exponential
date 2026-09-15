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
import { notifications } from "@mantine/notifications";
import {
  IconH1,
  IconH2,
  IconH3,
  IconList,
  IconListCheck,
  IconListNumbers,
  IconCode,
  IconPhoto,
  IconQuote,
  IconSeparator,
  IconTable,
  IconTypography,
  type TablerIcon,
} from "@tabler/icons-react";
import tippy, { type Instance, type GetReferenceClientRect } from "tippy.js";
import {
  pickImageFile,
  uploadImageFile,
  type UploadImage,
} from "./image-upload";

/**
 * `/` slash-command block menu for the PRD editor (ADR-0024 Tier B). Built on
 * `@tiptap/suggestion`: typing `/` opens a keyboard-navigable list that inserts
 * structural blocks (headings, lists, task lists, code block, quote, table). Hosts can
 * append context-dependent commands (e.g. the Pages editor's "Page" command)
 * via the `extraCommands` option.
 */
export interface SlashCommandItem {
  title: string;
  description: string;
  icon: TablerIcon;
  run: (args: { editor: Editor; range: Range }) => void;
}

const COMMANDS: SlashCommandItem[] = [
  {
    title: "Text",
    description: "Plain paragraph",
    icon: IconTypography,
    run: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setParagraph().run(),
  },
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
  {
    title: "Divider",
    description: "Horizontal rule",
    icon: IconSeparator,
    run: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
  },
  {
    title: "Table",
    description: "Insert a table with a header row",
    icon: IconTable,
    run: ({ editor, range }) =>
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
        .run(),
  },
];

/**
 * The `/image` block: pick a file, push it through the host's uploader, drop
 * the returned URL in as an `image` node. Only offered when the host supplied
 * an uploader — without one the command would have nowhere to put the bytes.
 *
 * The range is deleted up front so the `/image` text doesn't sit in the doc
 * while the file dialog is open. Everything after that is a long await — an OS
 * dialog, then a base64 upload of up to 5MB — and the document stays fully
 * editable throughout, so the insert has to be careful about *where* it lands:
 *
 *  - after the caret's top-level block, never at the caret. `image` is a block
 *    node, and inserting one at an inline position splits whatever the user is
 *    now typing in — a paragraph, or worse, a code block — in half.
 *  - not at all if the editor is gone. The upload succeeded and the blob is
 *    stored either way, so say so rather than dropping it silently.
 *  - without stealing focus, which by now may be in another editor entirely.
 */
function imageCommand(upload: UploadImage): SlashCommandItem {
  return {
    title: "Image",
    description: "Upload an image",
    icon: IconPhoto,
    run: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).run();
      void (async () => {
        const file = await pickImageFile();
        if (!file) return;
        const url = await uploadImageFile(file, upload, {
          reportWrongType: true,
        });
        if (!url) return;
        if (editor.isDestroyed) {
          notifications.show({
            title: "Image not inserted",
            message: "The page was closed before the upload finished.",
            color: "yellow",
          });
          return;
        }
        const { $from } = editor.state.selection;
        // depth 0 is the doc, so depth 1 is the top-level block the caret sits
        // in (or under). `after` is the position just past it.
        const at = $from.depth > 0 ? $from.after(1) : editor.state.doc.content.size;
        editor.chain().insertContentAt(at, { type: "image", attrs: { src: url } }).run();
      })();
    },
  };
}

/**
 * Narrow the block list to what the user has typed after `/`.
 *
 * Substring, not prefix: "list" should reach "Bullet list" and "Task list",
 * and "div" should reach "Divider" — a prefix match makes you know the first
 * word of a block's name before you can find it. Case-insensitive both ways.
 *
 * Two things temper it, because `/` is live inside prose (the suggestion
 * plugin fires after any space) and Enter runs whatever is selected:
 *
 *  - a single character matches prefixes only, so a stray "/1" mid-sentence
 *    can't put "Heading 1" under the Enter key;
 *  - prefix matches sort above substring ones, so "/task" selects "Task list"
 *    rather than whichever block merely contains the word.
 *
 * Exported for its unit test; the extension is the only production caller.
 */
export function filterSlashCommands(
  items: SlashCommandItem[],
  query: string,
): SlashCommandItem[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return items;

  const prefixed = items.filter((item) =>
    item.title.toLowerCase().startsWith(needle),
  );
  if (needle.length < 2) return prefixed;

  const contained = items.filter(
    (item) =>
      !prefixed.includes(item) && item.title.toLowerCase().includes(needle),
  );
  return [...prefixed, ...contained];
}

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
        // Nothing to move through or run, but the menu is still open on
        // "No matches" — swallow navigation rather than modulo by zero.
        if (items.length === 0) {
          return ["ArrowUp", "ArrowDown", "Enter"].includes(event.key);
        }
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
          // Swallow Enter even with nothing to run, so it can't break the
          // line under an open menu that is showing "No matches".
          return true;
        }
        return false;
      },
    }));

    return (
      <Paper
        withBorder
        shadow="md"
        radius="md"
        p={4}
        className="bg-surface-secondary max-h-72 w-72 overflow-y-auto"
      >
        {/* An empty list used to unmount the popup, which read as "the menu
            closed" — indistinguishable from a typo having cancelled it.
            Saying so keeps the `/` mode visible until Escape or a match. */}
        {items.length === 0 ? (
          <Text size="sm" className="text-text-muted px-2 py-1.5">
            No matches
          </Text>
        ) : null}
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

const suggestion: Omit<SuggestionOptions<SlashCommandItem>, "editor" | "items"> = {
  char: "/",
  startOfLine: false,
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

export interface SlashCommandOptions {
  /** Host-injected commands appended after the built-in block commands. */
  extraCommands: SlashCommandItem[];
  /** Enables the `/image` block. Same uploader the paste/drop path uses. */
  uploadImage?: UploadImage;
}

export const SlashCommand = Extension.create<SlashCommandOptions>({
  name: "slashCommand",
  addOptions() {
    return { extraCommands: [] };
  },
  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...suggestion,
        items: ({ query }) => {
          const upload = this.options.uploadImage;
          return filterSlashCommands(
            [
              ...COMMANDS,
              ...(upload ? [imageCommand(upload)] : []),
              ...this.options.extraCommands,
            ],
            query,
          );
        },
      }),
    ];
  },
});
