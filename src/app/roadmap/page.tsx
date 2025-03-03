import { NextPage } from "next";
import React from "react";
import { Container, Stack, Title, Text, Card } from "@mantine/core";

interface RoadmapItem {
  title: string;
  description: string;
  embed?: React.ReactNode;
}

interface RoadmapSection {
  title: string;
  items: RoadmapItem[];
}

const roadmapData: RoadmapSection[] = [
  {
    title: "🚀 Live Now",
    items: [
      {
        title: "Task Management & To-Do Lists",
        description: "Create and manage projects with structured to-do lists.",
      },
      {
        title: "YouTube Transcription & Actionable Insights",
        description:
          "Provide a YouTube URL, transcribe its content, and take action on the transcription.",
      },
      {
        title: "AI-Generated Exercise Routine & Auto-Logging",
        description:
          "The AI dictates your exercise routine and automatically logs completed actions into relevant projects.",
      },
      {
        title: "Natural Language Task Management with LLM Agents",
        description:
          "Users can ask the AI to create tasks using natural language (e.g., 'Today I want to call my mum, go shopping, and rent a car'). Tasks are placed in relevant projects at the right time and place.",
        embed: (
          <div style={{ position: 'relative', paddingBottom: '62.43%', height: 0 }}>
            <iframe 
              src="https://www.loom.com/embed/cd1e3584aac1429fa448ef67723591f7?sid=90418359-b813-423f-8e84-7786bf59dd53"
              frameBorder="0"
              allowFullScreen
              style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
            />
          </div>
        ),
      },
    ],
  },
  {
    title: "⚡ In Progress",
    items: [
      {
        title: "Journaling, Day Planning, Morning & Evening Routines",
        description:
          "AI-assisted daily planning and structured routines for better productivity.",
      },
      {
        title: "ELIZA Integration",
        description:
          "Currently working on deployment. Next steps include creating an ELIZA plugin for to-do and video functionality.",
      },
      {
        title: "Goal Setting",
        description: "A dedicated system for setting and tracking goals.",
      },
    ],
  },
  {
    title: "⏳ Coming Soon",
    items: [
      {
        title: "Privacy-First Approach with Client-Side Encryption",
        description:
          "User data is encrypted before being sent to the database, ensuring only the user has access.",
      },
      {
        title: "AI-Assisted Project Management System",
        description:
          "AI will understand project descriptions, suggest tasks, assign work, and execute actions autonomously where possible.",
      },
      {
        title: "Accountability System",
        description:
          "Tracks goals and ceremonies, ensuring adherence and progress.",
      },
    ],
  },
];

const RoadmapPage: NextPage = () => {
  return (
    <Container size="lg" py="xl">
      <Title order={1} mb="md" ta="center">
        🚀 Product Roadmap
      </Title>

      <Stack gap="xl">
        {roadmapData.map((section) => (
          <div key={section.title}>
            <Title order={2} mb="md">
              {section.title}
            </Title>
            
            <Stack gap="md">
              {section.items.map((item) => (
                <Card key={item.title} withBorder>
                  <Text size="lg" fw={500} mb="xs">
                    {item.title}
                  </Text>
                  <Text c="dimmed" mb={item.embed ? "md" : 0}>
                    {item.description}
                  </Text>
                  {item.embed}
                </Card>
              ))}
            </Stack>
          </div>
        ))}

        <div className="mt-12 text-center">
          <p className="text-lg">
            🚀 **Get Involved:** Join discussions on **[GitHub](https://github.com/positonic/ai-todo/discussions)** to help shape the
            roadmap and influence upcoming features.
          </p>
        </div>
      </Stack>
    </Container>
  );
};

export default RoadmapPage;
