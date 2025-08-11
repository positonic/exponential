'use client';

import { Paper, Title, Text, Stack, Group, Button } from "@mantine/core";
import { IconWriting } from "@tabler/icons-react";
import { memo } from 'react';
import { RichTextEditor, Link } from '@mantine/tiptap';
import { useEditor } from '@tiptap/react';
import Highlight from '@tiptap/extension-highlight';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Superscript from '@tiptap/extension-superscript';
import SubScript from '@tiptap/extension-subscript';
import { useEffect } from 'react';

interface JournalSectionProps {
  journalContent: string;
  setJournalContent: (content: string) => void;
  saveJournal: () => void;
  isSaving: boolean;
  isDisabled: boolean;
}

const SaveButton = memo(({ 
  onClick, 
  loading, 
  disabled
}: { 
  onClick: () => void; 
  loading: boolean; 
  disabled: boolean;
}) => (
  <Button 
    onClick={onClick} 
    loading={loading} 
    disabled={disabled}
  >
    Save Journal
  </Button>
));

SaveButton.displayName = 'SaveButton';

export const JournalSection = memo(({
  journalContent,
  setJournalContent,
  saveJournal,
  isSaving,
  isDisabled
}: JournalSectionProps) => {
  
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Link,
      Superscript,
      SubScript,
      Highlight,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
    ],
    content: journalContent,
    onUpdate: ({ editor }) => {
      setJournalContent(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: 'min-h-[300px] prose prose-invert max-w-none',
      },
    },
    immediatelyRender: false,
  }, []);

  useEffect(() => {
    if (editor && editor.getHTML() !== journalContent && journalContent) {
      editor.commands.setContent(journalContent);
    }
  }, [journalContent, editor]);
  
  return (
    <Paper shadow="sm" p="md" radius="md" className="bg-surface-primary">
      <Stack gap="md">
        <Group>
          <IconWriting className="text-green-500" size={24} />
          <Title order={2} className="text-2xl">
            Journal
          </Title>
        </Group>
        <Text c="dimmed">
          Paper is more patient than people. Put your thoughts to the test.
        </Text>
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
                minHeight: '300px',
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
        <SaveButton 
          onClick={saveJournal} 
          loading={isSaving}
          disabled={!journalContent.trim() || isDisabled}
        />
      </Stack>
    </Paper>
  );
});

JournalSection.displayName = 'JournalSection'; 