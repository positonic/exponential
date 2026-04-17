"use client";

import { useState } from "react";
import {
  Table,
  Text,
  Title,
  Badge,
  Button,
  Group,
  Skeleton,
  Modal,
  ScrollArea,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import {
  IconChevronLeft,
  IconChevronRight,
  IconStar,
  IconStarFilled,
  IconEye,
  IconCoins,
} from "@tabler/icons-react";
import { api } from "~/trpc/react";

function truncate(str: string | null | undefined, maxLength: number): string {
  if (!str) return "";
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength) + "...";
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function StarRating({ rating }: { rating: number }) {
  return (
    <Group gap={2}>
      {[1, 2, 3, 4, 5].map((star) => (
        <span key={star} className={star <= rating ? "text-yellow-500" : "text-text-muted"}>
          {star <= rating ? <IconStarFilled size={14} /> : <IconStar size={14} />}
        </span>
      ))}
    </Group>
  );
}

interface TokenUsage {
  prompt?: number;
  completion?: number;
  total?: number;
  cost?: number;
}

interface Interaction {
  id: string;
  platform: string;
  userMessage: string;
  aiResponse: string;
  createdAt: Date;
  tokenUsage?: unknown;
  user: {
    id: string;
    name: string | null;
    email: string | null;
  } | null;
  feedback: {
    id: string;
    rating: number;
  }[];
}

function parseTokenUsage(raw: unknown): TokenUsage | null {
  if (!raw) return null;
  if (typeof raw === "string") {
    try { return JSON.parse(raw) as TokenUsage; } catch { return null; }
  }
  return raw as TokenUsage;
}

export function AiInteractionsTable() {
  const [cursor, setCursor] = useState<string | null>(null);
  const [cursorHistory, setCursorHistory] = useState<string[]>([]);
  const [selectedInteraction, setSelectedInteraction] =
    useState<Interaction | null>(null);
  const [opened, { open, close }] = useDisclosure(false);

  const { data, isLoading } = api.admin.getAllAiInteractions.useQuery({
    limit: 20,
    cursor: cursor ?? undefined,
  });

  const { data: tokenSummary, isLoading: tokenSummaryLoading } =
    api.admin.getTokenUsageSummaryByUser.useQuery(undefined);

  const handleNext = () => {
    if (data?.nextCursor) {
      setCursorHistory((prev) => [...prev, cursor ?? ""]);
      setCursor(data.nextCursor);
    }
  };

  const handlePrev = () => {
    const newHistory = [...cursorHistory];
    const prevCursor = newHistory.pop();
    setCursorHistory(newHistory);
    setCursor(prevCursor === "" ? null : prevCursor ?? null);
  };

  const handleRowClick = (interaction: Interaction) => {
    setSelectedInteraction(interaction);
    open();
  };

  return (
    <div className="space-y-6">
      <div>
        <Title order={2} className="text-text-primary">
          AI Interactions
        </Title>
        <Text className="text-text-muted">
          View all AI interaction history across all users
        </Text>
      </div>

      {/* Per-user token summary */}
      <div>
        <Group gap="xs" mb="sm">
          <IconCoins size={16} className="text-text-muted" />
          <Text size="sm" fw={500} className="text-text-secondary">
            Token usage by user
          </Text>
        </Group>
        <div className="overflow-hidden rounded-lg border border-border-primary">
          <Table>
            <Table.Thead className="bg-surface-secondary">
              <Table.Tr>
                <Table.Th className="text-text-muted">User</Table.Th>
                <Table.Th className="text-text-muted">Calls</Table.Th>
                <Table.Th className="text-text-muted">Prompt tokens</Table.Th>
                <Table.Th className="text-text-muted">Completion tokens</Table.Th>
                <Table.Th className="text-text-muted">Total tokens</Table.Th>
                <Table.Th className="text-text-muted">Est. cost (USD)</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {tokenSummaryLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <Table.Tr key={i}>
                    {Array.from({ length: 6 }).map((__, j) => (
                      <Table.Td key={j}><Skeleton height={16} width={80} /></Table.Td>
                    ))}
                  </Table.Tr>
                ))
              ) : !tokenSummary?.length ? (
                <Table.Tr>
                  <Table.Td colSpan={6} className="text-center text-text-muted">
                    No token data yet — data appears after users make agent calls
                  </Table.Td>
                </Table.Tr>
              ) : (
                tokenSummary.map((row) => (
                  <Table.Tr key={row.userId}>
                    <Table.Td>
                      <Text size="sm" className="text-text-primary">
                        {row.name ?? row.email ?? row.userId}
                      </Text>
                      {row.name && row.email && (
                        <Text size="xs" className="text-text-muted">{row.email}</Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" className="text-text-secondary">{row.interactions}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" className="text-text-secondary">{formatTokens(row.prompt)}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" className="text-text-secondary">{formatTokens(row.completion)}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" fw={500} className="text-text-primary">{formatTokens(row.total)}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" className="text-text-secondary">
                        {row.cost > 0 ? `$${row.cost.toFixed(4)}` : "—"}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                ))
              )}
            </Table.Tbody>
          </Table>
        </div>
      </div>

      {/* Interaction log */}
      <div className="overflow-hidden rounded-lg border border-border-primary">
        <Table highlightOnHover>
          <Table.Thead className="bg-surface-secondary">
            <Table.Tr>
              <Table.Th className="text-text-muted">Platform</Table.Th>
              <Table.Th className="text-text-muted">User</Table.Th>
              <Table.Th className="text-text-muted">User Message</Table.Th>
              <Table.Th className="text-text-muted">AI Response</Table.Th>
              <Table.Th className="text-text-muted">Tokens</Table.Th>
              <Table.Th className="text-text-muted">Rating</Table.Th>
              <Table.Th className="text-text-muted">Date</Table.Th>
              <Table.Th className="text-text-muted">Details</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <Table.Tr key={i}>
                  {Array.from({ length: 8 }).map((__, j) => (
                    <Table.Td key={j}><Skeleton height={20} width={j === 2 || j === 3 ? 200 : 80} /></Table.Td>
                  ))}
                </Table.Tr>
              ))
            ) : data?.interactions.length === 0 ? (
              <Table.Tr>
                <Table.Td colSpan={8} className="text-center text-text-muted">
                  No interactions found
                </Table.Td>
              </Table.Tr>
            ) : (
              data?.interactions.map((interaction) => {
                const usage = parseTokenUsage(interaction.tokenUsage);
                return (
                  <Table.Tr key={interaction.id}>
                    <Table.Td>
                      <Badge variant="light" size="sm">
                        {interaction.platform}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" className="text-text-primary">
                        {interaction.user?.name ?? interaction.user?.email ?? "—"}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" className="text-text-secondary">
                        {truncate(interaction.userMessage, 50)}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" className="text-text-secondary">
                        {truncate(interaction.aiResponse, 50)}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      {usage?.total ? (
                        <Text size="sm" className="text-text-secondary">
                          {formatTokens(usage.total)}
                        </Text>
                      ) : (
                        <Text size="sm" className="text-text-muted">—</Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      {interaction.feedback[0] ? (
                        <StarRating rating={interaction.feedback[0].rating} />
                      ) : (
                        <Text size="sm" className="text-text-muted">—</Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" className="text-text-muted">
                        {formatDate(interaction.createdAt)}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Button
                        variant="subtle"
                        size="xs"
                        leftSection={<IconEye size={14} />}
                        onClick={() => handleRowClick(interaction as Interaction)}
                      >
                        View
                      </Button>
                    </Table.Td>
                  </Table.Tr>
                );
              })
            )}
          </Table.Tbody>
        </Table>
      </div>

      <Group justify="space-between">
        <Button
          variant="subtle"
          leftSection={<IconChevronLeft size={16} />}
          disabled={cursorHistory.length === 0}
          onClick={handlePrev}
        >
          Previous
        </Button>
        <Button
          variant="subtle"
          rightSection={<IconChevronRight size={16} />}
          disabled={!data?.nextCursor}
          onClick={handleNext}
        >
          Next
        </Button>
      </Group>

      <Modal
        opened={opened}
        onClose={close}
        title="Interaction Details"
        size="lg"
      >
        {selectedInteraction && (
          <div className="space-y-4">
            <div>
              <Text size="sm" className="font-medium text-text-muted">Platform</Text>
              <Badge variant="light">{selectedInteraction.platform}</Badge>
            </div>
            <div>
              <Text size="sm" className="font-medium text-text-muted">User</Text>
              <Text className="text-text-primary">
                {selectedInteraction.user?.name ??
                  selectedInteraction.user?.email ??
                  "Unknown"}
              </Text>
            </div>
            {(() => {
              const usage = parseTokenUsage(selectedInteraction.tokenUsage);
              return usage ? (
                <div>
                  <Text size="sm" className="font-medium text-text-muted">Token usage</Text>
                  <Group gap="lg" mt={4}>
                    <div>
                      <Text size="xs" className="text-text-muted">Prompt</Text>
                      <Text size="sm" className="text-text-primary">{usage.prompt?.toLocaleString() ?? "—"}</Text>
                    </div>
                    <div>
                      <Text size="xs" className="text-text-muted">Completion</Text>
                      <Text size="sm" className="text-text-primary">{usage.completion?.toLocaleString() ?? "—"}</Text>
                    </div>
                    <div>
                      <Text size="xs" className="text-text-muted">Total</Text>
                      <Text size="sm" fw={500} className="text-text-primary">{usage.total?.toLocaleString() ?? "—"}</Text>
                    </div>
                    {usage.cost !== undefined && usage.cost > 0 && (
                      <div>
                        <Text size="xs" className="text-text-muted">Est. cost</Text>
                        <Text size="sm" className="text-text-primary">${usage.cost.toFixed(5)}</Text>
                      </div>
                    )}
                  </Group>
                </div>
              ) : null;
            })()}
            <div>
              <Text size="sm" className="font-medium text-text-muted">Date</Text>
              <Text className="text-text-primary">{formatDate(selectedInteraction.createdAt)}</Text>
            </div>
            <div>
              <Text size="sm" className="font-medium text-text-muted">Rating</Text>
              {selectedInteraction.feedback[0] ? (
                <Group gap="xs">
                  <StarRating rating={selectedInteraction.feedback[0].rating} />
                  <Text className="text-text-primary">
                    ({selectedInteraction.feedback[0].rating}/5)
                  </Text>
                </Group>
              ) : (
                <Text className="text-text-muted">No rating</Text>
              )}
            </div>
            <div>
              <Text size="sm" className="font-medium text-text-muted">User Message</Text>
              <ScrollArea.Autosize mah={200}>
                <Text className="whitespace-pre-wrap text-text-primary">
                  {selectedInteraction.userMessage}
                </Text>
              </ScrollArea.Autosize>
            </div>
            <div>
              <Text size="sm" className="font-medium text-text-muted">AI Response</Text>
              <ScrollArea.Autosize mah={300}>
                <Text className="whitespace-pre-wrap text-text-primary">
                  {selectedInteraction.aiResponse}
                </Text>
              </ScrollArea.Autosize>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
