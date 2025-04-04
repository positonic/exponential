'use client';

import { api } from "~/trpc/react";
import { ContentEditor } from './ContentEditor';

interface TranscriptionContentEditorProps {
  transcriptionId: string;
  initialContent: string;
}

export function TranscriptionContentEditor({ transcriptionId, initialContent }: TranscriptionContentEditorProps) {
  const utils = api.useUtils();
  const updateTranscription = api.transcription.updateTranscription.useMutation();

  const handleSave = async (id: string, content: string) => {
    await updateTranscription.mutateAsync({ id, transcription: content });
    await utils.transcription.getById.invalidate({ id });
  };

  return (
    <ContentEditor
      id={transcriptionId}
      initialContent={initialContent}
      onSave={handleSave}
      label="Transcription"
    />
  );
} 