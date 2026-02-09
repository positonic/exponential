"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  Paper,
  TextInput,
  Button,
  ScrollArea,
  Avatar,
  Text,
  Stack,
  Group,
  Loader,
  ActionIcon,
  Badge,
} from "@mantine/core";
import { IconSend, IconSparkles, IconTarget } from "@tabler/icons-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { api } from "~/trpc/react";
import { calculatePriorityGaps } from "~/server/services/wheelOfLifeService";
import { CreateGoalModal } from "~/app/_components/CreateGoalModal";

interface Message {
  type: "system" | "human" | "ai";
  content: string;
}

interface WheelOfLifeCoachProps {
  assessmentId: string;
}

export function WheelOfLifeCoach({ assessmentId }: WheelOfLifeCoachProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const viewport = useRef<HTMLDivElement>(null);

  const { data: assessment, isLoading: assessmentLoading } =
    api.wheelOfLife.getAssessment.useQuery({ id: assessmentId });

  // Fetch available Mastra agents
  const { data: mastraAgents } = api.mastra.getMastraAgents.useQuery(undefined, {
    staleTime: 10 * 60 * 1000,
  });

  // Select the best available agent for coaching
  const selectedAgentId = useMemo(() => {
    if (!mastraAgents || mastraAgents.length === 0) return "zoeagent";

    // Priority: lifeCoach > coach > zoe > first available
    const lifeCoach = mastraAgents.find((a) =>
      a.name.toLowerCase().includes("lifecoach") || a.id.toLowerCase().includes("lifecoach")
    );
    if (lifeCoach) return lifeCoach.id;

    const coach = mastraAgents.find((a) =>
      a.name.toLowerCase().includes("coach") || a.id.toLowerCase().includes("coach")
    );
    if (coach) return coach.id;

    const zoe = mastraAgents.find((a) =>
      a.name.toLowerCase() === "zoe" || a.id.toLowerCase() === "zoeagent"
    );
    if (zoe) return zoe.id;

    return mastraAgents[0]?.id ?? "zoeagent";
  }, [mastraAgents]);

  const callAgent = api.mastra.callAgent.useMutation();

  // Generate coaching system prompt based on assessment
  const generateCoachingPrompt = useCallback(() => {
    if (!assessment) return "";

    const gaps = calculatePriorityGaps(assessment.scores);
    const focusAreas = gaps.filter((g) => g.needsAttention).slice(0, 3);
    const balancedAreas = gaps.filter((g) => !g.needsAttention && g.gap === 0);

    return `You are a supportive and empathetic life coach helping the user understand and act on their Wheel of Life assessment results.

## Assessment Context
- Completed: ${new Date(assessment.completedAt).toLocaleDateString()}
- Mode: ${assessment.mode === "deep" ? "Deep (includes satisfaction scores)" : "Quick (priority ranking only)"}

## Priority Gaps (Areas Needing Attention)
${focusAreas.length > 0 ? focusAreas.map((g) => `- **${g.title}**: Currently #${g.currentRank} priority, wants #${g.desiredRank} (gap: ${g.gap > 0 ? "+" : ""}${g.gap})${g.score != null ? ` - Satisfaction: ${g.score}/10` : ""}`).join("\n") : "No significant gaps identified - priorities are well-balanced!"}

## Balanced Areas
${balancedAreas.length > 0 ? balancedAreas.map((g) => `- ${g.title}${g.score != null ? ` (Satisfaction: ${g.score}/10)` : ""}`).join("\n") : "None"}

${assessment.notes ? `## User's Notes\n${assessment.notes}` : ""}

## Your Coaching Approach
1. Start by acknowledging their assessment and highlighting 2-3 key insights
2. Ask about ONE focus area at a time:
   - "What's currently working in [area]?"
   - "What's been getting in the way?"
   - "What would 'better' look like for you?"
3. After understanding their situation, suggest specific, actionable steps
4. Offer to help create a goal when they're ready
5. Keep responses warm but concise (2-3 paragraphs max)
6. Use emojis sparingly to add warmth

Remember: You're a coach, not a lecturer. Ask more than you tell. Be curious about their experience.

When ready to create a goal, format it clearly:
**Suggested Goal:** [Goal title]
**Focus Area:** [Life domain]
**First Step:** [Concrete action]`;
  }, [assessment]);

  // Initialize with opening message
  useEffect(() => {
    if (assessment && messages.length === 0) {
      const gaps = calculatePriorityGaps(assessment.scores);
      const topFocus = gaps.filter((g) => g.needsAttention).slice(0, 2);

      let openingMessage =
        "Hello! I'm your Life Coach, and I've reviewed your Wheel of Life assessment. ";

      if (topFocus.length > 0) {
        openingMessage += `I noticed you'd like to invest more in **${topFocus.map((f) => f.title.split("/")[0]).join("** and **")}**. `;
        openingMessage += `\n\nLet's explore what's happening in these areas. Which one feels most important to discuss first?`;
      } else {
        openingMessage +=
          "Your priorities seem well-balanced! Let's talk about how you can maintain this balance or make improvements where you see opportunity.\n\nWhat area of your life would you like to explore?";
      }

      setMessages([{ type: "ai", content: openingMessage }]);
    }
  }, [assessment, messages.length]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (viewport.current) {
      viewport.current.scrollTo({
        top: viewport.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setMessages((prev) => [...prev, { type: "human", content: userMessage }]);
    setInput("");
    setIsLoading(true);

    try {
      // Build conversation history for context
      const conversationHistory = messages.map((msg) => ({
        role: msg.type === "human" ? "user" : "assistant",
        content: msg.content,
      }));

      const result = await callAgent.mutateAsync({
        agentId: selectedAgentId,
        messages: [
          { role: "system", content: generateCoachingPrompt() },
          ...conversationHistory,
          { role: "user", content: userMessage },
        ],
      });

      const aiResponse =
        typeof result.response === "string"
          ? result.response
          : JSON.stringify(result.response);

      setMessages((prev) => [...prev, { type: "ai", content: aiResponse }]);
    } catch (error) {
      console.error("Coaching error:", error);
      setMessages((prev) => [
        ...prev,
        {
          type: "ai",
          content:
            "I apologize, but I'm having trouble connecting right now. Please try again in a moment.",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  // Extract goal suggestion from message if present
  const extractGoalFromMessage = (content: string) => {
    const goalMatch = content.match(/\*\*Suggested Goal:\*\*\s*(.+)/);
    const areaMatch = content.match(/\*\*Focus Area:\*\*\s*(.+)/);

    if (goalMatch) {
      return {
        title: goalMatch[1]?.trim() ?? "",
        area: areaMatch ? areaMatch[1]?.trim() : undefined,
      };
    }
    return null;
  };

  if (assessmentLoading) {
    return (
      <Paper p="xl" radius="md" className="bg-surface-secondary border border-border-primary">
        <Stack align="center" gap="md">
          <Loader size="lg" />
          <Text c="dimmed">Loading assessment data...</Text>
        </Stack>
      </Paper>
    );
  }

  if (!assessment) {
    return (
      <Paper p="xl" radius="md" className="bg-surface-secondary border border-border-primary">
        <Text c="dimmed" ta="center">
          Assessment not found.
        </Text>
      </Paper>
    );
  }

  const gaps = calculatePriorityGaps(assessment.scores);
  const topArea = gaps.find((g) => g.needsAttention);

  return (
    <Paper
      radius="md"
      className="bg-surface-secondary border border-border-primary flex flex-col"
      style={{ height: "calc(100vh - 200px)", minHeight: "500px" }}
    >
      {/* Header */}
      <div className="p-4 border-b border-border-primary">
        <Group justify="space-between">
          <Group gap="sm">
            <Avatar
              size="md"
              radius="xl"
              className="ring-2 ring-violet-500/30"
              styles={{
                root: {
                  background: "linear-gradient(135deg, var(--mantine-color-violet-6), var(--mantine-color-pink-5))",
                },
              }}
            >
              <IconSparkles size={20} />
            </Avatar>
            <div>
              <Text fw={600}>Life Coach</Text>
              <Text size="xs" c="dimmed">
                Wheel of Life Coaching Session
              </Text>
            </div>
          </Group>
          <Badge variant="light" color="violet">
            {assessment.mode === "deep" ? "Deep" : "Quick"} Assessment
          </Badge>
        </Group>
      </div>

      {/* Messages Area */}
      <ScrollArea className="flex-1" viewportRef={viewport} p="md">
        <Stack gap="md">
          {messages
            .filter((msg) => msg.type !== "system")
            .map((message, index) => (
              <div
                key={index}
                className={`flex ${message.type === "human" ? "justify-end" : "justify-start"}`}
              >
                {message.type === "ai" ? (
                  <div className="flex items-start gap-3 max-w-[85%]">
                    <Avatar
                      size="sm"
                      radius="xl"
                      styles={{
                        root: {
                          background:
                            "linear-gradient(135deg, var(--mantine-color-violet-6), var(--mantine-color-pink-5))",
                        },
                      }}
                    >
                      <IconSparkles size={14} />
                    </Avatar>
                    <div className="flex-1">
                      <Paper
                        p="md"
                        radius="lg"
                        className="bg-surface-primary border border-border-primary"
                      >
                        <div className="prose prose-sm max-w-none">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                              p: ({ children }) => (
                                <Text size="sm" mb={8}>
                                  {children}
                                </Text>
                              ),
                              strong: ({ children }) => (
                                <Text component="span" fw={600}>
                                  {children}
                                </Text>
                              ),
                              ul: ({ children }) => (
                                <ul className="ml-4 mb-2 list-disc">{children}</ul>
                              ),
                              li: ({ children }) => (
                                <li>
                                  <Text size="sm">{children}</Text>
                                </li>
                              ),
                            }}
                          >
                            {message.content}
                          </ReactMarkdown>
                        </div>
                        {/* Goal creation button if goal detected */}
                        {extractGoalFromMessage(message.content) && topArea && (
                          <div className="mt-3 pt-3 border-t border-border-primary">
                            <CreateGoalModal
                              trigger={
                                <Button
                                  variant="light"
                                  color="green"
                                  size="xs"
                                  leftSection={<IconTarget size={14} />}
                                >
                                  Create This Goal
                                </Button>
                              }
                              goal={{
                                id: 0,
                                title: extractGoalFromMessage(message.content)?.title ?? "",
                                description: null,
                                whyThisGoal: null,
                                notes: null,
                                dueDate: null,
                                period: null,
                                lifeDomainId: topArea.lifeDomainId,
                              }}
                            />
                          </div>
                        )}
                      </Paper>
                    </div>
                  </div>
                ) : (
                  <Paper
                    p="md"
                    radius="lg"
                    className="bg-brand-primary/10 border border-brand-primary/20 max-w-[85%]"
                  >
                    <Text size="sm">{message.content}</Text>
                  </Paper>
                )}
              </div>
            ))}

          {isLoading && (
            <div className="flex items-start gap-3">
              <Avatar
                size="sm"
                radius="xl"
                styles={{
                  root: {
                    background:
                      "linear-gradient(135deg, var(--mantine-color-violet-6), var(--mantine-color-pink-5))",
                  },
                }}
              >
                <IconSparkles size={14} />
              </Avatar>
              <Paper
                p="md"
                radius="lg"
                className="bg-surface-primary border border-border-primary"
              >
                <Group gap="xs">
                  <Loader size="xs" />
                  <Text size="sm" c="dimmed">
                    Thinking...
                  </Text>
                </Group>
              </Paper>
            </div>
          )}
        </Stack>
      </ScrollArea>

      {/* Input Area */}
      <form onSubmit={handleSubmit} className="p-4 border-t border-border-primary">
        <Group gap="sm">
          <TextInput
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Share your thoughts or ask a question..."
            disabled={isLoading}
            className="flex-1"
            styles={{
              input: {
                backgroundColor: "var(--color-surface-primary)",
                border: "1px solid var(--color-border-primary)",
              },
            }}
          />
          <ActionIcon
            type="submit"
            size="lg"
            variant="filled"
            color="violet"
            disabled={!input.trim() || isLoading}
          >
            <IconSend size={18} />
          </ActionIcon>
        </Group>
        <Text size="xs" c="dimmed" mt="xs" ta="center">
          Your coach is here to help you explore and take action on your assessment
        </Text>
      </form>
    </Paper>
  );
}
