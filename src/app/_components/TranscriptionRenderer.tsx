"use client";

import { Text, Stack, Group, Badge, ActionIcon, Tooltip, Button } from "@mantine/core";
import { IconCopy, IconCheck } from "@tabler/icons-react";
import { useState } from "react";

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
  showCopyButton?: boolean;
}

// Custom hook for copy functionality
function useCopyToClipboard() {
  const [copied, setCopied] = useState(false);

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  return { copied, copyToClipboard };
}

// Helper function to extract plain text from Fireflies transcription
function extractPlainTextFromFireflies(parsed: FirefliesTranscription): string {
  const lines = parsed.sentences.map(sentence => 
    `${sentence.speaker_name}: ${sentence.text}`
  );
  return lines.join('\n');
}

// Helper function to extract formatted text with timestamps
function extractFormattedTextFromFireflies(parsed: FirefliesTranscription): string {
  const lines = parsed.sentences.map(sentence => 
    `[${formatTime(sentence.start_time)}] ${sentence.speaker_name}: ${sentence.text}`
  );
  return lines.join('\n');
}

// Helper function to assign colors to speakers based on order of appearance
function getSpeakerColor(speakerName: string, sentences: FirefliesSentence[]): string {
  const colors = [
    'blue', 'green', 'orange', 'purple', 'cyan', 'pink', 'yellow', 'red', 
    'indigo', 'teal', 'lime', 'grape', 'violet', 'gray'
  ];
  
  // Get unique speakers in order of first appearance
  const uniqueSpeakers: string[] = [];
  for (const sentence of sentences) {
    if (!uniqueSpeakers.includes(sentence.speaker_name)) {
      uniqueSpeakers.push(sentence.speaker_name);
    }
  }
  
  // Find the index of this speaker
  const speakerIndex = uniqueSpeakers.indexOf(speakerName);
  
  // Return color based on order of appearance, cycle through colors if more speakers than colors
  return colors[speakerIndex % colors.length] || 'blue';
}

export function TranscriptionRenderer({ 
  transcription, 
  provider, 
  isPreview = false, 
  maxLines = 3,
  showCopyButton = true
}: TranscriptionRendererProps) {
  const { copied, copyToClipboard } = useCopyToClipboard();
  if (!transcription) {
    return (
      <Text size="sm" c="dimmed" ta="center" py="md">
        No transcription available
      </Text>
    );
  }

  // Handle Fireflies structured transcription (explicit provider or auto-detect JSON format)
  if (provider === "fireflies" || !provider) {
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
                  <Badge size="xs" variant="light" color={getSpeakerColor(sentence.speaker_name, parsed.sentences)}>
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
          // Show full conversation with copy functionality
          return (
            <Stack gap="sm">
              {parsed.title && (
                <Group justify="space-between" align="center">
                  <Text fw={500} size="sm">
                    {parsed.title}
                  </Text>
                  {showCopyButton && (
                    <Group gap="xs">
                      <Tooltip label="Copy formatted text with timestamps">
                        <ActionIcon
                          variant="subtle"
                          size="sm"
                          color="gray"
                          onClick={() => copyToClipboard(extractFormattedTextFromFireflies(parsed))}
                        >
                          {copied ? <IconCheck size={16} color="green" /> : <IconCopy size={16} />}
                        </ActionIcon>
                      </Tooltip>
                      <Button
                        variant="subtle"
                        size="xs"
                        color="gray"
                        leftSection={copied ? <IconCheck size={14} color="green" /> : <IconCopy size={14} />}
                        onClick={() => copyToClipboard(extractPlainTextFromFireflies(parsed))}
                      >
                        {copied ? 'Copied!' : 'Copy All'}
                      </Button>
                    </Group>
                  )}
                </Group>
              )}
              {!parsed.title && showCopyButton && (
                <Group justify="flex-end" mb="xs">
                  <Group gap="xs">
                    <Tooltip label="Copy formatted text with timestamps">
                      <ActionIcon
                        variant="subtle"
                        size="sm"
                        color="gray"
                        onClick={() => copyToClipboard(extractFormattedTextFromFireflies(parsed))}
                      >
                        {copied ? <IconCheck size={16} color="green" /> : <IconCopy size={16} />}
                      </ActionIcon>
                    </Tooltip>
                    <Button
                      variant="subtle"
                      size="xs"
                      color="gray"
                      leftSection={copied ? <IconCheck size={14} color="green" /> : <IconCopy size={14} />}
                      onClick={() => copyToClipboard(extractPlainTextFromFireflies(parsed))}
                    >
                      {copied ? 'Copied!' : 'Copy All'}
                    </Button>
                  </Group>
                </Group>
              )}
              {parsed.sentences.map((sentence, idx) => (
                <Group key={idx} align="flex-start" gap="sm" wrap="nowrap">
                  <Badge size="sm" variant="light" color={getSpeakerColor(sentence.speaker_name, parsed.sentences)} style={{ minWidth: "fit-content" }}>
                    {sentence.speaker_name}
                  </Badge>
                  <div style={{ flex: 1 }}>
                    <Group justify="space-between" align="flex-start">
                      <Text size="sm" style={{ whiteSpace: "pre-wrap", lineHeight: 1.6, flex: 1 }}>
                        {sentence.text}
                      </Text>
                      {showCopyButton && (
                        <Tooltip label="Copy this message">
                          <ActionIcon
                            variant="subtle"
                            size="xs"
                            color="gray"
                            onClick={() => copyToClipboard(`${sentence.speaker_name}: ${sentence.text}`)}
                            style={{ opacity: 0.6, marginTop: 2 }}
                          >
                            <IconCopy size={12} />
                          </ActionIcon>
                        </Tooltip>
                      )}
                    </Group>
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
      <Stack gap="xs">
        {showCopyButton && (
          <Group justify="flex-end">
            <Button
              variant="subtle"
              size="xs"
              color="gray"
              leftSection={copied ? <IconCheck size={14} color="green" /> : <IconCopy size={14} />}
              onClick={() => copyToClipboard(transcription)}
            >
              {copied ? 'Copied!' : 'Copy All'}
            </Button>
          </Group>
        )}
        <Text size="sm" style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
          {transcription}
        </Text>
      </Stack>
    );
  }
}

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}