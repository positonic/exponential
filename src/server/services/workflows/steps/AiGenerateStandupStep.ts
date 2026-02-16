import OpenAI from "openai";
import { type IStepExecutor, type StepContext } from "./IStepExecutor";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Uses AI to generate a formatted standup summary from collected data
 */
export class AiGenerateStandupStep implements IStepExecutor {
  type = "ai_generate_standup";
  label = "Generate standup summary";

  async execute(
    input: Record<string, unknown>,
    config: Record<string, unknown>,
    _context: StepContext,
  ): Promise<Record<string, unknown>> {
    const modelName = (config.modelName as string) ?? "gpt-4o";
    const outputFormat = (input.outputFormat as string) ?? "markdown";

    // Extract data from previous steps
    const completedActions = input.completedActions as Array<{
      name: string;
      projectName: string | null;
    }> ?? [];
    const plannedActions = input.plannedActions as Array<{
      name: string;
      projectName: string | null;
      priority: string;
    }> ?? [];
    const blockers = input.blockers as Array<{
      name: string;
      daysOverdue: number;
    }> ?? [];
    const unhealthyProjects = input.unhealthyProjects as Array<{
      name: string;
      healthScore: number;
    }> ?? [];

    const prompt = this.buildPrompt(
      completedActions,
      plannedActions,
      blockers,
      unhealthyProjects,
      outputFormat
    );

    const response = await openai.chat.completions.create({
      model: modelName,
      messages: [
        {
          role: "system",
          content: `You are a helpful assistant that generates concise, well-formatted standup summaries. 
Format the output as ${outputFormat === "slack" ? "Slack-compatible markdown" : outputFormat}.
Keep it brief but informative. Use bullet points. Highlight critical items.`,
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 1000,
    });

    const standupSummary = response.choices[0]?.message?.content ?? "";

    return {
      standupSummary,
      format: outputFormat,
      generatedAt: new Date().toISOString(),
      stats: {
        completedCount: completedActions.length,
        plannedCount: plannedActions.length,
        blockersCount: blockers.length,
        unhealthyProjectsCount: unhealthyProjects.length,
      },
    };
  }

  private buildPrompt(
    completed: Array<{ name: string; projectName: string | null }>,
    planned: Array<{ name: string; projectName: string | null; priority: string }>,
    blockers: Array<{ name: string; daysOverdue: number }>,
    unhealthy: Array<{ name: string; healthScore: number }>,
    format: string
  ): string {
    let prompt = "Generate a daily standup summary based on the following:\n\n";

    if (completed.length > 0) {
      prompt += "## Yesterday's Completed Work\n";
      completed.forEach((a) => {
        prompt += `- ${a.name}${a.projectName ? ` (${a.projectName})` : ""}\n`;
      });
      prompt += "\n";
    } else {
      prompt += "## Yesterday's Completed Work\nNo items completed.\n\n";
    }

    if (planned.length > 0) {
      prompt += "## Today's Plan\n";
      const highPriority = planned.filter((a) => a.priority === "HIGH");
      const others = planned.filter((a) => a.priority !== "HIGH");

      if (highPriority.length > 0) {
        prompt += "**High Priority:**\n";
        highPriority.forEach((a) => {
          prompt += `- ${a.name}${a.projectName ? ` (${a.projectName})` : ""}\n`;
        });
      }
      if (others.length > 0) {
        prompt += "**Other Tasks:**\n";
        others.forEach((a) => {
          prompt += `- ${a.name}${a.projectName ? ` (${a.projectName})` : ""}\n`;
        });
      }
      prompt += "\n";
    }

    if (blockers.length > 0) {
      prompt += "## ⚠️ Blockers/Overdue\n";
      blockers.forEach((b) => {
        prompt += `- ${b.name} (${b.daysOverdue} days overdue)\n`;
      });
      prompt += "\n";
    }

    if (unhealthy.length > 0) {
      prompt += "## 🔴 Projects Needing Attention\n";
      unhealthy.forEach((p) => {
        prompt += `- ${p.name} (health: ${p.healthScore}%)\n`;
      });
      prompt += "\n";
    }

    prompt += `\nFormat this as a clean, professional ${format} standup update.`;

    return prompt;
  }
}
