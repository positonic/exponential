"use client";

import {
  Button,
  Paper,
  Title,
  Text,
  Group,
  Badge,
  Table,
  Checkbox,
  Select,
} from "@mantine/core";
import { useState } from "react";
import { api } from "~/trpc/react";
import type { TranscriptionSetups } from "~/types/transcription";
import ReactMarkdown from "react-markdown";
import type { Caption } from "~/utils/vttParser";
import { getVideoIdFromYoutubeUrl } from "~/utils/youtube";
import { TranscriptionAccordion } from "~/app/_components/TranscriptionAccordion";

interface SummarizeButtonProps {
  transcription: string;
  captions: Caption[];
  isCompleted: boolean;
  videoUrl: string;
}

export function SummarizeButton({
  transcription,
  captions,
  isCompleted,
  videoUrl,
}: SummarizeButtonProps) {
  const [creatingSetups, setCreatingSetups] = useState(false);
  const [creatingDescription, setCreatingDescription] = useState(false);
  const [creatingSummary, setCreatingSummary] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [description, setDescription] = useState<string | null>(null);
  const [setups, setSetups] = useState<TranscriptionSetups | null>(null);
  const [selectedSetups, setSelectedSetups] = useState<string[]>([]);
  const [summaryType, setSummaryType] = useState<
    "basic" | "trade-setups" | "description"
  >("basic");

  const videoId = getVideoIdFromYoutubeUrl(videoUrl);
  const handleGetSetups = () => {
    setCreatingSetups(true);
    setupsMutation.mutate({ transcription, summaryType: "trade-setups" });
  };

  const setupsMutation = api.video.getSetups.useMutation({
    onSuccess: (setups) => {
      console.log("createDescriptionMutation onSuccess", summary);
      setSetups(setups);
      setCreatingSetups(false);
    },
    onError: (error) => {
      console.error("Error generating summary:", error);
      setCreatingSetups(false);
    },
  });

  // Description:
  const createDescriptionMutation = api.video.describeTranscription.useMutation(
    {
      onSuccess: (description) => {
        console.log("createDescriptionMutation onSuccess", description);
        setDescription(description);
        setCreatingDescription(false);
      },
      onError: (error) => {
        console.error("Error generating summary:", error);
        setCreatingDescription(false);
      },
    },
  );

  const handelCreateDescription = () => {
    setCreatingDescription(true);
    createDescriptionMutation.mutate({
      transcription,
      summaryType: "description",
      captions: captions.map((c) => ({
        text: c.text,
        startSeconds: c.startSeconds,
        endSeconds: c.endSeconds,
      })),
      videoUrl,
    });
  };

  // Summary:
  const createSummaryMutation = api.video.summarizeTranscription.useMutation({
    onSuccess: (summary) => {
      console.log("createDescriptionMutation onSuccess", summary);
      setSummary(summary);
      setCreatingSummary(false);
    },
    onError: (error) => {
      console.error("Error generating summary:", error);
      setCreatingSummary(false);
    },
  });

  const handleCreateSummary = () => {
    setCreatingSummary(true);
    createSummaryMutation.mutate({
      videoId,
      transcription,
      summaryType: "basic",
    });
  };

  return (
    <div>
      {captions.length > 0 && (
        <TranscriptionAccordion transcription={transcription} />
      )}
      <Group gap="md">
        {/* <Select
          data={[
            { value: "basic", label: "Basic Summary" },
            { value: "trade-setups", label: "Trade Setups" },
            { value: "description", label: "Sluis" },
          ]}
          value={summaryType}
          onChange={(value) =>
            setSummaryType(value as "basic" | "trade-setups" | "description")
          }
          w={200}
        /> */}
        <Button
          loading={creatingSummary}
          disabled={!transcription || !isCompleted}
          onClick={handleCreateSummary}
          title={"Create Summary"}
        >
          Create Summary
        </Button>
        <Button
          loading={creatingDescription}
          disabled={!transcription || !isCompleted}
          onClick={handelCreateDescription}
          title={
            !transcription
              ? "No transcription available"
              : !isCompleted
                ? "Video processing not completed"
                : "Generate summary"
          }
        >
          Create Description
        </Button>

        <Button
          loading={creatingSetups}
          disabled={!transcription || !isCompleted}
          onClick={handleGetSetups}
          title={"Create setups"}
        >
          Find setups
        </Button>
      </Group>
      {summary && (
        <Paper shadow="sm" p="md" radius="md" withBorder className="mt-4">
          <Title order={2} mb="md">
            Summary
          </Title>
          <ReactMarkdown
            components={{
              h2: ({ children }) => (
                <Title order={2} mt="md" mb="xs">
                  {children}
                </Title>
              ),
              h3: ({ children }) => (
                <Title order={3} mt="md" mb="xs">
                  {children}
                </Title>
              ),
              ul: ({ children }) => (
                <ul className="mb-4 list-disc pl-6">{children}</ul>
              ),
              li: ({ children }) => <li className="mb-2">{children}</li>,
              p: ({ children }) => (
                <Text size="sm" mb="md">
                  {children}
                </Text>
              ),
              strong: ({ children }) => (
                <Text span fw={700}>
                  {children}
                </Text>
              ),
              em: ({ children }) => (
                <Text span fs="italic">
                  {children}
                </Text>
              ),
              code: ({ children }) => (
                <code className="rounded bg-gray-100 px-1 py-0.5 dark:bg-gray-800">
                  {children}
                </code>
              ),
            }}
          >
            {summary}
          </ReactMarkdown>
        </Paper>
      )}
      {setups && (
        <Paper shadow="sm" p="md" radius="md" withBorder className="mt-4">
          <Title order={3} mb="md">
            Setups
          </Title>
          <Text size="sm" c="dimmed" mb="md">
            {setups.coins?.length} coins analyzed
          </Text>
          <Text size="sm" mb="md">
            {setups.generalMarketContext}
          </Text>

          {setups.coins?.map((coin) => (
            <Paper
              key={coin.coin}
              shadow="xs"
              p="sm"
              radius="sm"
              withBorder
              mb="md"
            >
              <Title order={4} mb="xs">
                {coin.coin}
              </Title>
              <Group gap="xs" mb="xs">
                <Badge
                  key={`${coin.coin}-${coin.sentiment}`}
                  variant="light"
                  color={
                    coin.sentiment?.toLowerCase().includes("bullish")
                      ? "green"
                      : coin.sentiment?.toLowerCase().includes("bearish")
                        ? "red"
                        : "blue"
                  }
                >
                  {coin.sentiment}
                </Badge>
              </Group>
              <Text size="sm" mb="md">
                {coin.marketContext}
              </Text>

              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th key="position">Position</Table.Th>
                    <Table.Th key="entry-triggers">Entry Triggers</Table.Th>
                    <Table.Th key="entry-price">Entry Price</Table.Th>
                    <Table.Th key="take-profit">Take Profit</Table.Th>
                    <Table.Th key="stop-loss">Stop Loss</Table.Th>
                    <Table.Th key="timeframe">Timeframe</Table.Th>
                    <Table.Th key="actions" />
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {coin.tradeSetups?.map((setup) => (
                    <Table.Tr
                      key={`${coin.coin}-${setup.position}`}
                      bg={
                        selectedSetups.includes(
                          `${coin.coin}-${setup.position}`,
                        )
                          ? "var(--mantine-color-blue-light)"
                          : undefined
                      }
                    >
                      <Table.Td key="position">{setup.position}</Table.Td>
                      <Table.Td key="entry-triggers">
                        {setup.entryTriggers}
                      </Table.Td>
                      <Table.Td key="entry-price">{setup.entryPrice}</Table.Td>
                      <Table.Td key="take-profit">{setup.takeProfit}</Table.Td>
                      <Table.Td key="stop-loss">{setup.stopLoss}</Table.Td>
                      <Table.Td key="timeframe">{setup.timeframe}</Table.Td>
                      <Table.Td key="actions">
                        <Checkbox
                          aria-label="Select setup"
                          checked={selectedSetups.includes(
                            `${coin.coin}-${setup.position}`,
                          )}
                          onChange={(event) =>
                            setSelectedSetups(
                              event.currentTarget.checked
                                ? [
                                    ...selectedSetups,
                                    `${coin.coin}-${setup.position}`,
                                  ]
                                : selectedSetups.filter(
                                    (id) =>
                                      id !== `${coin.coin}-${setup.position}`,
                                  ),
                            )
                          }
                        />
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Paper>
          ))}
        </Paper>
      )}
    </div>
  );
}
