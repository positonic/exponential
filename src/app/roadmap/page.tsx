import { NextPage } from "next";
import React from "react";

interface RoadmapItem {
  title: string;
  description: string;
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
        title: "Natural Language Task Creation with LLM Agents",
        description:
          "Users can ask the AI to create tasks using natural language (e.g., 'Today I want to call my mum, go shopping, and rent a car'). Tasks are placed in relevant projects at the right time and place.",
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
    <div className="min-h-screen bg-gray-100 text-gray-900">
      <div className="max-w-4xl mx-auto py-12 px-6">
        <h1 className="text-4xl font-bold text-center mb-8">🚀 Product Roadmap</h1>

        {roadmapData.map((section) => (
          <div key={section.title} className="mb-10">
            <h2 className="text-2xl font-semibold mb-4">{section.title}</h2>
            <ul className="space-y-4">
              {section.items.map((item) => (
                <li key={item.title} className="p-4 bg-white rounded-lg shadow">
                  <h3 className="text-xl font-medium">{item.title}</h3>
                  <p className="text-gray-700">{item.description}</p>
                </li>
              ))}
            </ul>
          </div>
        ))}

        <div className="mt-12 text-center">
          <p className="text-lg">
            🚀 **Get Involved:** Join discussions on **GitHub** to help shape the
            roadmap and influence upcoming features.
          </p>
        </div>
      </div>
    </div>
  );
};

export default RoadmapPage;
