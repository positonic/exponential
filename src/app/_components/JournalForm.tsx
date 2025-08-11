'use client';

import { Paper/*, Stack*/, Button, Group, Text } from "@mantine/core";
import { useLocalStorage } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { useEditor } from '@tiptap/react';
import { RichTextEditor } from '@mantine/tiptap';
import StarterKit from '@tiptap/starter-kit';
import Highlight from '@tiptap/extension-highlight';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import TextAlign from '@tiptap/extension-text-align';
import Superscript from '@tiptap/extension-superscript';
import SubScript from '@tiptap/extension-subscript';
import '@mantine/tiptap/styles.css';

interface JournalEntry {
  content: string;
  timestamp: string;
}

export function JournalForm() {
  const todayKey = new Date().toISOString().split('T')[0]!;
  
  const [entries, setEntries] = useLocalStorage<Record<string, JournalEntry>>({
    key: 'journal-entries',
    defaultValue: {},
  });

  const todayEntry = entries[todayKey] ?? { content: '', timestamp: new Date().toISOString() };

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-blue-400 underline',
        },
      }),
      Superscript,
      SubScript,
      Highlight,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
    ],
    content: todayEntry.content,
    onUpdate: ({ editor }) => {
      saveEntry(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: 'prose prose-invert max-w-none',
      },
    },
  });

  const saveEntry = (content: string) => {
    const timestamp = new Date().toISOString();
    
    setEntries(prev => ({
      ...prev,
      [todayKey]: {
        content,
        timestamp,
      },
    }));

    notifications.show({
      title: 'Saved',
      message: 'Your journal entry has been saved',
      color: 'green',
    });
  };

  return (
    <Paper shadow="sm" radius="md" className="bg-surface-secondary">
      <RichTextEditor 
        editor={editor}
        styles={{
          root: {
            border: '1px solid var(--color-border-primary)',
            backgroundColor: 'var(--color-bg-primary)',
          },
          toolbar: {
            backgroundColor: 'var(--color-bg-secondary)',
            border: 'none',
            borderBottom: '1px solid var(--color-border-primary)',
          },
          content: {
            backgroundColor: 'var(--color-bg-primary)',
            color: 'var(--color-text-primary)',
            '& .ProseMirror': {
              padding: '16px',
              minHeight: '500px',
            },
          },
        }}
      >
        <RichTextEditor.Toolbar sticky stickyOffset={60}>
          <RichTextEditor.ControlsGroup>
            <RichTextEditor.Bold />
            <RichTextEditor.Italic />
            <RichTextEditor.Underline />
            <RichTextEditor.Strikethrough />
            <RichTextEditor.ClearFormatting />
            <RichTextEditor.Highlight />
            <RichTextEditor.Code />
          </RichTextEditor.ControlsGroup>

          <RichTextEditor.ControlsGroup>
            <RichTextEditor.H1 />
            <RichTextEditor.H2 />
            <RichTextEditor.H3 />
            <RichTextEditor.H4 />
          </RichTextEditor.ControlsGroup>

          <RichTextEditor.ControlsGroup>
            <RichTextEditor.Blockquote />
            <RichTextEditor.Hr />
            <RichTextEditor.BulletList />
            <RichTextEditor.OrderedList />
            <RichTextEditor.Subscript />
            <RichTextEditor.Superscript />
          </RichTextEditor.ControlsGroup>

          <RichTextEditor.ControlsGroup>
            <RichTextEditor.Link />
            <RichTextEditor.Unlink />
          </RichTextEditor.ControlsGroup>

          <RichTextEditor.ControlsGroup>
            <RichTextEditor.AlignLeft />
            <RichTextEditor.AlignCenter />
            <RichTextEditor.AlignJustify />
            <RichTextEditor.AlignRight />
          </RichTextEditor.ControlsGroup>

          <RichTextEditor.ControlsGroup>
            <RichTextEditor.Undo />
            <RichTextEditor.Redo />
          </RichTextEditor.ControlsGroup>
        </RichTextEditor.Toolbar>

        <RichTextEditor.Content />
      </RichTextEditor>

      <Group justify="space-between" className="sticky bottom-0 bg-background-primary p-4 rounded-b-lg shadow-lg">
        <Text size="sm" c="dimmed">
          Last saved: {new Date(todayEntry.timestamp).toLocaleTimeString()}
        </Text>
        <Button onClick={() => editor && saveEntry(editor.getHTML())} size="lg">
          Save Entry
        </Button>
      </Group>
    </Paper>
  );
} 