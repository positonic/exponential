export const contentGenerationTemplate = {
  slug: "content-generation",
  name: "Commit → Content Pipeline",
  description:
    "Analyze git commits and generate blog posts, social media content, and video scripts automatically.",
  category: "content",
  triggerTypes: ["manual", "scheduled"],
  configSchema: {
    type: "object",
    properties: {
      owner: { type: "string", title: "GitHub Owner" },
      repo: { type: "string", title: "GitHub Repo" },
      branch: { type: "string", title: "Branch", default: "main" },
      dayRange: {
        type: "number",
        title: "Days to look back",
        default: 7,
      },
      platforms: {
        type: "array",
        title: "Content Platforms",
        items: {
          type: "string",
          enum: ["BLOG", "TWITTER", "LINKEDIN", "YOUTUBE_SCRIPT"],
        },
        default: ["BLOG"],
      },
      tone: {
        type: "string",
        title: "Tone (optional)",
        description: "e.g. professional, casual, technical",
      },
      assistantId: {
        type: "string",
        title: "Voice/Tone Assistant (optional)",
      },
    },
    required: ["owner", "repo", "platforms"],
  },
  stepDefinitions: [
    {
      type: "fetch_github_commits",
      label: "Fetch commits from GitHub",
      defaultConfig: {},
    },
    {
      type: "ai_analyze",
      label: "Group commits into features",
      defaultConfig: { modelName: "gpt-4o" },
    },
    {
      type: "ai_generate_content",
      label: "Generate content for each platform",
      defaultConfig: { modelName: "gpt-4o" },
    },
    {
      type: "store_content_draft",
      label: "Save content drafts",
      defaultConfig: {},
    },
    {
      type: "send_notification",
      label: "Notify when ready",
      defaultConfig: { message: "Your content drafts are ready for review!" },
    },
  ],
} as const;
