'use client';

import { Textarea, Button, Group } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useState } from 'react';

interface ContentEditorProps {
  id: string;
  initialContent: string;
  onSave: (id: string, content: string) => Promise<void>;
  label?: string;
}

export function ContentEditor({ id, initialContent, onSave, label = 'Content' }: ContentEditorProps) {
  const [content, setContent] = useState(initialContent);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    try {
      setIsSaving(true);
      await onSave(id, content);
      notifications.show({
        title: 'Success',
        message: `${label} updated successfully`,
        color: 'green'
      });
      setIsEditing(false);
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: error instanceof Error ? error.message : 'Failed to update content',
        color: 'red'
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (!isEditing) {
    return (
      <div>
        <Group justify="space-between" mb="md">
          <Button 
            onClick={() => setIsEditing(true)}
            variant="light"
            size="sm"
          >
            Edit {label}
          </Button>
        </Group>
        <pre className="whitespace-pre-wrap">{content}</pre>
      </div>
    );
  }

  return (
    <div>
      <Textarea
        value={content}
        onChange={(e) => setContent(e.currentTarget.value)}
        minRows={10}
        autosize
        mb="md"
      />
      <Group justify="flex-end" gap="sm">
        <Button 
          variant="light" 
          color="red"
          onClick={() => {
            setContent(initialContent);
            setIsEditing(false);
          }}
        >
          Cancel
        </Button>
        <Button
          onClick={() => void handleSave()}
          loading={isSaving}
        >
          Save Changes
        </Button>
      </Group>
    </div>
  );
} 