import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { type IStepExecutor, type StepContext } from "./IStepExecutor";
import { type GitHubCommit } from "./FetchGitHubCommitsStep";

export interface FeatureGroup {
  name: string;
  description: string;
  significance: "major" | "minor" | "bugfix";
  commitShas: string[];
}

const SYSTEM_PROMPT = `You are a developer relations expert. Analyze these git commits and group them into user-facing features.

Rules:
- Merge related commits into a single feature (e.g., "fix typo in X" belongs with "add X feature")
- Ignore CI/CD, dependency updates, formatting, and merge commits
- Write descriptions from a USER perspective, not a developer perspective
- Rate significance: "major" for new features, "minor" for enhancements, "bugfix" for fixes
- Maximum 15 feature groups
- If there are very few meaningful commits, return fewer groups

Return ONLY valid JSON (no markdown, no explanation) in this exact format:
{
  "featureGroups": [
    {
      "name": "Feature Name",
      "description": "User-facing description of what this feature does and why it matters",
      "significance": "major",
      "commitShas": ["abc1234", "def5678"]
    }
  ]
}`;

export class AiAnalyzeStep implements IStepExecutor {
  type = "ai_analyze";
  label = "Group commits into features";

  async execute(
    input: Record<string, unknown>,
    config: Record<string, unknown>,
    _context: StepContext,
  ): Promise<Record<string, unknown>> {
    const commits = input.commits as GitHubCommit[];

    if (!commits || commits.length === 0) {
      return { featureGroups: [], featureCount: 0 };
    }

    const model = new ChatOpenAI({
      modelName: (config.modelName as string) ?? "gpt-4o",
      temperature: 0.3,
    });

    const commitList = commits
      .map((c) => `${c.sha} ${c.message} (${c.author}, ${c.date})`)
      .join("\n");

    const response = await model.invoke([
      new SystemMessage(SYSTEM_PROMPT),
      new HumanMessage(
        `Analyze these ${commits.length} commits:\n\n${commitList}`,
      ),
    ]);

    const content =
      typeof response.content === "string"
        ? response.content
        : JSON.stringify(response.content);

    const parsed = this.parseJsonResponse(content);
    const featureGroups = (parsed.featureGroups ?? []) as FeatureGroup[];

    return {
      featureGroups,
      featureCount: featureGroups.length,
    };
  }

  private parseJsonResponse(output: string): Record<string, unknown> {
    const start = output.indexOf("{");
    const end = output.lastIndexOf("}");
    if (start === -1 || end === -1) {
      throw new Error("AI response did not contain valid JSON");
    }
    return JSON.parse(output.slice(start, end + 1)) as Record<string, unknown>;
  }
}
