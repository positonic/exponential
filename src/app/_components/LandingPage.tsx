import {
  Button,
  SimpleGrid,
  Title,
  Text,
  Container,
  Paper,
  Stack,
  Group,
  Avatar,
} from "@mantine/core";
import "@mantine/core/styles.css";
import Link from "next/link";

export function LandingPage() {
  return (
    <Container size="xl" className="py-16">
      {/* Hero Section */}
      <Stack align="center" className="mb-16 text-center">
        <Title order={1} className="mb-6 text-5xl font-bold leading-tight">
          Harness Your Inner Force, Unleash Your Flow.
        </Title>
        <Text size="xl" c="dimmed" className="mb-8">
          Transform the way you manage your life and projects with an AI-powered
          productivity system that actually works.
        </Text>
        <Group gap="md" justify="center" wrap="wrap">
          <Link href="/use-the-force">
            <Button size="lg" color="blue">
              Get Started
            </Button>
          </Link>
          <Button size="lg" variant="outline">
            Watch Demo
          </Button>
        </Group>
      </Stack>

      {/* Features Section */}
      <Stack className="mb-16">
        <Title order={2} ta="center" className="mb-8">
          Smart Project Management
        </Title>
        <SimpleGrid cols={{ base: 1, md: 2, lg: 4 }} spacing="lg">
          {features.map((feature, index) => (
            <Paper
              key={index}
              p="lg"
              radius="md"
              withBorder
              bg="dark.6"
              style={{ borderColor: "var(--mantine-color-dark-4)" }}
            >
              <Text size="xl" className="mb-2">
                {feature.icon}
              </Text>
              <Title order={3} size="h4" className="mb-2">
                {feature.title}
              </Title>
              <Text c="dimmed">{feature.description}</Text>
            </Paper>
          ))}
        </SimpleGrid>
      </Stack>

      {/* AI Assistant Section */}
      <Stack className="mb-16">
        <Title order={2} ta="center" className="mb-8">
          Your Personal AI Assistant
        </Title>
        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
          {aiFeatures.map((feature, index) => (
            <Paper
              key={index}
              p="lg"
              radius="md"
              withBorder
              bg="dark.6"
              style={{ borderColor: "var(--mantine-color-dark-4)" }}
            >
              <Text size="xl" className="mb-2">
                ✨
              </Text>
              <Text>{feature}</Text>
            </Paper>
          ))}
        </SimpleGrid>
      </Stack>

      {/* Testimonial Section */}
      <Stack className="mb-16">
        <Paper
          p="xl"
          radius="md"
          withBorder
          bg="dark.6"
          style={{ borderColor: "var(--mantine-color-dark-4)" }}
          className="mx-auto max-w-2xl"
        >
          <Text size="xl" fs="italic" className="mb-4">
            &ldquo;Force Flow is a dream come true.
            Nothing can stop me now, not even me!
          </Text>
          <Group>
            <Avatar
              src="/james-orb-small.png"
              alt="James Farrell"
              radius="xl"
            />
            <Text c="dimmed">James Farrell</Text>
          </Group>
        </Paper>
      </Stack>

      {/* CTA Section */}
      <Stack align="center">
        <Title order={2} className="mb-6">
          Ready to Get Started?
        </Title>
        <Text c="dimmed" className="mb-8">
          Join thousands of productive professionals and take control of your
          workflow today.
        </Text>
        <Link href="/use-the-force">
          <Button size="lg" color="blue">
            Sign Up Now
          </Button>
        </Link>
      </Stack>
    </Container>
  );
}

const features = [
  {
    icon: "⏳",
    title: "Save time",
    description: "Your task list is automatically kept up to date",
  },
  {
    icon: "👨‍🏫",
    title: "Be held accountable",
    description: "Track progress effortlessly with intuitive dashboards",
  },
  {
    icon: "🎯",
    title: "Get what you want",
    description: "Intelligent reminders keep you on track",
  },

  {
    icon: "✨",
    title: "Feel spacious",
    description: "Minimalist = Clean signal without noise",
  },
];

const aiFeatures = [
  "Get instant help with task organization",
  "Search through your content semantically",
  "Process and analyze information automatically",
  "Make better decisions with AI-powered insights",
];
