"use client";
import { Container, Title, Text, SimpleGrid, Card, ThemeIcon, Collapse, Stack, Button } from "@mantine/core";
import { IconGitBranch, IconUsers, IconCode, IconBriefcase, IconChartBar, IconWorld, IconChevronDown, IconArrowRight } from "@tabler/icons-react";
import { useState } from "react";
import { motion } from "framer-motion";

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

function FeatureCard({ feature, index }: { feature: Feature; index: number }) {
  const [showDetails, setShowDetails] = useState(false);
  
  const handleClick = () => {
    console.log('Card clicked', feature.title);
    setShowDetails(prev => !prev);
  };
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: index * 0.1 }}
    >
      <Card 
        className={`group bg-surface-secondary border border-border-primary cursor-pointer transition-all duration-300 
          hover:border-brand-primary/50 hover:shadow-lg hover:shadow-brand-primary/10 
          ${showDetails ? 'ring-1 ring-brand-primary shadow-lg shadow-brand-primary/10' : ''}`}
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
            className="mb-4 transition-transform duration-300 group-hover:scale-110"
          >
            <feature.icon size={24} stroke={1.5} />
          </ThemeIcon>
          <IconChevronDown 
            className={`transition-all duration-300 text-violet-400/50 group-hover:text-violet-400 
              ${showDetails ? 'rotate-180' : ''}`}
            size={20}
          />
        </div>
        <Text size="xl" fw={500} className="mb-3 group-hover:text-violet-400 transition-colors duration-300">
          {feature.title}
        </Text>
        <Text size="sm" c="dimmed" className="mb-4 line-clamp-2">
          {feature.description}
        </Text>
        
        <Collapse in={showDetails} transitionDuration={400}>
          <div className="mt-4 pt-4 border-t border-gray-700">
            <Stack gap="md">
              <div>
                <Text fw={500} size="sm" className="mb-2 text-violet-400 flex items-center gap-2">
                  Current Features
                  <div className="px-2 py-1 rounded-full bg-violet-400/10 text-xs">
                    Live
                  </div>
                </Text>
                {feature.details.current.map((detail, index) => (
                  <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3, delay: index * 0.1 }}
                    key={index}
                  >
                    <Text size="sm" c="dimmed" className="ml-4 mb-2 flex items-start gap-2">
                      <span className="text-violet-400/50 mt-1">•</span>
                      {detail}
                    </Text>
                  </motion.div>
                ))}
              </div>
              <div>
                <Text fw={500} size="sm" className="mb-2 text-violet-400 flex items-center gap-2">
                  Coming Soon
                  <div className="px-2 py-1 rounded-full bg-violet-400/10 text-xs">
                    Roadmap
                  </div>
                </Text>
                {feature.details.upcoming.map((detail, index) => (
                  <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3, delay: (index + feature.details.current.length) * 0.1 }}
                    key={index}
                  >
                    <Text size="sm" c="dimmed" className="ml-4 mb-2 flex items-start gap-2">
                      <span className="text-violet-400/50 mt-1">•</span>
                      {detail}
                    </Text>
                  </motion.div>
                ))}
              </div>
            </Stack>
          </div>
        </Collapse>
      </Card>
    </motion.div>
  );
}

export default function Features() {
  return (
    <Container size="xl" py="xl">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-center mb-12"
      >
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
      </motion.div>

      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="xl">
        {features.map((feature, index) => (
          <FeatureCard key={feature.title} feature={feature} index={index} />
        ))}
      </SimpleGrid>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.8 }}
        className="mt-16 text-center"
      >
        <Button
          variant="light"
          color="violet"
          size="lg"
          rightSection={<IconArrowRight size={18} />}
          component="a"
          href="/roadmap"
        >
          View Full Roadmap
        </Button>
      </motion.div>
    </Container>
  );
}