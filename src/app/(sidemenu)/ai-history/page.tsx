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
  Modal,
  ScrollArea,
  Tabs,
  Progress,
  ActionIcon,
  Tooltip,
} from "@mantine/core";
import { 
  IconBrain, 
  IconAlertCircle, 
  IconSearch, 
  IconFilter, 
  IconMessageDots,
  IconRobot,
  IconClock,
  IconError404,
  IconEye,
  IconChartBar,
  IconMessages,
  IconTrendingUp,
  IconBrandSlack,
  IconMessage2,
} from "@tabler/icons-react";
import { api } from "~/trpc/react";
import { formatDistanceToNow } from "date-fns";
import { useDisclosure } from "@mantine/hooks";

export default function AiHistoryPage() {
  const [selectedPlatform, setSelectedPlatform] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedInteraction, setSelectedInteraction] = useState<any>(null);
  const [modalOpened, { open: openModal, close: closeModal }] = useDisclosure(false);

  const { data: interactionHistory, isLoading: historyLoading, fetchNextPage, hasNextPage } = 
    api.aiInteraction.getInteractionHistory.useInfiniteQuery(
      {
        limit: 20,
        ...(selectedPlatform && { platform: selectedPlatform as any }),
        ...(selectedProject && { projectId: selectedProject }),
      },
      {
        getNextPageParam: (lastPage) => lastPage.nextCursor,
      }
    );

  const { data: stats } = api.aiInteraction.getInteractionStats.useQuery({
    ...(selectedPlatform && { platform: selectedPlatform as any }),
    ...(selectedProject && { projectId: selectedProject }),
  });

  const { data: filterOptions } = api.aiInteraction.getFilterOptions.useQuery();

  const allInteractions = interactionHistory?.pages.flatMap((page) => page.interactions) ?? [];

  const filteredInteractions = allInteractions.filter((interaction) =>
    searchTerm === "" || 
    interaction.userMessage.toLowerCase().includes(searchTerm.toLowerCase()) ||
    interaction.aiResponse.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (interaction.agentName && interaction.agentName.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const platformColors: Record<string, string> = {
    slack: "blue",
    manychat: "green",
    api: "orange",
    webhook: "purple",
    direct: "gray",
  };

  const platformIcons: Record<string, React.ReactNode> = {
    slack: <IconBrandSlack size={14} />,
    manychat: <IconMessage2 size={14} />,
    api: <IconRobot size={14} />,
    webhook: <IconMessages size={14} />,
    direct: <IconMessageDots size={14} />,
  };

  const categoryColors: Record<string, string> = {
    goals: "grape",
    projects: "indigo",
    actions: "teal",
    general: "gray",
  };

  const openInteractionModal = (interaction: any) => {
    setSelectedInteraction(interaction);
    openModal();
  };

  if (historyLoading && !interactionHistory) {
    return (
      <Container size="xl" py="xl">
        <Center py="xl">
          <Loader size="lg" />
        </Center>
      </Container>
    );
  }

  return (
    <Container size="xl" py="xl">
      <Stack gap="lg">
        <Group justify="space-between" align="center">
          <Group align="center" gap="sm">
            <IconBrain size={32} />
            <Title order={1}>AI Interaction History</Title>
          </Group>
        </Group>

        <Tabs defaultValue="overview">
          <Tabs.List>
            <Tabs.Tab value="overview" leftSection={<IconChartBar size={16} />}>
              Overview
            </Tabs.Tab>
            <Tabs.Tab value="interactions" leftSection={<IconMessages size={16} />}>
              Interactions
            </Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="overview" pt="md">
            {/* Stats Cards */}
            {stats && (
              <Grid mb="lg">
                <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
                  <Paper p="md" withBorder>
                    <Group justify="space-between">
                      <div>
                        <Text size="sm" c="dimmed">Total Interactions</Text>
                        <Text size="xl" fw={700}>{stats.totalInteractions}</Text>
                      </div>
                      <IconMessages size={24} color="var(--mantine-color-blue-6)" />
                    </Group>
                  </Paper>
                </Grid.Col>
                <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
                  <Paper p="md" withBorder>
                    <Group justify="space-between">
                      <div>
                        <Text size="sm" c="dimmed">Error Rate</Text>
                        <Text size="xl" fw={700} c={stats.errorRate > 5 ? "red" : "green"}>
                          {stats.errorRate.toFixed(1)}%
                        </Text>
                      </div>
                      <IconError404 size={24} color={stats.errorRate > 5 ? "var(--mantine-color-red-6)" : "var(--mantine-color-green-6)"} />
                    </Group>
                    <Progress value={stats.errorRate} color={stats.errorRate > 5 ? "red" : "green"} size="sm" mt="xs" />
                  </Paper>
                </Grid.Col>
                <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
                  <Paper p="md" withBorder>
                    <Group justify="space-between">
                      <div>
                        <Text size="sm" c="dimmed">Avg Response Time</Text>
                        <Text size="xl" fw={700}>
                          {stats.averageResponseTime ? `${Math.round(stats.averageResponseTime)}ms` : "N/A"}
                        </Text>
                      </div>
                      <IconClock size={24} color="var(--mantine-color-orange-6)" />
                    </Group>
                  </Paper>
                </Grid.Col>
                <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
                  <Paper p="md" withBorder>
                    <Group justify="space-between">
                      <div>
                        <Text size="sm" c="dimmed">Active Platforms</Text>
                        <Text size="xl" fw={700}>{stats.platformBreakdown.length}</Text>
                      </div>
                      <IconTrendingUp size={24} color="var(--mantine-color-grape-6)" />
                    </Group>
                  </Paper>
                </Grid.Col>
              </Grid>
            )}

            {/* Platform Breakdown */}
            {stats && (
              <Grid>
                <Grid.Col span={{ base: 12, md: 6 }}>
                  <Paper p="md" withBorder>
                    <Text size="sm" c="dimmed" mb="md">Platform Breakdown</Text>
                    <Stack gap="xs">
                      {stats.platformBreakdown.map((platform) => (
                        <Group key={platform.platform} justify="space-between">
                          <Group gap="xs">
                            {platformIcons[platform.platform]}
                            <Text size="sm" tt="capitalize">{platform.platform}</Text>
                          </Group>
                          <Badge color={platformColors[platform.platform] || "gray"}>
                            {platform.count}
                          </Badge>
                        </Group>
                      ))}
                    </Stack>
                  </Paper>
                </Grid.Col>
                <Grid.Col span={{ base: 12, md: 6 }}>
                  <Paper p="md" withBorder>
                    <Text size="sm" c="dimmed" mb="md">Top AI Agents</Text>
                    <Stack gap="xs">
                      {stats.agentBreakdown.slice(0, 5).map((agent) => (
                        <Group key={agent.agentName} justify="space-between">
                          <Group gap="xs">
                            <IconRobot size={14} />
                            <Text size="sm">{agent.agentName || "Unknown"}</Text>
                          </Group>
                          <Badge variant="light">
                            {agent.count}
                          </Badge>
                        </Group>
                      ))}
                    </Stack>
                  </Paper>
                </Grid.Col>
              </Grid>
            )}
          </Tabs.Panel>

          <Tabs.Panel value="interactions" pt="md">
            {/* Filters */}
            <Paper p="md" withBorder mb="md">
              <Grid align="end">
                <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
                  <TextInput
                    placeholder="Search messages..."
                    leftSection={<IconSearch size={16} />}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </Grid.Col>
                <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
                  <Select
                    placeholder="Filter by platform"
                    data={[
                      { value: "", label: "All platforms" },
                      ...(filterOptions?.platforms.map(p => ({
                        value: p.platform,
                        label: `${p.platform} (${p.count})`,
                      })) || []),
                    ]}
                    value={selectedPlatform || ""}
                    onChange={(value) => setSelectedPlatform(value || null)}
                    leftSection={<IconFilter size={16} />}
                    clearable
                  />
                </Grid.Col>
                <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
                  <Select
                    placeholder="Filter by agent"
                    data={[
                      { value: "", label: "All agents" },
                      ...(filterOptions?.agents.map(a => ({
                        value: a.agentName,
                        label: `${a.agentName} (${a.count})`,
                      })) || []),
                    ]}
                    value={selectedAgent || ""}
                    onChange={(value) => setSelectedAgent(value || null)}
                    clearable
                  />
                </Grid.Col>
                <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
                  <Select
                    placeholder="Filter by project"
                    data={[
                      { value: "", label: "All projects" },
                      ...(filterOptions?.projects.map(p => ({
                        value: p.projectId,
                        label: `Project (${p.count})`,
                      })) || []),
                    ]}
                    value={selectedProject || ""}
                    onChange={(value) => setSelectedProject(value || null)}
                    clearable
                  />
                </Grid.Col>
              </Grid>
            </Paper>

            {/* Interactions List */}
            <Stack gap="md">
              {filteredInteractions.length === 0 && !historyLoading ? (
                <Alert icon={<IconAlertCircle size="1rem" />} title="No interactions found">
                  {searchTerm || selectedPlatform || selectedAgent || selectedProject
                    ? "Try adjusting your filters to see more interactions."
                    : "No AI interactions have been recorded yet."}
                </Alert>
              ) : (
                filteredInteractions.map((interaction) => (
                  <Card key={interaction.id} withBorder padding="md" radius="md">
                    <Stack gap="sm">
                      {/* Header */}
                      <Group justify="space-between" align="flex-start">
                        <Group gap="sm">
                          <Badge color={platformColors[interaction.platform] || "gray"}>
                            {platformIcons[interaction.platform]}
                            <span style={{ marginLeft: "4px", textTransform: "capitalize" }}>
                              {interaction.platform}
                            </span>
                          </Badge>
                          {interaction.category && (
                            <Badge color={categoryColors[interaction.category] || "gray"} variant="light">
                              {interaction.category}
                            </Badge>
                          )}
                          {interaction.messageType && (
                            <Badge variant="outline" color="dark">
                              {interaction.messageType}
                            </Badge>
                          )}
                          {interaction.hadError && (
                            <Badge color="red" variant="filled">
                              Error
                            </Badge>
                          )}
                        </Group>
                        <Group gap="xs">
                          <Text size="sm" c="dimmed">
                            {formatDistanceToNow(new Date(interaction.createdAt), { addSuffix: true })}
                          </Text>
                          <Tooltip label="View details">
                            <ActionIcon
                              variant="subtle"
                              onClick={() => openInteractionModal(interaction)}
                            >
                              <IconEye size={16} />
                            </ActionIcon>
                          </Tooltip>
                        </Group>
                      </Group>

                      {/* Message Preview */}
                      <div>
                        <Text size="sm" fw={500} c="dimmed" mb="xs">
                          <Group gap="xs">
                            <IconRobot size={12} />
                            {interaction.agentName || "AI Agent"}
                            {interaction.responseTime && (
                              <Text size="xs" c="dimmed">
                                • {interaction.responseTime}ms
                              </Text>
                            )}
                          </Group>
                        </Text>
                        <Text size="sm" lineClamp={2} style={{ whiteSpace: "pre-wrap" }}>
                          <strong>Q:</strong> {interaction.userMessage}
                        </Text>
                        <Text size="sm" c="dimmed" lineClamp={2} style={{ whiteSpace: "pre-wrap" }} mt="xs">
                          <strong>A:</strong> {interaction.aiResponse}
                        </Text>
                      </div>
                    </Stack>
                  </Card>
                ))
              )}
            </Stack>

            {/* Load More Button */}
            {hasNextPage && (
              <Center mt="lg">
                <Button 
                  variant="light" 
                  onClick={() => fetchNextPage()}
                  loading={historyLoading}
                >
                  Load More Interactions
                </Button>
              </Center>
            )}
          </Tabs.Panel>
        </Tabs>

        {/* Interaction Detail Modal */}
        <Modal
          opened={modalOpened}
          onClose={closeModal}
          title={
            <Group gap="sm">
              <IconBrain size={20} />
              <Text fw={500}>Interaction Details</Text>
            </Group>
          }
          size="lg"
        >
          {selectedInteraction && (
            <Stack gap="md">
              {/* Metadata */}
              <Group gap="sm" wrap="wrap">
                <Badge color={platformColors[selectedInteraction.platform] || "gray"}>
                  {platformIcons[selectedInteraction.platform]}
                  <span style={{ marginLeft: "4px", textTransform: "capitalize" }}>
                    {selectedInteraction.platform}
                  </span>
                </Badge>
                {selectedInteraction.agentName && (
                  <Badge variant="light">
                    <IconRobot size={12} style={{ marginRight: "4px" }} />
                    {selectedInteraction.agentName}
                  </Badge>
                )}
                {selectedInteraction.responseTime && (
                  <Badge variant="outline">
                    <IconClock size={12} style={{ marginRight: "4px" }} />
                    {selectedInteraction.responseTime}ms
                  </Badge>
                )}
                {selectedInteraction.hadError && (
                  <Badge color="red">Error</Badge>
                )}
              </Group>

              <Divider />

              {/* Messages */}
              <div>
                <Text fw={500} mb="sm">User Message</Text>
                <Paper p="sm" bg="var(--mantine-color-blue-light)">
                  <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>
                    {selectedInteraction.userMessage}
                  </Text>
                </Paper>
              </div>

              <div>
                <Text fw={500} mb="sm">AI Response</Text>
                <Paper p="sm" bg="var(--mantine-color-gray-light)">
                  <ScrollArea.Autosize mah={300}>
                    <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>
                      {selectedInteraction.aiResponse}
                    </Text>
                  </ScrollArea.Autosize>
                </Paper>
              </div>

              {/* Tools and Actions */}
              {(selectedInteraction.toolsUsed?.length > 0 || selectedInteraction.actionsTaken?.length > 0) && (
                <>
                  <Divider />
                  {selectedInteraction.toolsUsed?.length > 0 && (
                    <div>
                      <Text fw={500} mb="sm">Tools Used</Text>
                      <Group gap="xs">
                        {selectedInteraction.toolsUsed.map((tool: string, index: number) => (
                          <Badge key={index} variant="light" color="teal">
                            {tool}
                          </Badge>
                        ))}
                      </Group>
                    </div>
                  )}
                  {selectedInteraction.actionsTaken?.length > 0 && (
                    <div>
                      <Text fw={500} mb="sm">Actions Taken</Text>
                      <Stack gap="xs">
                        {selectedInteraction.actionsTaken.map((action: any, index: number) => (
                          <Group key={index} justify="space-between">
                            <Text size="sm">{action.action}</Text>
                            <Badge color={action.result === "success" ? "green" : "red"}>
                              {action.result}
                            </Badge>
                          </Group>
                        ))}
                      </Stack>
                    </div>
                  )}
                </>
              )}

              {/* Error Details */}
              {selectedInteraction.hadError && selectedInteraction.errorMessage && (
                <>
                  <Divider />
                  <Alert color="red" variant="light" title="Error Details">
                    <Text size="sm">{selectedInteraction.errorMessage}</Text>
                  </Alert>
                </>
              )}

              {/* Technical Details */}
              <Divider />
              <Group justify="space-between">
                <Text size="xs" c="dimmed">
                  {new Date(selectedInteraction.createdAt).toLocaleString()}
                </Text>
                <Text size="xs" c="dimmed">
                  ID: {selectedInteraction.id}
                </Text>
              </Group>
            </Stack>
          )}
        </Modal>
      </Stack>
    </Container>
  );
}