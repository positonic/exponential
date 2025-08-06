'use client';

import React, { forwardRef } from 'react';
import { Box } from '@mantine/core';
import { RichTextEditor } from '@mantine/tiptap';
import { useEditor } from '@tiptap/react';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { isValidUrl } from '~/utils/url';

interface RichTextInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  variant?: string;
  size?: string;
  styles?: Record<string, any>;
}

// Helper function to strip paragraph tags
const stripParagraphTags = (html: string) => {
  return html
    .replace(/^<p>/, '') // Remove opening <p> tag
    .replace(/<\/p>$/, '') // Remove closing </p> tag
    .replace(/<p>/g, ' ') // Replace other opening <p> tags with space
    .replace(/<\/p>/g, ' '); // Replace other closing </p> tags with space
};

export const RichTextInput = forwardRef<HTMLDivElement, RichTextInputProps>(
  ({ value, onChange, placeholder, styles }, ref) => {
    const editor = useEditor({
      extensions: [
        Document,
        Paragraph,
        Text,
        Link.configure({
          openOnClick: true,
          HTMLAttributes: {
            class: 'text-blue-500 underline cursor-pointer',
          },
        }),
        Placeholder.configure({
          placeholder: placeholder ?? '',
        }),
      ],
      content: value,
      immediatelyRender: false,
      onUpdate: ({ editor }) => {
        // Strip paragraph tags before saving
        const html = stripParagraphTags(editor.getHTML());
        onChange(html);
      },
      editorProps: {
        handlePaste: (view, event: ClipboardEvent) => {
          const pastedText = event.clipboardData?.getData('text');
          if (!pastedText || !isValidUrl(pastedText)) {
            return false; // Let Tiptap handle normal paste
          }

          const { from, to } = view.state.selection;
          const selectedText = view.state.doc.textBetween(from, to);

          if (selectedText) {
            // If text is selected, wrap it in a link
            editor?.chain()
              .focus()
              .setLink({ href: pastedText })
              .run();
          } else {
            // If no text is selected, insert the URL as plain text
            editor?.chain()
              .focus()
              .insertContent(pastedText)
              .setLink({ href: pastedText })
              .run();
          }

          return true; // Prevent default paste
        },
      },
    });

    return (
      <Box
        ref={ref}
        style={{
          position: 'relative',
          ...styles?.wrapper,
        }}
      >
        <RichTextEditor 
          editor={editor}
          styles={{
            root: {
              border: 'none',
              backgroundColor: 'transparent',
            },
            content: {
              backgroundColor: 'transparent',
              fontSize: '24px',
              color: '#C1C2C5',
              padding: 0,
              '& p': {
                margin: 0,
              },
              '&:focus': {
                outline: 'none',
                ring: 'none',
                border: 'none',
              },
              ...styles?.input,
            },
          }}
        >
          <RichTextEditor.Content />
        </RichTextEditor>
      </Box>
    );
  }
);

RichTextInput.displayName = 'RichTextInput'; 