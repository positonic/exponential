"use client";
import { Container, Title, Text, SimpleGrid, Card, ThemeIcon, Collapse, Stack } from "@mantine/core";
import { IconGitBranch, IconUsers, IconCode, IconBriefcase, IconChartBar, IconWorld, IconChevronDown } from "@tabler/icons-react";
import { useState } from "react";

interface Feature {
  icon: React.ElementType;
  title: string;
  description: string;
  color: string;
  details: {
    current: string[];
    upcoming: string[];
  };
}

const features: Feature[] = [
  {
    icon: IconGitBranch,
    title: "Project Management",
    description: "AI-assisted tracking of tasks, milestones, and progress with GitHub integration for seamless workflow.",
    color: "violet",
    details: {
      current: [
        "Create and manage projects with structured to-do lists",
        "Natural language task management with LLM agents",
        "AI understands and organizes tasks into relevant projects",
        "Automatic task prioritization and scheduling"
      ],
      upcoming: [
        "AI-assisted project planning and estimation",
        "Automated progress tracking and reporting",
        "Smart task delegation and workload balancing",
        "Integration with popular project management tools"
      ]
    }
  },
  {
    icon: IconUsers,
    title: "Team Management",
    description: "Coordinate human and AI contributors efficiently, ensuring everyone works together harmoniously.",
    color: "blue",
    details: {
      current: [
        "Team member role and responsibility management",
        "Collaborative task assignment and tracking",
        "Real-time team communication and updates"
      ],
      upcoming: [
        "AI-powered team composition suggestions",
        "Skill gap analysis and training recommendations",
        "Automated team performance analytics",
        "Cross-team collaboration optimization"
      ]
    }
  },
  {
    icon: IconCode,
    title: "Human/AI Coordination Layer",
    description: "Automate workflow optimization with AI agents that help manage tasks and improve productivity.",
    color: "indigo",
    details: {
      current: [
        "Natural language processing for task creation",
        "AI-assisted daily planning and routines",
        "Automated task categorization and organization"
      ],
      upcoming: [
        "Advanced AI agents for autonomous task execution",
        "Context-aware workflow optimization",
        "Predictive task scheduling and resource allocation",
        "Learning from user behavior patterns"
      ]
    }
  },
  {
    icon: IconBriefcase,
    title: "Virtual Scalable Next-Gen YC",
    description: "Create a funding ecosystem for OSS projects that helps them grow from zero to one and beyond.",
    color: "green",
    details: {
      current: [
        "Project evaluation and funding allocation",
        "Transparent contribution tracking",
        "Merit-based reward distribution"
      ],
      upcoming: [
        "Automated project valuation",
        "Smart contract-based funding distribution",
        "Decentralized decision-making for fund allocation",
        "Integration with major funding platforms"
      ]
    }
  },
  {
    icon: IconChartBar,
    title: "Fair Compensation",
    description: "Ensure contributors are rewarded based on their impact with transparent evaluation mechanisms.",
    color: "yellow",
    details: {
      current: [
        "Impact-based contribution tracking",
        "Transparent reward mechanisms",
        "Automated contribution analysis"
      ],
      upcoming: [
        "AI-driven impact assessment",
        "Real-time contribution valuation",
        "Multi-factor compensation modeling",
        "Integration with payment systems"
      ]
    }
  },
  {
    icon: IconWorld,
    title: "Self-Sovereign Software",
    description: "Enable teams to work in an autonomous, transparent, and fair ecosystem with decentralized governance.",
    color: "red",
    details: {
      current: [
        "Decentralized decision-making framework",
        "Transparent governance mechanisms",
        "Community-driven development"
      ],
      upcoming: [
        "DAO integration for governance",
        "Smart contract automation",
        "Cross-platform identity management",
        "Decentralized storage solutions"
      ]
    }
  }
];

function FeatureCard({ feature }: { feature: Feature }) {
  const [showDetails, setShowDetails] = useState(false);
  
  const handleClick = () => {
    console.log('Card clicked', feature.title);
    setShowDetails(prev => !prev);
  };
  
  return (
    <Card 
      className={`bg-[#1a1b1e] border border-gray-800 cursor-pointer transition-all duration-200 hover:border-violet-400/50 ${showDetails ? 'ring-1 ring-violet-400' : ''}`}
      padding="xl"
      onClick={handleClick}
      withBorder={false}
    >
      <div className="flex justify-between items-start">
        <ThemeIcon
          size={48}
          radius="md"
          variant="light"
          color={feature.color}
          className="mb-4"
        >
          <feature.icon size={24} stroke={1.5} />
        </ThemeIcon>
        <IconChevronDown 
          className={`transition-transform duration-200 text-violet-400/50 ${showDetails ? 'rotate-180' : ''}`}
          size={20}
        />
      </div>
      <Text size="xl" fw={500} className="mb-3">
        {feature.title}
      </Text>
      <Text size="sm" c="dimmed" className="mb-4">
        {feature.description}
      </Text>
      
      <Collapse in={showDetails}>
        <div className="mt-4 pt-4 border-t border-gray-700">
          <Stack gap="md">
            <div>
              <Text fw={500} size="sm" className="mb-2 text-violet-400">
                Current Features
              </Text>
              {feature.details.current.map((detail, index) => (
                <Text key={index} size="sm" c="dimmed" className="ml-4 mb-1">
                  • {detail}
                </Text>
              ))}
            </div>
            <div>
              <Text fw={500} size="sm" className="mb-2 text-violet-400">
                Coming Soon
              </Text>
              {feature.details.upcoming.map((detail, index) => (
                <Text key={index} size="sm" c="dimmed" className="ml-4 mb-1">
                  • {detail}
                </Text>
              ))}
            </div>
          </Stack>
        </div>
      </Collapse>
    </Card>
  );
}

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
          <FeatureCard key={feature.title} feature={feature} />
        ))}
      </SimpleGrid>
    </Container>
  );
}