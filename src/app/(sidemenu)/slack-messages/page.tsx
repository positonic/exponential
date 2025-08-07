"use client";

import { useState } from "react";
import {
  Container,
  Title,
  Card,
  Text,
  Group,
  Badge,
  Stack,
  Select,
  Button,
  TextInput,
  Grid,
  Paper,
  Divider,
  Loader,
  Center,
  Alert,
} from "@mantine/core";
import { IconMessage, IconAlertCircle, IconSearch, IconFilter } from "@tabler/icons-react";
import { api } from "~/trpc/react";
import { formatDistanceToNow } from "date-fns";

export default function SlackMessagesPage() {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedChannelId, setSelectedChannelId] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");

  const { data: messageHistory, isLoading: messagesLoading, fetchNextPage, hasNextPage } = 
    api.slack.getMessageHistory.useInfiniteQuery(
      {
        limit: 20,
        ...(selectedCategory && { category: selectedCategory }),
        ...(selectedChannelId && { channelId: selectedChannelId }),
      },
      {
        getNextPageParam: (lastPage) => lastPage.nextCursor,
      }
    );

  const { data: stats, isLoading: statsLoading } = api.slack.getMessageStats.useQuery();

  const allMessages = messageHistory?.pages.flatMap((page) => page.messages) ?? [];

  const filteredMessages = allMessages.filter((message) =>
    searchTerm === "" || 
    message.rawMessage.toLowerCase().includes(searchTerm.toLowerCase()) ||
    message.cleanMessage.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (message.userName && message.userName.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const categoryOptions = stats?.categoryBreakdown.map(cat => ({
    value: cat.category,
    label: `${cat.category} (${cat.count})`,
  })) || [];

  const channelTypeColors: Record<string, string> = {
    DM: "blue",
    channel: "green",
    group: "orange",
  };

  const categoryColors: Record<string, string> = {
    goals: "grape",
    projects: "indigo",
    actions: "teal",
    general: "gray",
  };

  if (messagesLoading && !messageHistory) {
    return (
      <Container size="lg" py="xl">
        <Center py="xl">
          <Loader size="lg" />
        </Center>
      </Container>
    );
  }

  return (
    <Container size="lg" py="xl">
      <Stack gap="lg">
        <Group justify="space-between" align="center">
          <Group align="center" gap="sm">
            <IconMessage size={32} />
            <Title order={1}>Slack Messages</Title>
          </Group>
        </Group>

        {/* Stats Cards */}
        {stats && (
          <Grid>
            <Grid.Col span={{ base: 12, md: 3 }}>
              <Paper p="md" withBorder>
                <Text size="sm" c="dimmed">Total Messages</Text>
                <Text size="xl" fw={700}>{stats.totalMessages}</Text>
              </Paper>
            </Grid.Col>
            <Grid.Col span={{ base: 12, md: 3 }}>
              <Paper p="md" withBorder>
                <Text size="sm" c="dimmed">Error Messages</Text>
                <Text size="xl" fw={700} c={stats.errorCount > 0 ? "red" : "green"}>
                  {stats.errorCount}
                </Text>
              </Paper>
            </Grid.Col>
            <Grid.Col span={{ base: 12, md: 6 }}>
              <Paper p="md" withBorder>
                <Text size="sm" c="dimmed" mb="xs">Channel Types</Text>
                <Group gap="xs">
                  {stats.channelBreakdown.map((channel) => (
                    <Badge key={channel.channelType} color={channelTypeColors[channel.channelType] || "gray"}>
                      {channel.channelType}: {channel.count}
                    </Badge>
                  ))}
                </Group>
              </Paper>
            </Grid.Col>
          </Grid>
        )}

        {/* Filters */}
        <Paper p="md" withBorder>
          <Group align="end" gap="md">
            <TextInput
              placeholder="Search messages..."
              leftSection={<IconSearch size={16} />}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ flex: 1 }}
            />
            <Select
              placeholder="Filter by category"
              data={[
                { value: "", label: "All categories" },
                ...categoryOptions,
              ]}
              value={selectedCategory || ""}
              onChange={(value) => setSelectedCategory(value || null)}
              leftSection={<IconFilter size={16} />}
              clearable
            />
            <TextInput
              placeholder="Channel ID"
              value={selectedChannelId}
              onChange={(e) => setSelectedChannelId(e.target.value)}
              style={{ minWidth: "200px" }}
            />
          </Group>
        </Paper>

        {/* Messages List */}
        <Stack gap="md">
          {filteredMessages.length === 0 && !messagesLoading ? (
            <Alert icon={<IconAlertCircle size="1rem" />} title="No messages found">
              {searchTerm || selectedCategory || selectedChannelId 
                ? "Try adjusting your filters to see more messages."
                : "No Slack messages have been recorded yet."}
            </Alert>
          ) : (
            filteredMessages.map((message) => (
              <Card key={message.id} withBorder padding="md" radius="md">
                <Stack gap="sm">
                  {/* Header */}
                  <Group justify="space-between" align="flex-start">
                    <Group gap="sm">
                      <Badge color={channelTypeColors[message.channelType] || "gray"}>
                        {message.channelType}
                      </Badge>
                      {message.category && (
                        <Badge color={categoryColors[message.category] || "gray"} variant="light">
                          {message.category}
                        </Badge>
                      )}
                      {message.messageType && (
                        <Badge variant="outline" color="dark">
                          {message.messageType}
                        </Badge>
                      )}
                      {message.hadError && (
                        <Badge color="red" variant="filled">
                          Error
                        </Badge>
                      )}
                    </Group>
                    <Text size="sm" c="dimmed">
                      {formatDistanceToNow(new Date(message.createdAt), { addSuffix: true })}
                    </Text>
                  </Group>

                  {/* Message Content */}
                  <div>
                    <Text size="sm" fw={500} c="dimmed" mb="xs">
                      {message.userName || message.slackUserId} • Channel: {message.channelId}
                    </Text>
                    <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>
                      {message.cleanMessage || message.rawMessage}
                    </Text>
                  </div>

                  {/* AI Response Info */}
                  {(message.agentUsed || message.responseTime || message.intent) && (
                    <>
                      <Divider />
                      <Group gap="sm" align="center">
                        {message.agentUsed && (
                          <Text size="xs" c="dimmed">
                            <strong>Agent:</strong> {message.agentUsed}
                          </Text>
                        )}
                        {message.responseTime && (
                          <Text size="xs" c="dimmed">
                            <strong>Response Time:</strong> {message.responseTime}ms
                          </Text>
                        )}
                        {message.intent && (
                          <Text size="xs" c="dimmed">
                            <strong>Intent:</strong> {message.intent}
                          </Text>
                        )}
                      </Group>
                    </>
                  )}

                  {/* Error Message */}
                  {message.hadError && message.errorMessage && (
                    <>
                      <Divider />
                      <Alert color="red" variant="light">
                        <Text size="sm">{message.errorMessage}</Text>
                      </Alert>
                    </>
                  )}
                </Stack>
              </Card>
            ))
          )}
        </Stack>

        {/* Load More Button */}
        {hasNextPage && (
          <Center>
            <Button 
              variant="light" 
              onClick={() => fetchNextPage()}
              loading={messagesLoading}
            >
              Load More Messages
            </Button>
          </Center>
        )}
      </Stack>
    </Container>
  );
}