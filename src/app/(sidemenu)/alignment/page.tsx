'use client';

import { Container, Title, Text, SimpleGrid, Paper, Stack, ThemeIcon, Button, Group } from '@mantine/core';
import { IconTarget, IconRepeat, IconTrophy, IconCircleDashed, IconChartBar, IconArrowRight } from '@tabler/icons-react';
import Link from 'next/link';
import { useWorkspace } from '~/providers/WorkspaceProvider';

const alignmentFeatures = [
  {
    title: 'Wheel of Life',
    description: 'Assess satisfaction across 10 life domains. Identify priority areas and generate goal recommendations.',
    icon: IconCircleDashed,
    color: 'violet',
    href: '/wheel-of-life',
  },
  {
    title: 'Goals',
    description: 'Strategic objectives linked to life domains. The foundation of your alignment system.',
    icon: IconTarget,
    color: 'blue',
    href: '/goals',
  },
  {
    title: 'Outcomes',
    description: 'Measurable results at different time horizons. Track what you want to achieve daily, weekly, monthly.',
    icon: IconTrophy,
    color: 'yellow',
    href: '/outcomes',
  },
  {
    title: 'Habits',
    description: 'Daily and weekly routines that compound over time. Link habits to goals for purposeful consistency.',
    icon: IconRepeat,
    color: 'green',
    href: '/habits',
  },
  {
    title: 'OKRs',
    description: 'Objectives & Key Results for quantitative goal tracking. Set targets and measure progress.',
    icon: IconChartBar,
    color: 'orange',
    href: '/okrs',
  },
];

function Step({ number, title, description }: { number: number; title: string; description: string }) {
  return (
    <Group gap="md" align="flex-start">
      <ThemeIcon size={32} radius="xl" variant="filled" color="blue">
        <Text size="sm" fw={700}>{number}</Text>
      </ThemeIcon>
      <div>
        <Text fw={600} className="text-text-primary">{title}</Text>
        <Text size="sm" className="text-text-secondary">{description}</Text>
      </div>
    </Group>
  );
}

export default function AlignmentPage() {
  const { workspaceSlug } = useWorkspace();
  const basePath = workspaceSlug ? `/w/${workspaceSlug}` : '';

  return (
    <Container size="lg" py="xl">
      {/* Hero */}
      <Stack gap="xs" className="mb-8 text-center">
        <Title order={1} className="text-text-primary">
          Life Alignment System
        </Title>
        <Text size="lg" className="text-text-secondary max-w-2xl mx-auto">
          Connect your daily actions to your life vision. Understand how goals, habits,
          outcomes, and OKRs work together to create meaningful progress.
        </Text>
      </Stack>

      {/* Feature Cards */}
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="lg" className="mb-8">
        {alignmentFeatures.map((feature) => (
          <Paper
            key={feature.title}
            component={Link}
            href={`${basePath}${feature.href}`}
            p="lg"
            radius="md"
            className="border border-border-primary bg-surface-secondary hover:border-border-focus transition-colors cursor-pointer"
          >
            <ThemeIcon size={48} radius="md" variant="light" color={feature.color} className="mb-3">
              <feature.icon size={28} />
            </ThemeIcon>
            <Text fw={600} size="lg" className="text-text-primary mb-2">
              {feature.title}
            </Text>
            <Text size="sm" className="text-text-secondary">
              {feature.description}
            </Text>
          </Paper>
        ))}
      </SimpleGrid>

      {/* How It Works */}
      <Paper p="xl" radius="md" className="border border-border-primary bg-surface-secondary mb-8">
        <Title order={2} size="h3" className="text-text-primary mb-4">
          How It Works
        </Title>
        <Stack gap="md">
          <Step number={1} title="Assess" description="Start with a Wheel of Life assessment to identify which life domains need attention." />
          <Step number={2} title="Set Goals" description="Create strategic goals in your priority life domains." />
          <Step number={3} title="Define Outcomes" description="Specify what success looks like at different time horizons." />
          <Step number={4} title="Build Habits" description="Establish daily routines that move you toward your outcomes." />
          <Step number={5} title="Track Progress" description="Use OKRs for quantitative tracking on key objectives." />
        </Stack>
      </Paper>

      {/* Quick Actions */}
      <Group justify="center" gap="md">
        <Button component={Link} href={`${basePath}/wheel-of-life`} size="lg" rightSection={<IconArrowRight size={18} />}>
          Start Assessment
        </Button>
        <Button component={Link} href={`${basePath}/goals`} variant="light" size="lg">
          View Goals
        </Button>
      </Group>
    </Container>
  );
}
