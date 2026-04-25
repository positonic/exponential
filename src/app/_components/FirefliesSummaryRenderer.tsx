"use client";

import {
  Accordion,
  Badge,
  Group,
  List,
  Paper,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import type { FirefliesSummary } from "~/server/services/FirefliesService";

interface FirefliesSummaryProps {
  summary: FirefliesSummary;
}

/**
 * Renders Fireflies summary sections as Accordion.Item fragments.
 * Use inside an existing <Accordion> alongside other items.
 */
export function FirefliesSummaryAccordionItems({
  summary,
}: FirefliesSummaryProps) {
  return <>{renderSummarySections(summary)}</>;
}

/**
 * Renders Fireflies summary as a standalone component with its own Accordion.
 * Use on pages where summary is the primary content (e.g. recording detail page).
 */
export function FirefliesSummaryDisplay({ summary }: FirefliesSummaryProps) {
  const defaultOpen = [];
  if (summary.overview) defaultOpen.push("overview");
  else if (summary.short_summary) defaultOpen.push("short-summary");
  else if (summary.gist) defaultOpen.push("gist");

  return (
    <Accordion multiple defaultValue={defaultOpen}>
      {renderSummarySections(summary)}
    </Accordion>
  );
}

function renderSummarySections(summary: FirefliesSummary) {
  return (
    <>
      {summary.keywords && summary.keywords.length > 0 && (
        <Accordion.Item value="keywords">
          <Accordion.Control>
            <Title order={5}>Keywords</Title>
          </Accordion.Control>
          <Accordion.Panel>
            <Group gap="xs">
              {summary.keywords.map((keyword: string, index: number) => (
                <Badge key={index} variant="light" size="sm">
                  {keyword}
                </Badge>
              ))}
            </Group>
          </Accordion.Panel>
        </Accordion.Item>
      )}

      {summary.action_items &&
        (Array.isArray(summary.action_items)
          ? summary.action_items.length > 0
          : typeof summary.action_items === "string" &&
            summary.action_items.trim().length > 0) && (
          <Accordion.Item value="summary-actions">
            <Accordion.Control>
              <Title order={5}>Action Items (From Summary)</Title>
            </Accordion.Control>
            <Accordion.Panel>
              {Array.isArray(summary.action_items) ? (
                <List>
                  {summary.action_items.map(
                    (item: string, index: number) => (
                      <List.Item key={index}>{item}</List.Item>
                    ),
                  )}
                </List>
              ) : (
                <Text
                  size="sm"
                  style={{ whiteSpace: "pre-wrap", fontFamily: "monospace" }}
                >
                  {summary.action_items}
                </Text>
              )}
            </Accordion.Panel>
          </Accordion.Item>
        )}

      {summary.overview && (
        <Accordion.Item value="overview">
          <Accordion.Control>
            <Title order={5}>Overview</Title>
          </Accordion.Control>
          <Accordion.Panel>
            <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>
              {summary.overview}
            </Text>
          </Accordion.Panel>
        </Accordion.Item>
      )}

      {summary.short_summary && (
        <Accordion.Item value="short-summary">
          <Accordion.Control>
            <Title order={5}>Short Summary</Title>
          </Accordion.Control>
          <Accordion.Panel>
            <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>
              {summary.short_summary}
            </Text>
          </Accordion.Panel>
        </Accordion.Item>
      )}

      {summary.gist && (
        <Accordion.Item value="gist">
          <Accordion.Control>
            <Title order={5}>Gist</Title>
          </Accordion.Control>
          <Accordion.Panel>
            <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>
              {summary.gist}
            </Text>
          </Accordion.Panel>
        </Accordion.Item>
      )}

      {summary.bullet_gist && summary.bullet_gist.length > 0 && (
        <Accordion.Item value="bullet-gist">
          <Accordion.Control>
            <Title order={5}>Key Points</Title>
          </Accordion.Control>
          <Accordion.Panel>
            <List>
              {summary.bullet_gist.map(
                (point: string, index: number) => (
                  <List.Item key={index}>{point}</List.Item>
                ),
              )}
            </List>
          </Accordion.Panel>
        </Accordion.Item>
      )}

      {summary.shorthand_bullet && summary.shorthand_bullet.length > 0 && (
        <Accordion.Item value="shorthand-bullet">
          <Accordion.Control>
            <Title order={5}>Detailed Breakdown</Title>
          </Accordion.Control>
          <Accordion.Panel>
            <List>
              {summary.shorthand_bullet.map(
                (point: string, index: number) => (
                  <List.Item key={index}>{point}</List.Item>
                ),
              )}
            </List>
          </Accordion.Panel>
        </Accordion.Item>
      )}

      {summary.outline && (
        <Accordion.Item value="outline">
          <Accordion.Control>
            <Title order={5}>Outline</Title>
          </Accordion.Control>
          <Accordion.Panel>
            <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>
              {summary.outline}
            </Text>
          </Accordion.Panel>
        </Accordion.Item>
      )}

      {summary.meeting_type && (
        <Accordion.Item value="meeting-type">
          <Accordion.Control>
            <Title order={5}>Meeting Type</Title>
          </Accordion.Control>
          <Accordion.Panel>
            <Badge variant="filled" color="cyan">
              {summary.meeting_type}
            </Badge>
          </Accordion.Panel>
        </Accordion.Item>
      )}

      {summary.topics_discussed && summary.topics_discussed.length > 0 && (
        <Accordion.Item value="topics">
          <Accordion.Control>
            <Title order={5}>Topics Discussed</Title>
          </Accordion.Control>
          <Accordion.Panel>
            <List>
              {summary.topics_discussed.map(
                (topic: string, index: number) => (
                  <List.Item key={index}>{topic}</List.Item>
                ),
              )}
            </List>
          </Accordion.Panel>
        </Accordion.Item>
      )}

      {summary.transcript_chapters &&
        summary.transcript_chapters.length > 0 && (
          <Accordion.Item value="chapters">
            <Accordion.Control>
              <Title order={5}>Transcript Chapters</Title>
            </Accordion.Control>
            <Accordion.Panel>
              <Stack gap="sm">
                {summary.transcript_chapters.map(
                  (
                    chapter: { title?: string; summary?: string },
                    index: number,
                  ) => (
                    <Paper
                      key={index}
                      p="sm"
                      radius="xs"
                      className="bg-surface-tertiary"
                    >
                      <Text size="sm" fw={500}>
                        {chapter.title ?? `Chapter ${index + 1}`}
                      </Text>
                      {chapter.summary && (
                        <Text size="xs" c="dimmed" mt="xs">
                          {chapter.summary}
                        </Text>
                      )}
                    </Paper>
                  ),
                )}
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>
        )}
    </>
  );
}
