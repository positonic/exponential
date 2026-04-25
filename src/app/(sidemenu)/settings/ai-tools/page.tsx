'use client';

import {
  Container,
  Title,
  Text,
  Stack,
  Paper,
  Group,
} from '@mantine/core';
import {
  IconSparkles,
  IconRobot,
  IconChevronRight,
} from '@tabler/icons-react';
import Link from 'next/link';

const AI_TOOLS = [
  {
    title: 'AI Sales Demo',
    description:
      'Interactive demo of AI-powered sales page generation. See how AI can create and refine sales content in real-time.',
    icon: IconSparkles,
    href: '/ai-sales-demo',
  },
  {
    title: 'AI Automation',
    description:
      'Explore AI automation services for streamlining business processes, reducing manual work, and improving efficiency.',
    icon: IconRobot,
    href: '/ai-automation',
  },
] as const;

export default function AiToolsSettingsPage() {
  return (
    <Container size="md" py="xl">
      <Stack gap="xl">
        <div>
          <Title order={2} className="text-text-primary">
            AI Tools
          </Title>
          <Text size="sm" c="dimmed" mt="xs">
            Explore AI-powered features and capabilities
          </Text>
        </div>

        <Stack gap="md">
          {AI_TOOLS.map((tool) => {
            const ToolIcon = tool.icon;
            return (
              <Paper
                key={tool.href}
                p="lg"
                withBorder
                className="bg-surface-secondary hover:bg-surface-hover transition-colors cursor-pointer"
                component={Link}
                href={tool.href}
              >
                <Group justify="space-between" align="flex-start" wrap="nowrap">
                  <Group gap="md" align="flex-start" wrap="nowrap">
                    <ToolIcon
                      size={24}
                      className="text-text-muted flex-shrink-0 mt-0.5"
                    />
                    <div>
                      <Text fw={500} className="text-text-primary">
                        {tool.title}
                      </Text>
                      <Text size="sm" c="dimmed" mt={4}>
                        {tool.description}
                      </Text>
                    </div>
                  </Group>
                  <IconChevronRight
                    size={20}
                    className="text-text-muted flex-shrink-0"
                  />
                </Group>
              </Paper>
            );
          })}
        </Stack>
      </Stack>
    </Container>
  );
}
