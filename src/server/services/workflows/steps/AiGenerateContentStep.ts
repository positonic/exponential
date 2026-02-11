import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { type IStepExecutor, type StepContext } from "./IStepExecutor";
import { type FeatureGroup } from "./AiAnalyzeStep";

interface GeneratedDraft {
  title: string;
  content: string;
  platform: string;
  wordCount: number;
}

const PLATFORM_PROMPTS: Record<string, string> = {
  BLOG: `Write a blog post announcing these recently shipped features.

Format as markdown with:
- An engaging title
- A brief intro paragraph (2-3 sentences)
- A section for each major feature with a clear heading
- Each section should be 2-4 paragraphs explaining what it does and why it matters to users
- A closing paragraph summarizing the update
- Keep the tone professional but approachable`,

  TWITTER: `Write a Twitter/X thread announcing these recently shipped features.

Format rules:
- First tweet should be an attention-grabbing hook (the "we just shipped" moment)
- Each subsequent tweet covers one feature (max 280 characters per tweet)
- Use emojis sparingly but effectively
- End with a call to action
- Number each tweet like "1/" "2/" etc.
- Separate tweets with "---"
- Maximum 10 tweets`,

  LINKEDIN: `Write a LinkedIn post announcing these recently shipped features.

Format rules:
- Professional but energetic tone
- Start with a hook line
- Use bullet points for features
- Maximum 1300 characters total
- End with a question or call to action to drive engagement
- Include relevant hashtags at the end`,

  YOUTUBE_SCRIPT: `Write a YouTube video script outline for a feature update walkthrough.

Format as markdown with:
- Video title (SEO-optimized)
- Estimated duration
- Intro section (30 seconds): hook + what we'll cover
- For each major feature: talking points, what to show on screen, duration estimate
- Outro section (30 seconds): summary + CTA
- Include [SHOW: description] markers for screen recordings`,
};

export class AiGenerateContentStep implements IStepExecutor {
  type = "ai_generate_content";
  label = "Generate content for each platform";

  async execute(
    input: Record<string, unknown>,
    config: Record<string, unknown>,
    _context: StepContext,
  ): Promise<Record<string, unknown>> {
    const featureGroups = input.featureGroups as FeatureGroup[];
    const platforms = (input.platforms as string[]) ?? ["BLOG"];
    const tone = input.tone as string | undefined;
    const assistantPersonality =
      input.assistantPersonality as string | undefined;
    const repoName = (input.repoName as string) ?? "the product";
    const since = input.since as string | undefined;
    const until = input.until as string | undefined;

    if (!featureGroups || featureGroups.length === 0) {
      return { drafts: [], draftCount: 0 };
    }

    const model = new ChatOpenAI({
      modelName: (config.modelName as string) ?? "gpt-4o",
      temperature: 0.7,
    });

    const featureSummary = featureGroups
      .map(
        (f) =>
          `**${f.name}** (${f.significance}): ${f.description} [${f.commitShas.length} commits]`,
      )
      .join("\n");

    const dateRange =
      since && until
        ? `from ${new Date(since).toLocaleDateString()} to ${new Date(until).toLocaleDateString()}`
        : "recently";

    const drafts: GeneratedDraft[] = [];

    for (const platform of platforms) {
      const platformPrompt = PLATFORM_PROMPTS[platform];
      if (!platformPrompt) continue;

      const systemParts = [platformPrompt];
      if (assistantPersonality) {
        systemParts.unshift(
          `You are writing with this personality and voice: ${assistantPersonality}\n`,
        );
      }
      if (tone) {
        systemParts.push(`\nTone: ${tone}`);
      }

      const response = await model.invoke([
        new SystemMessage(systemParts.join("\n")),
        new HumanMessage(
          `Generate content for ${repoName}. These features were shipped ${dateRange}:\n\n${featureSummary}`,
        ),
      ]);

      const content =
        typeof response.content === "string"
          ? response.content
          : JSON.stringify(response.content);

      const title = this.extractTitle(content, platform, repoName);
      const wordCount = content.split(/\s+/).length;

      drafts.push({ title, content, platform, wordCount });
    }

    return {
      drafts,
      draftCount: drafts.length,
    };
  }

  private extractTitle(
    content: string,
    platform: string,
    repoName: string,
  ): string {
    const firstLine = content.split("\n").find((l) => l.trim().length > 0);
    if (firstLine) {
      const cleaned = firstLine.replace(/^#+\s*/, "").trim();
      if (cleaned.length > 0 && cleaned.length < 200) return cleaned;
    }
    return `${repoName} Update — ${platform.charAt(0) + platform.slice(1).toLowerCase()}`;
  }
}
