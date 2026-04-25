"use client";

import { Container, Title, Timeline, Text, Card, ThemeIcon, Badge, Stack } from "@mantine/core";
import { 
  IconCheck, 
  // IconProgressCheck,
  // IconLock,
  IconBrain,
  IconCalendarStats,
  IconUsers,
  IconShieldLock,
  IconDatabase
} from "@tabler/icons-react";
import { motion } from "framer-motion";

interface RoadmapItem {
  title: string;
  description: string;
  status: "completed" | "inProgress" | "upcoming";
  features: string[];
  icon: React.ElementType;
  video?: string;
}

const roadmapData: RoadmapItem[] = [
  {
    title: "Task Management & To-Do Lists",
    description: "Create and manage projects with structured to-do lists and AI assistance.",
    status: "completed",
    icon: IconCheck,
    features: [
      "Project creation and management",
      "Task organization and prioritization",
      "Natural language task input",
      "AI-assisted task categorization"
    ],
    video: "https://www.loom.com/embed/cd1e3584aac1429fa448ef67723591f7"
  },
  {
    title: "AI-Powered Daily Planning",
    description: "AI-assisted daily planning and routines for better productivity.",
    status: "completed",
    icon: IconBrain,
    features: [
      "Morning and evening routines",
      "AI-generated exercise routines",
      "Automated task logging",
      "Smart task suggestions"
    ],
    video: "https://www.loom.com/embed/957b2ac242dd40019002a7fafe14a63a"
  },
  {
    title: "Goal Setting & Alignment",
    description: "Comprehensive goal management system with AI alignment.",
    status: "inProgress",
    icon: IconCalendarStats,
    features: [
      "Goal hierarchy and tracking",
      "Progress visualization",
      "AI-assisted goal refinement",
      "Outcome alignment checking"
    ]
  },
  {
    title: "Team Collaboration",
    description: "Enhanced team coordination and project management features.",
    status: "inProgress",
    icon: IconUsers,
    features: [
      "Team member management",
      "Role-based permissions",
      "Collaborative task assignment",
      "Team performance analytics"
    ]
  },
  {
    title: "Privacy & Security",
    description: "Advanced security features with client-side encryption.",
    status: "upcoming",
    icon: IconShieldLock,
    features: [
      "End-to-end encryption",
      "Zero-knowledge architecture",
      "Secure data sharing",
      "Privacy-first design"
    ]
  },
  {
    title: "AI Project Management",
    description: "Advanced AI features for autonomous project management.",
    status: "upcoming",
    icon: IconDatabase,
    features: [
      "Autonomous task execution",
      "Smart resource allocation",
      "Predictive analytics",
      "AI-driven insights"
    ]
  }
];

/*
const getStatusIcon = (status: RoadmapItem["status"]) => {
  switch (status) {
    case "completed":
      return IconCheck;
    case "inProgress":
      return IconProgressCheck;
    case "upcoming":
      return IconLock;
  }
};
*/

const getStatusColor = (status: RoadmapItem["status"]) => {
  switch (status) {
    case "completed":
      return "green";
    case "inProgress":
      return "violet";
    case "upcoming":
      return "gray";
  }
};

const getStatusBadge = (status: RoadmapItem["status"]) => {
  switch (status) {
    case "completed":
      return "Completed";
    case "inProgress":
      return "In Progress";
    case "upcoming":
      return "Coming Soon";
  }
};

export default function RoadmapPage() {
  return (
    <Container size="lg" py="xl">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-center mb-12"
      >
        <Title
          className="text-4xl font-bold bg-gradient-to-r from-violet-400 to-indigo-400 bg-clip-text text-transparent mb-4"
        >
          Product Roadmap
        </Title>
        <Text c="dimmed" size="xl" className="max-w-3xl mx-auto">
          Track our journey from idea to reality. See what we&apos;ve built and what&apos;s coming next.
        </Text>
      </motion.div>

      <Timeline active={3} bulletSize={32} lineWidth={2} color="violet">
        {roadmapData.map((item, index) => (
          <Timeline.Item
            key={item.title}
            bullet={
              <ThemeIcon
                size={32}
                radius="xl"
                color={getStatusColor(item.status)}
                variant={item.status === "upcoming" ? "light" : "filled"}
              >
                <item.icon size={18} />
              </ThemeIcon>
            }
          >
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
            >
              <Card withBorder className="mb-4">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <Text size="lg" fw={500} className="mb-1">
                      {item.title}
                    </Text>
                    <Text size="sm" c="dimmed">
                      {item.description}
                    </Text>
                  </div>
                  <Badge
                    color={getStatusColor(item.status)}
                    variant={item.status === "upcoming" ? "light" : "filled"}
                    size="lg"
                  >
                    {getStatusBadge(item.status)}
                  </Badge>
                </div>

                <Stack gap="xs">
                  {item.features.map((feature, fIndex) => (
                    <motion.div
                      key={feature}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3, delay: (index * 0.1) + (fIndex * 0.05) }}
                    >
                      <Text size="sm" className="flex items-start gap-2">
                        <IconCheck 
                          size={16} 
                          className={item.status === "upcoming" ? "text-gray-500" : "text-violet-400"} 
                        />
                        {feature}
                      </Text>
                    </motion.div>
                  ))}
                </Stack>

                {item.video && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.5, delay: (index * 0.1) + 0.3 }}
                    className="mt-4"
                  >
                    <div className="relative pt-[62.5%]">
                      <iframe
                        src={item.video}
                        className="absolute inset-0 w-full h-full rounded-md"
                        frameBorder="0"
                        allowFullScreen
                      />
                    </div>
                  </motion.div>
                )}
              </Card>
            </motion.div>
          </Timeline.Item>
        ))}
      </Timeline>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 1 }}
        className="mt-12 text-center"
      >
        <Text c="dimmed">
          🚀 Want to influence our roadmap? Join the discussion on{" "}
          <Text
            component="a"
            href="https://github.com/positonic/exponential/discussions"
            target="_blank"
            rel="noopener noreferrer"
            className="text-violet-400 hover:text-violet-300 transition-colors"
          >
            GitHub
          </Text>
        </Text>
      </motion.div>
    </Container>
  );
}
