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
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
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

interface Interaction {
  id: string;
  platform: string;
  userMessage: string;
  aiResponse: string;
  createdAt: Date;
  user: {
    id: string;
    name: string | null;
    email: string | null;
  } | null;
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

      <div className="overflow-hidden rounded-lg border border-border-primary">
        <Table highlightOnHover>
          <Table.Thead className="bg-surface-secondary">
            <Table.Tr>
              <Table.Th className="text-text-muted">Platform</Table.Th>
              <Table.Th className="text-text-muted">User</Table.Th>
              <Table.Th className="text-text-muted">User Message</Table.Th>
              <Table.Th className="text-text-muted">AI Response</Table.Th>
              <Table.Th className="text-text-muted">Date</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <Table.Tr key={i}>
                  <Table.Td>
                    <Skeleton height={20} width={60} />
                  </Table.Td>
                  <Table.Td>
                    <Skeleton height={20} width={100} />
                  </Table.Td>
                  <Table.Td>
                    <Skeleton height={20} width={200} />
                  </Table.Td>
                  <Table.Td>
                    <Skeleton height={20} width={200} />
                  </Table.Td>
                  <Table.Td>
                    <Skeleton height={20} width={80} />
                  </Table.Td>
                </Table.Tr>
              ))
            ) : data?.interactions.length === 0 ? (
              <Table.Tr>
                <Table.Td colSpan={5} className="text-center text-text-muted">
                  No interactions found
                </Table.Td>
              </Table.Tr>
            ) : (
              data?.interactions.map((interaction) => (
                <Table.Tr
                  key={interaction.id}
                  className="cursor-pointer"
                  onClick={() => handleRowClick(interaction)}
                >
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
                    <Text size="sm" className="text-text-muted">
                      {formatDate(interaction.createdAt)}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ))
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
              <Text size="sm" className="font-medium text-text-muted">
                Platform
              </Text>
              <Badge variant="light">{selectedInteraction.platform}</Badge>
            </div>
            <div>
              <Text size="sm" className="font-medium text-text-muted">
                User
              </Text>
              <Text className="text-text-primary">
                {selectedInteraction.user?.name ??
                  selectedInteraction.user?.email ??
                  "Unknown"}
              </Text>
            </div>
            <div>
              <Text size="sm" className="font-medium text-text-muted">
                Date
              </Text>
              <Text className="text-text-primary">
                {formatDate(selectedInteraction.createdAt)}
              </Text>
            </div>
            <div>
              <Text size="sm" className="font-medium text-text-muted">
                User Message
              </Text>
              <ScrollArea.Autosize mah={200}>
                <Text className="whitespace-pre-wrap text-text-primary">
                  {selectedInteraction.userMessage}
                </Text>
              </ScrollArea.Autosize>
            </div>
            <div>
              <Text size="sm" className="font-medium text-text-muted">
                AI Response
              </Text>
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
