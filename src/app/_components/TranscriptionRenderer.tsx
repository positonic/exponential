"use client";

import { Text, Stack, Group, Badge } from "@mantine/core";

interface FirefliesSentence {
  text: string;
  speaker_name: string;
  start_time: number;
  end_time: number;
}

interface FirefliesTranscription {
  title?: string;
  sentences: FirefliesSentence[];
}

interface TranscriptionRendererProps {
  transcription: string | null;
  provider?: string;
  isPreview?: boolean;
  maxLines?: number;
}

export function TranscriptionRenderer({ 
  transcription, 
  provider, 
  isPreview = false, 
  maxLines = 3 
}: TranscriptionRendererProps) {
  if (!transcription) {
    return (
      <Text size="sm" c="dimmed" ta="center" py="md">
        No transcription available
      </Text>
    );
  }

  // Handle Fireflies structured transcription
  if (provider === "fireflies") {
    try {
      const parsed: FirefliesTranscription = JSON.parse(transcription);
      
      if (parsed.sentences && Array.isArray(parsed.sentences)) {
        if (isPreview) {
          // Show first few sentences for preview
          const previewSentences = parsed.sentences.slice(0, maxLines);
          return (
            <Stack gap="xs">
              {previewSentences.map((sentence, idx) => (
                <Group key={idx} gap="xs" wrap="nowrap">
                  <Badge size="xs" variant="light" color="blue">
                    {sentence.speaker_name}
                  </Badge>
                  <Text size="sm" c="dimmed" lineClamp={1}>
                    {sentence.text}
                  </Text>
                </Group>
              ))}
              {parsed.sentences.length > maxLines && (
                <Text size="xs" c="dimmed" fs="italic">
                  +{parsed.sentences.length - maxLines} more messages...
                </Text>
              )}
            </Stack>
          );
        } else {
          // Show full conversation
          return (
            <Stack gap="sm">
              {parsed.title && (
                <Text fw={500} size="sm" mb="xs">
                  {parsed.title}
                </Text>
              )}
              {parsed.sentences.map((sentence, idx) => (
                <Group key={idx} align="flex-start" gap="sm" wrap="nowrap">
                  <Badge size="sm" variant="light" color="blue" style={{ minWidth: "fit-content" }}>
                    {sentence.speaker_name}
                  </Badge>
                  <div style={{ flex: 1 }}>
                    <Text size="sm" style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
                      {sentence.text}
                    </Text>
                    <Text size="xs" c="dimmed" mt="xs">
                      {formatTime(sentence.start_time)} - {formatTime(sentence.end_time)}
                    </Text>
                  </div>
                </Group>
              ))}
            </Stack>
          );
        }
      }
    } catch (error) {
      console.error("Failed to parse Fireflies transcription:", error);
      // Fall back to plain text rendering
    }
  }

  // Handle plain text transcription (exponential-plugin or other providers)
  if (isPreview) {
    return (
      <Text size="sm" c="dimmed" lineClamp={maxLines}>
        {transcription}
      </Text>
    );
  } else {
    return (
      <Text size="sm" style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
        {transcription}
      </Text>
    );
  }
}

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}