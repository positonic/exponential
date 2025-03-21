"use client";
import { Container, Title, Text, SimpleGrid, Card, ThemeIcon } from "@mantine/core";
import { IconGitBranch, IconUsers, IconCode, IconBriefcase, IconChartBar, IconWorld } from "@tabler/icons-react";

const features = [
  {
    icon: IconGitBranch,
    title: "Project Management",
    description: "AI-assisted tracking of tasks, milestones, and progress with GitHub integration for seamless workflow.",
    color: "violet"
  },
  {
    icon: IconUsers,
    title: "Team Management",
    description: "Coordinate human and AI contributors efficiently, ensuring everyone works together harmoniously.",
    color: "blue"
  },
  {
    icon: IconCode,
    title: "Human/AI Coordination Layer",
    description: "Automate workflow optimization with AI agents that help manage tasks and improve productivity.",
    color: "indigo"
  },
  {
    icon: IconBriefcase,
    title: "Virtual Scalable Next-Gen YC",
    description: "Create a funding ecosystem for OSS projects that helps them grow from zero to one and beyond.",
    color: "green"
  },
  {
    icon: IconChartBar,
    title: "Fair Compensation",
    description: "Ensure contributors are rewarded based on their impact with transparent evaluation mechanisms.",
    color: "yellow"
  },
  {
    icon: IconWorld,
    title: "Self-Sovereign Software",
    description: "Enable teams to work in an autonomous, transparent, and fair ecosystem with decentralized governance.",
    color: "red"
  }
];

export default function Features() {
  return (
    <Container size="xl" py="xl">
      <div className="text-center mb-12">
        <Title
          className="text-4xl font-bold bg-gradient-to-r from-violet-400 to-indigo-400 bg-clip-text text-transparent mb-4"
        >
          Key Features & Differentiators
        </Title>
        <div className="flex justify-center">
          <Text 
            c="dimmed" 
            size="xl" 
            className="max-w-3xl text-justify px-4"
            ta="justify"
          >
            Exponential combines AI-driven project coordination, decentralized funding, and a
            governance model that rewards contributions fairly.
          </Text>
        </div>
      </div>

      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="xl">
        {features.map((feature) => (
          <Card 
            key={feature.title}
            className="bg-[#1a1b1e] border border-gray-800"
            padding="xl"
          >
            <ThemeIcon
              size={48}
              radius="md"
              variant="light"
              color={feature.color}
              className="mb-4"
            >
              <feature.icon size={24} stroke={1.5} />
            </ThemeIcon>
            <Text size="xl" fw={500} className="mb-3">
              {feature.title}
            </Text>
            <Text size="sm" c="dimmed">
              {feature.description}
            </Text>
          </Card>
        ))}
      </SimpleGrid>
    </Container>
  );
}