'use client';

import { Card, Text, Stack, Group, RingProgress, Badge, Tooltip } from '@mantine/core';
import { IconTarget } from '@tabler/icons-react';
import { api } from '~/trpc/react';
import Link from 'next/link';

interface LifeBalanceWidgetProps {
  workspaceId?: string;
}

// Map life domain to colors
const domainColors: Record<string, string> = {
  'Health': 'green',
  'Career': 'blue',
  'Relationships': 'pink',
  'Finance': 'yellow',
  'Growth': 'violet',
  'Spirituality': 'cyan',
  'Fun': 'orange',
  'Environment': 'teal',
};

export function LifeBalanceWidget({ workspaceId: _workspaceId }: LifeBalanceWidgetProps) {
  // _workspaceId reserved for future workspace-scoped filtering
  const { data: latestAssessment, isLoading } = api.wheelOfLife.getLatestAssessment.useQuery();
  const { data: lifeDomains } = api.wheelOfLife.getLifeDomains.useQuery();
  const { data: quarterlyDue } = api.wheelOfLife.checkQuarterlyDue.useQuery();

  // Get scores from the latest assessment
  const scores = latestAssessment?.scores ?? [];

  // Find domains that need attention (low scores or big gaps)
  const domainsNeedingAttention = scores
    .filter(score => {
      const gap = (score.desiredRank ?? 0) - (score.currentRank ?? 0);
      return score.currentRank <= 4 || gap >= 4;
    })
    .slice(0, 2);

  // Calculate overall balance score (average of current ranks)
  const overallScore = scores.length > 0
    ? Math.round(scores.reduce((sum, s) => sum + (s.currentRank ?? 0), 0) / scores.length * 10)
    : 0;

  if (isLoading) {
    return (
      <Card withBorder radius="md" className="border-border-primary bg-surface-secondary">
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-surface-hover rounded w-3/4" />
          <div className="h-20 bg-surface-hover rounded" />
        </div>
      </Card>
    );
  }

  return (
    <Card withBorder radius="md" className="border-border-primary bg-surface-secondary">
      <Stack gap="md">
        {/* Header */}
        <Group justify="space-between">
          <Group gap="xs">
            <IconTarget size={18} className="text-text-primary" />
            <Text fw={600} size="sm" className="text-text-primary">
              Life Balance
            </Text>
          </Group>
          {quarterlyDue?.isDue && (
            <Badge size="xs" color="yellow" variant="light">
              Check-in due
            </Badge>
          )}
        </Group>

        {/* Ring Progress showing overall balance */}
        {scores.length > 0 ? (
          <>
            <div className="flex justify-center">
              <Tooltip label={`Overall balance: ${overallScore}%`}>
                <RingProgress
                  size={100}
                  thickness={8}
                  roundCaps
                  sections={[
                    { value: overallScore, color: overallScore >= 70 ? 'green' : overallScore >= 50 ? 'yellow' : 'red' }
                  ]}
                  label={
                    <Text ta="center" size="lg" fw={700} className="text-text-primary">
                      {overallScore}%
                    </Text>
                  }
                />
              </Tooltip>
            </div>

            {/* Domains needing attention */}
            {domainsNeedingAttention.length > 0 && (
              <Stack gap="xs">
                <Text size="xs" className="text-text-muted">
                  Needs attention
                </Text>
                {domainsNeedingAttention.map((score) => {
                  const domain = lifeDomains?.find(d => d.id === score.lifeDomainId);
                  const domainName = domain?.title ?? 'Unknown';
                  const color = domainColors[domainName] ?? 'gray';

                  return (
                    <Group key={score.id} gap="xs" justify="space-between">
                      <Badge size="xs" color={color} variant="light">
                        {domainName}
                      </Badge>
                      <Text size="xs" className="text-text-muted">
                        {score.currentRank}/10
                      </Text>
                    </Group>
                  );
                })}
              </Stack>
            )}
          </>
        ) : (
          <Stack gap="sm" align="center" py="md">
            <Text size="sm" className="text-text-muted text-center">
              Complete a Wheel of Life assessment to see your balance
            </Text>
            <Link
              href="/wheel-of-life"
              className="text-sm text-brand-primary hover:underline"
            >
              Start assessment
            </Link>
          </Stack>
        )}

        {/* Link to full assessment */}
        {scores.length > 0 && (
          <Link
            href="/wheel-of-life"
            className="text-xs text-text-muted hover:text-text-secondary text-center"
          >
            View full assessment
          </Link>
        )}
      </Stack>
    </Card>
  );
}
