"use client";

import {
  Card,
  SimpleGrid,
  Text,
  Title,
  Skeleton,
  Progress,
  Paper,
  Group,
  Badge,
  Stack,
} from "@mantine/core";
import { IconStar, IconTrendingUp, IconAlertTriangle } from "@tabler/icons-react";
import { api } from "~/trpc/react";

function RatingBar({
  rating,
  count,
  total,
}: {
  rating: number;
  count: number;
  total: number;
}) {
  const percentage = total > 0 ? (count / total) * 100 : 0;

  return (
    <Group gap="xs" className="w-full">
      <Text size="sm" className="w-6 text-text-muted">
        {rating}★
      </Text>
      <Progress
        value={percentage}
        size="sm"
        className="flex-1"
        color={rating >= 4 ? "green" : rating >= 3 ? "yellow" : "red"}
      />
      <Text size="xs" className="w-8 text-right text-text-muted">
        {count}
      </Text>
    </Group>
  );
}

export function FeedbackDashboard() {
  const { data: stats, isLoading: statsLoading } =
    api.feedback.getAgentFeedbackStats.useQuery();
  const { data: lowRated, isLoading: lowRatedLoading } =
    api.feedback.getLowRatedFeedback.useQuery({ limit: 5 });

  const totalRatings =
    stats?.distribution.reduce((sum, d) => sum + d.count, 0) ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <Title order={2} className="text-text-primary">
          Feedback Overview
        </Title>
        <Text className="text-text-muted">
          Monitor agent response quality and user satisfaction
        </Text>
      </div>

      {/* Stats Cards */}
      <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
        <Card className="border border-border-primary bg-surface-secondary">
          <Group gap="md">
            <div className="rounded-lg bg-background-primary p-3">
              <IconStar size={24} className="text-yellow-500" />
            </div>
            <div>
              <Text size="sm" className="text-text-muted">
                Today
              </Text>
              {statsLoading ? (
                <Skeleton height={28} width={80} mt={4} />
              ) : (
                <Group gap="xs" align="baseline">
                  <Title order={3} className="text-text-primary">
                    {stats?.today.avgRating.toFixed(1) ?? "—"}
                  </Title>
                  <Text size="sm" className="text-text-muted">
                    ({stats?.today.count ?? 0} ratings)
                  </Text>
                </Group>
              )}
            </div>
          </Group>
        </Card>

        <Card className="border border-border-primary bg-surface-secondary">
          <Group gap="md">
            <div className="rounded-lg bg-background-primary p-3">
              <IconTrendingUp size={24} className="text-blue-500" />
            </div>
            <div>
              <Text size="sm" className="text-text-muted">
                This Week
              </Text>
              {statsLoading ? (
                <Skeleton height={28} width={80} mt={4} />
              ) : (
                <Group gap="xs" align="baseline">
                  <Title order={3} className="text-text-primary">
                    {stats?.week.avgRating.toFixed(1) ?? "—"}
                  </Title>
                  <Text size="sm" className="text-text-muted">
                    ({stats?.week.count ?? 0} ratings)
                  </Text>
                </Group>
              )}
            </div>
          </Group>
        </Card>

        <Card className="border border-border-primary bg-surface-secondary">
          <Group gap="md">
            <div className="rounded-lg bg-background-primary p-3">
              <IconStar size={24} className="text-text-muted" />
            </div>
            <div>
              <Text size="sm" className="text-text-muted">
                All Time
              </Text>
              {statsLoading ? (
                <Skeleton height={28} width={80} mt={4} />
              ) : (
                <Group gap="xs" align="baseline">
                  <Title order={3} className="text-text-primary">
                    {stats?.allTime.avgRating.toFixed(1) ?? "—"}
                  </Title>
                  <Text size="sm" className="text-text-muted">
                    ({stats?.allTime.count ?? 0} ratings)
                  </Text>
                </Group>
              )}
            </div>
          </Group>
        </Card>
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="md">
        {/* Rating Distribution */}
        <Card className="border border-border-primary bg-surface-secondary">
          <Title order={4} className="mb-4 text-text-primary">
            Rating Distribution
          </Title>
          {statsLoading ? (
            <Stack gap="xs">
              {[5, 4, 3, 2, 1].map((r) => (
                <Skeleton key={r} height={20} />
              ))}
            </Stack>
          ) : (
            <Stack gap="xs">
              {[5, 4, 3, 2, 1].map((rating) => {
                const item = stats?.distribution.find((d) => d.rating === rating);
                return (
                  <RatingBar
                    key={rating}
                    rating={rating}
                    count={item?.count ?? 0}
                    total={totalRatings}
                  />
                );
              })}
            </Stack>
          )}
        </Card>

        {/* Low Rated Feedback */}
        <Card className="border border-border-primary bg-surface-secondary">
          <Group gap="xs" className="mb-4">
            <IconAlertTriangle size={20} className="text-red-500" />
            <Title order={4} className="text-text-primary">
              Recent Low Ratings
            </Title>
          </Group>

          {lowRatedLoading ? (
            <Stack gap="sm">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} height={60} />
              ))}
            </Stack>
          ) : lowRated?.length === 0 ? (
            <Text className="text-text-muted">No low ratings yet!</Text>
          ) : (
            <Stack gap="sm">
              {lowRated?.map((feedback) => (
                <Paper
                  key={feedback.id}
                  className="border border-border-primary bg-background-primary p-3"
                >
                  <Group justify="space-between" mb="xs">
                    <Group gap="xs">
                      <Badge color="red" size="sm">
                        {feedback.rating}★
                      </Badge>
                      <Text size="xs" className="text-text-muted">
                        {feedback.aiInteraction?.agentName ?? "Unknown Agent"}
                      </Text>
                    </Group>
                    <Text size="xs" className="text-text-muted">
                      {new Date(feedback.createdAt).toLocaleDateString()}
                    </Text>
                  </Group>
                  {feedback.content && (
                    <Text size="sm" className="text-text-secondary" lineClamp={2}>
                      {feedback.content}
                    </Text>
                  )}
                  {feedback.aiInteraction?.userMessage && (
                    <Text
                      size="xs"
                      className="mt-1 text-text-muted"
                      lineClamp={1}
                    >
                      Query: {feedback.aiInteraction.userMessage}
                    </Text>
                  )}
                </Paper>
              ))}
            </Stack>
          )}
        </Card>
      </SimpleGrid>
    </div>
  );
}
