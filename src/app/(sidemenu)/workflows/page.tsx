import { Container, Title, Text, SimpleGrid, Card, Button, Group, ThemeIcon } from '@mantine/core';
import { IconRocket, IconArrowRight, IconPresentation } from '@tabler/icons-react';
import Link from 'next/link';

// Define workflow data - can be expanded later or fetched from a source
const workflows = [
  {
    icon: IconRocket,
    title: 'Launch Sprint',
    description: 'Generate a tailored 3-week plan to validate your idea, launch your MVP, or grow your existing product.',
    targetAudience: 'Startups, indie h  ackers, product managers',
    href: '/workflows/launch',
    cta: 'Start Launch Sprint',
  },{
    icon: IconPresentation,
    title: 'Elevator Pitch',
    description: 'Craft a compelling elevator pitch using a structured template focused on customer needs and your unique value proposition.',
    targetAudience: 'Entrepreneurs, founders, sales teams',
    href: '/workflows/elevator-pitch',
    cta: 'Craft Your Pitch',
  }
  // Add more workflows here as needed
  // {
  //   icon: IconChartInfographic,
  //   title: 'Growth Experiment',
  //   description: 'Design and track experiments to find new growth channels for your product.',
  //   targetAudience: 'Growth teams, marketers, product owners',
  //   href: '/workflows/growth',
  //   cta: 'Design Experiment',
  // },
];

export default function WorkflowsPage() {
  return (
    <Container size="lg" py="xl">
      <Title
        order={1}
        ta="center"
        className="mb-4 bg-gradient-to-r from-violet-400 to-indigo-400 bg-clip-text text-4xl font-bold text-transparent"
      >
        Exponential Workflows
      </Title>
      <Text c="dimmed" size="xl" ta="center" mb="xl">
        Streamline your product journey with guided processes designed to help you achieve specific goals, faster.
      </Text>

      <SimpleGrid
        cols={{ base: 1, sm: 2 }}
        spacing="xl"
      >
        {workflows.map((workflow) => (
          <Card key={workflow.title} shadow="sm" padding="lg" radius="md" withBorder className="flex flex-col">
            <Group justify="flex-start" align="center" mb="md">
               <ThemeIcon size="lg" variant="light" color="violet" radius="md">
                 <workflow.icon size={24} />
               </ThemeIcon>
               <Title order={3} className="text-lg font-semibold">
                 {workflow.title}
               </Title>
            </Group>

            <Text size="sm" c="dimmed" className="flex-grow">
              {workflow.description}
            </Text>

             <Text size="xs" c="dimmed" mt="sm">
               Ideal for: {workflow.targetAudience}
             </Text>

            <Button
              component={Link}
              href={workflow.href}
              variant="gradient"
              gradient={{ from: 'violet', to: 'indigo' }}
              fullWidth
              mt="md"
              radius="md"
              rightSection={<IconArrowRight size={16} />}
            >
              {workflow.cta}
            </Button>
          </Card>
        ))}
      </SimpleGrid>
    </Container>
  );
}
