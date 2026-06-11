"use client";

import { useState } from "react";
import {
  Badge,
  Card,
  Group,
  Paper,
  Progress,
  Select,
  SimpleGrid,
  Skeleton,
  Stack,
  Table,
  Text,
  Title,
  Tooltip,
} from "@mantine/core";
import {
  IconGavel,
  IconRoute,
  IconAlertTriangle,
  IconVersions,
} from "@tabler/icons-react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "~/trpc/react";

/**
 * Thread-score analytics (ADR-0012 Phase 2). Everything on this panel is the
 * LLM JUDGE's apparent-quality verdict — deliberately labelled apart from
 * the human Feedback rating (ground truth, shown in the Feedback overview
 * above) and from Zoe's self-reported confidence. The three are never
 * blended into one number.
 */

const LANE_COLORS: Record<string, string> = {
  code_bug: "red",
  agent_behaviour: "orange",
  capability_gap: "blue",
  passing: "green",
};

const AGENT_LINE_VARS = [
  "var(--color-brand-info)",
  "var(--color-brand-success)",
  "var(--color-brand-warning)",
  "var(--color-brand-secondary)",
  "var(--color-brand-error)",
];

function LaneBadge({ lane }: { lane: string | null }) {
  if (lane === null) return null;
  return (
    <Badge color={LANE_COLORS[lane] ?? "gray"} size="sm" variant="light">
      {lane}
    </Badge>
  );
}

function AxisBadge({ label, passed }: { label: string; passed: boolean }) {
  return (
    <Badge color={passed ? "green" : "red"} size="xs" variant="outline">
      {passed ? "✓" : "✗"} {label}
    </Badge>
  );
}

export function ThreadScoreAnalytics() {
  const [days, setDays] = useState(30);
  const { data: analytics, isLoading: analyticsLoading } =
    api.admin.getThreadScoreAnalytics.useQuery({ days });
  const { data: worstThreads, isLoading: worstLoading } =
    api.admin.getWorstThreads.useQuery({ days, limit: 10 });

  // One chart row per day: overall + one key per agent series.
  const chartData =
    analytics?.trend.overall.map((point, i) => {
      const row: Record<string, string | number | null> = {
        date: point.date.slice(5), // MM-DD
        overall: point.avgScore,
      };
      for (const series of analytics.trend.byAgent) {
        row[series.agentId] = series.points[i]?.avgScore ?? null;
      }
      return row;
    }) ?? [];

  const totalScored = analytics?.summary.scoredThreads ?? 0;

  return (
    <div className="space-y-6">
      <Group justify="space-between" align="flex-end">
        <div>
          <Title order={2} className="text-text-primary">
            Thread Scores (LLM judge)
          </Title>
          <Text className="text-text-muted">
            Apparent quality judged against Zoe&apos;s contract — distinct from
            the human ratings above (ground truth) and from Zoe&apos;s
            self-reported confidence
          </Text>
        </div>
        <Select
          value={String(days)}
          onChange={(v) => setDays(Number(v ?? 30))}
          data={[
            { value: "7", label: "Last 7 days" },
            { value: "30", label: "Last 30 days" },
            { value: "90", label: "Last 90 days" },
          ]}
          w={150}
        />
      </Group>

      {/* Summary cards */}
      <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
        <Card className="border border-border-primary bg-surface-secondary">
          <Group gap="md">
            <div className="rounded-lg bg-background-primary p-3">
              <IconGavel size={24} className="text-text-muted" />
            </div>
            <div>
              <Text size="sm" className="text-text-muted">
                Avg judge score
              </Text>
              {analyticsLoading ? (
                <Skeleton height={28} width={80} mt={4} />
              ) : (
                <Group gap="xs" align="baseline">
                  <Title order={3} className="text-text-primary">
                    {analytics?.summary.avgScore ?? "—"}
                  </Title>
                  <Text size="sm" className="text-text-muted">
                    /100
                  </Text>
                </Group>
              )}
            </div>
          </Group>
        </Card>

        <Card className="border border-border-primary bg-surface-secondary">
          <Group gap="md">
            <div className="rounded-lg bg-background-primary p-3">
              <IconRoute size={24} className="text-text-muted" />
            </div>
            <div>
              <Text size="sm" className="text-text-muted">
                Threads scored
              </Text>
              {analyticsLoading ? (
                <Skeleton height={28} width={80} mt={4} />
              ) : (
                <Title order={3} className="text-text-primary">
                  {totalScored}
                </Title>
              )}
            </div>
          </Group>
        </Card>

        <Card className="border border-border-primary bg-surface-secondary">
          <Group gap="md">
            <div className="rounded-lg bg-background-primary p-3">
              <IconAlertTriangle size={24} className="text-text-muted" />
            </div>
            <div>
              <Text size="sm" className="text-text-muted">
                Failing Threads
              </Text>
              {analyticsLoading ? (
                <Skeleton height={28} width={80} mt={4} />
              ) : (
                <Title order={3} className="text-text-primary">
                  {analytics?.summary.failureCount ?? 0}
                </Title>
              )}
            </div>
          </Group>
        </Card>
      </SimpleGrid>

      {/* Trend + lane breakdown */}
      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="md">
        <Card className="border border-border-primary bg-surface-secondary">
          <Title order={4} className="mb-4 text-text-primary">
            Judge-score trend
          </Title>
          {analyticsLoading ? (
            <Skeleton height={260} />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-primary)" />
                <XAxis dataKey="date" stroke="var(--color-text-muted)" />
                <YAxis domain={[0, 100]} stroke="var(--color-text-muted)" />
                <ChartTooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="overall"
                  name="Overall"
                  stroke="var(--color-brand-primary)"
                  strokeWidth={2}
                  connectNulls
                />
                {analytics?.trend.byAgent.map((series, i) => (
                  <Line
                    key={series.agentId}
                    type="monotone"
                    dataKey={series.agentId}
                    name={series.agentId}
                    stroke={AGENT_LINE_VARS[i % AGENT_LINE_VARS.length]}
                    strokeDasharray="4 2"
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card className="border border-border-primary bg-surface-secondary">
          <Title order={4} className="mb-4 text-text-primary">
            Failure-lane breakdown
          </Title>
          {analyticsLoading ? (
            <Stack gap="xs">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} height={24} />
              ))}
            </Stack>
          ) : (analytics?.laneBreakdown.length ?? 0) === 0 ? (
            <Text className="text-text-muted">No Threads scored yet</Text>
          ) : (
            <Stack gap="sm">
              {analytics?.laneBreakdown.map((entry) => (
                <Group key={entry.lane} gap="xs" className="w-full">
                  <div className="w-36">
                    <LaneBadge lane={entry.lane} />
                  </div>
                  <Progress
                    value={totalScored > 0 ? (entry.count / totalScored) * 100 : 0}
                    size="sm"
                    className="flex-1"
                    color={LANE_COLORS[entry.lane] ?? "gray"}
                  />
                  <Text size="xs" className="w-24 text-right text-text-muted">
                    {entry.count} · avg {entry.avgScore ?? "—"}
                  </Text>
                </Group>
              ))}
            </Stack>
          )}
        </Card>
      </SimpleGrid>

      {/* Prompt-version breakdown */}
      <Card className="border border-border-primary bg-surface-secondary">
        <Group gap="xs" className="mb-4">
          <IconVersions size={20} className="text-text-muted" />
          <Title order={4} className="text-text-primary">
            Score by Prompt version
          </Title>
          <Text size="xs" className="text-text-muted">
            (the proof a prompt change helped — ADR-0012)
          </Text>
        </Group>
        {analyticsLoading ? (
          <Skeleton height={120} />
        ) : (analytics?.promptVersions.length ?? 0) === 0 ? (
          <Text className="text-text-muted">No stamped Threads yet</Text>
        ) : (
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Prompt version</Table.Th>
                <Table.Th>Threads</Table.Th>
                <Table.Th>Avg judge score</Table.Th>
                <Table.Th>Failures</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {analytics?.promptVersions.map((entry) => (
                <Table.Tr key={entry.promptVersion}>
                  <Table.Td>
                    <Text size="sm" className="font-mono text-text-primary">
                      {entry.promptVersion}
                    </Text>
                  </Table.Td>
                  <Table.Td>{entry.count}</Table.Td>
                  <Table.Td>{entry.avgScore ?? "—"}/100</Table.Td>
                  <Table.Td>{entry.failureCount}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Card>

      {/* Worst-Thread drilldown */}
      <Card className="border border-border-primary bg-surface-secondary">
        <Group gap="xs" className="mb-4">
          <IconAlertTriangle size={20} className="text-text-muted" />
          <Title order={4} className="text-text-primary">
            Worst Threads
          </Title>
        </Group>
        {worstLoading ? (
          <Stack gap="sm">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} height={80} />
            ))}
          </Stack>
        ) : worstThreads?.length === 0 ? (
          <Text className="text-text-muted">No Threads scored yet</Text>
        ) : (
          <Stack gap="sm">
            {worstThreads?.map((thread) => (
              <Paper
                key={thread.conversationId}
                className="border border-border-primary bg-background-primary p-3"
              >
                <Group justify="space-between" mb="xs">
                  <Group gap="xs">
                    <Tooltip label="LLM judge score (apparent quality)">
                      <Badge color={thread.overallScore >= 60 ? "yellow" : "red"} size="sm">
                        Judge {thread.overallScore}/100
                      </Badge>
                    </Tooltip>
                    <LaneBadge lane={thread.failureLane} />
                    <Text size="xs" className="text-text-muted">
                      {thread.agentId ?? "unknown agent"} · {thread.turnCount} turn
                      {thread.turnCount !== 1 ? "s" : ""}
                    </Text>
                  </Group>
                  <Group gap="xs">
                    <Tooltip label="Human Feedback rating (ground truth)">
                      <Badge color="grape" size="sm" variant="light">
                        Human{" "}
                        {thread.humanRating !== null
                          ? `${thread.humanRating.toFixed(1)}★ (${thread.humanRatingCount})`
                          : "unrated"}
                      </Badge>
                    </Tooltip>
                    <Tooltip label="Zoe's self-reported confidence">
                      <Badge color="cyan" size="sm" variant="light">
                        Confidence{" "}
                        {thread.avgConfidence !== null
                          ? thread.avgConfidence.toFixed(2)
                          : "—"}
                      </Badge>
                    </Tooltip>
                  </Group>
                </Group>
                <Group gap="xs" mb="xs">
                  <AxisBadge label="Resolved" passed={thread.axes.resolved} />
                  <AxisBadge label="Grounded" passed={thread.axes.grounded} />
                  <AxisBadge label="Tool success" passed={thread.axes.toolSuccess} />
                  <AxisBadge label="No deflection" passed={thread.axes.noDeflection} />
                </Group>
                <Text size="sm" className="text-text-secondary" lineClamp={3}>
                  {thread.reasoning}
                </Text>
                {thread.expectation && (
                  <Text size="xs" className="mt-1 text-text-muted" lineClamp={2}>
                    Expectation: {thread.expectation}
                  </Text>
                )}
                <Group gap="xs" mt="xs">
                  <Text size="xs" className="font-mono text-text-muted">
                    {thread.conversationId}
                  </Text>
                  {thread.promptVersion && (
                    <Text size="xs" className="font-mono text-text-muted">
                      · {thread.promptVersion}
                    </Text>
                  )}
                </Group>
              </Paper>
            ))}
          </Stack>
        )}
      </Card>
    </div>
  );
}
