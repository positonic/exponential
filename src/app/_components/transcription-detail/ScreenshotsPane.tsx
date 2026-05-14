"use client";

import {
  ActionIcon,
  Badge,
  Group,
  Image,
  Modal,
  Paper,
  Stack,
  Text,
} from "@mantine/core";
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import { useState } from "react";

interface FirefliesSentence {
  text: string;
  speaker_name: string;
  start_time: number;
  end_time: number;
}

interface ScreenshotWithTranscript {
  screenshot: {
    id: string;
    url: string;
    timestamp: string;
    createdAt: string | Date;
  };
  sentences: FirefliesSentence[];
  plainText?: string;
  prelude?: string;
}

interface ScreenshotsPaneProps {
  screenshots: Array<{
    id: string;
    url: string;
    timestamp: string;
    createdAt: string | Date;
  }>;
  transcription: string | null;
}

export function ScreenshotsPane({
  screenshots,
  transcription,
}: ScreenshotsPaneProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const pairs = buildScreenshotTranscriptPairs(screenshots, transcription);
  if (pairs.length === 0) {
    return (
      <div className="mdm-pane">
        <Text size="sm" c="dimmed" fs="italic">
          No screenshots captured for this meeting.
        </Text>
      </div>
    );
  }

  const closeLightbox = () => setLightboxIndex(null);
  const goToPrev = () =>
    setLightboxIndex((p) => (p !== null && p > 0 ? p - 1 : p));
  const goToNext = () =>
    setLightboxIndex((p) =>
      p !== null && p < pairs.length - 1 ? p + 1 : p,
    );

  return (
    <div className="mdm-pane">
      <div className="max-w-[820px]">
        <Stack gap="lg">
          {pairs.map((pair, index) => (
            <div key={pair.screenshot.id} className="flex gap-4">
              <div className="shrink-0">
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setLightboxIndex(index)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") setLightboxIndex(index);
                  }}
                  className="cursor-pointer"
                >
                  <Image
                    src={pair.screenshot.url}
                    alt={`Screenshot ${index + 1}`}
                    w={200}
                    h={150}
                    fit="cover"
                    radius="sm"
                    className="transition-opacity hover:opacity-80"
                  />
                </div>
                <Text size="xs" c="dimmed" mt={4} ta="center">
                  {pair.screenshot.timestamp}
                </Text>
              </div>
              <Paper
                p="md"
                radius="sm"
                className="bg-surface-tertiary flex-1"
                style={{ minHeight: 150 }}
              >
                {pair.sentences.length > 0 ? (
                  <Stack gap="xs">
                    {pair.sentences.map((sentence, sIdx) => (
                      <Group key={sIdx} align="flex-start" gap="sm" wrap="nowrap">
                        <Badge
                          size="xs"
                          variant="light"
                          color="blue"
                          style={{ minWidth: "fit-content" }}
                        >
                          {sentence.speaker_name}
                        </Badge>
                        <Text
                          size="sm"
                          style={{ whiteSpace: "pre-wrap", lineHeight: 1.5 }}
                        >
                          {sentence.text}
                        </Text>
                      </Group>
                    ))}
                  </Stack>
                ) : pair.plainText ? (
                  <Text size="sm" style={{ whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
                    {pair.plainText}
                  </Text>
                ) : (
                  <Text size="sm" c="dimmed" fs="italic">
                    No transcription text for this segment.
                  </Text>
                )}
              </Paper>
            </div>
          ))}
        </Stack>
      </div>

      <Modal
        opened={lightboxIndex !== null}
        onClose={closeLightbox}
        size="xl"
        centered
        padding={0}
        withCloseButton={false}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") goToPrev();
          else if (e.key === "ArrowRight") goToNext();
          else if (e.key === "Escape") closeLightbox();
        }}
      >
        {lightboxIndex !== null && pairs[lightboxIndex] && (() => {
          const pair = pairs[lightboxIndex];
          if (!pair) return null;
          return (
            <Stack gap={0}>
              <div className="relative">
                <Image
                  src={pair.screenshot.url}
                  alt={`Screenshot ${lightboxIndex + 1}`}
                  fit="contain"
                  style={{ maxHeight: "60vh" }}
                />
                <Group
                  justify="space-between"
                  style={{
                    position: "absolute",
                    top: "50%",
                    left: 0,
                    right: 0,
                    transform: "translateY(-50%)",
                    pointerEvents: "none",
                    padding: "0 8px",
                  }}
                >
                  <ActionIcon
                    variant="filled"
                    size="lg"
                    radius="xl"
                    onClick={goToPrev}
                    disabled={lightboxIndex === 0}
                    style={{
                      pointerEvents: "auto",
                      opacity: lightboxIndex === 0 ? 0.3 : 0.8,
                    }}
                    className="bg-surface-secondary"
                  >
                    <IconChevronLeft size={20} />
                  </ActionIcon>
                  <ActionIcon
                    variant="filled"
                    size="lg"
                    radius="xl"
                    onClick={goToNext}
                    disabled={lightboxIndex === pairs.length - 1}
                    style={{
                      pointerEvents: "auto",
                      opacity:
                        lightboxIndex === pairs.length - 1 ? 0.3 : 0.8,
                    }}
                    className="bg-surface-secondary"
                  >
                    <IconChevronRight size={20} />
                  </ActionIcon>
                </Group>
                <Badge
                  variant="filled"
                  size="sm"
                  style={{
                    position: "absolute",
                    top: 8,
                    right: 8,
                    opacity: 0.8,
                  }}
                  className="bg-surface-secondary text-text-primary"
                >
                  {lightboxIndex + 1} / {pairs.length}
                </Badge>
              </div>
              <Paper p="md" className="bg-surface-secondary">
                <Text size="xs" c="dimmed" mb="xs">
                  {pair.screenshot.timestamp}
                </Text>
                {pair.sentences.length > 0 ? (
                  <Stack gap="xs">
                    {pair.sentences.map((sentence, sIdx) => (
                      <Group
                        key={sIdx}
                        align="flex-start"
                        gap="sm"
                        wrap="nowrap"
                      >
                        <Badge
                          size="xs"
                          variant="light"
                          color="blue"
                          style={{ minWidth: "fit-content" }}
                        >
                          {sentence.speaker_name}
                        </Badge>
                        <Text
                          size="sm"
                          style={{ whiteSpace: "pre-wrap", lineHeight: 1.5 }}
                        >
                          {sentence.text}
                        </Text>
                      </Group>
                    ))}
                  </Stack>
                ) : pair.plainText ? (
                  <Text size="sm" style={{ whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
                    {pair.plainText}
                  </Text>
                ) : (
                  <Text size="sm" c="dimmed" fs="italic">
                    No transcription text for this segment.
                  </Text>
                )}
              </Paper>
            </Stack>
          );
        })()}
      </Modal>
    </div>
  );
}

interface FirefliesTranscriptionData {
  title?: string;
  sentences: FirefliesSentence[];
}

function buildScreenshotTranscriptPairs(
  screenshots: Array<{
    id: string;
    url: string;
    timestamp: string;
    createdAt: string | Date;
  }>,
  transcription: string | null,
): ScreenshotWithTranscript[] {
  if (!screenshots || screenshots.length === 0) return [];

  const sorted = [...screenshots].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  let firefliesData: FirefliesTranscriptionData | null = null;
  if (transcription) {
    try {
      const parsed = JSON.parse(transcription) as Record<string, unknown>;
      if (parsed.sentences && Array.isArray(parsed.sentences)) {
        firefliesData = parsed as unknown as FirefliesTranscriptionData;
      }
    } catch {
      // not JSON
    }
  }

  if (firefliesData?.sentences && firefliesData.sentences.length > 0) {
    const sentencesSorted = [...firefliesData.sentences].sort(
      (a, b) => a.start_time - b.start_time,
    );
    const chunkSize = Math.ceil(sentencesSorted.length / sorted.length);
    return sorted.map((screenshot, index) => {
      const startIdx = index * chunkSize;
      const endIdx = Math.min(startIdx + chunkSize, sentencesSorted.length);
      return {
        screenshot,
        sentences: sentencesSorted.slice(startIdx, endIdx),
      };
    });
  }

  let prelude = "";
  if (transcription) {
    if (transcription.includes("[SCREENSHOT]")) {
      const segments = transcription.split(/\s*\[SCREENSHOT\]\.?\s*/);
      const markerCount = (transcription.match(/\[SCREENSHOT\]/g) ?? []).length;
      const gap = Math.max(0, sorted.length - markerCount);
      prelude = segments[0] ? segments[0].trim() : "";
      return sorted.map((screenshot, index) => {
        const segmentIndex = index - gap + 1;
        let text = "";
        if (segmentIndex >= 1 && segmentIndex < segments.length) {
          text = segments[segmentIndex]!.trim();
        }
        if (index === sorted.length - 1) {
          const remaining = segments
            .slice(Math.max(segmentIndex + 1, 1))
            .map((s) => s.trim())
            .filter(Boolean);
          if (remaining.length > 0) {
            text = text ? `${text} ${remaining.join(" ")}` : remaining.join(" ");
          }
        }
        return {
          screenshot,
          sentences: [],
          plainText: text || undefined,
          prelude: index === 0 ? prelude : undefined,
        };
      });
    }
    const paragraphs = transcription.split(/\n\n+/).filter((p) => p.trim());
    if (paragraphs.length === 0) {
      return sorted.map((screenshot) => ({
        screenshot,
        sentences: [],
        plainText: transcription,
      }));
    }
    const chunkSize = Math.ceil(paragraphs.length / sorted.length);
    return sorted.map((screenshot, index) => {
      const startIdx = index * chunkSize;
      const endIdx = Math.min(startIdx + chunkSize, paragraphs.length);
      return {
        prelude: index === 0 ? prelude : undefined,
        screenshot,
        sentences: [],
        plainText: paragraphs.slice(startIdx, endIdx).join("\n\n"),
      };
    });
  }

  return sorted.map((screenshot) => ({ screenshot, sentences: [] }));
}
