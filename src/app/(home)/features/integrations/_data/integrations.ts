/**
 * Marketing pages for integrations, served at /features/integrations/[slug].
 *
 * Each entry is a search landing page for "<tool> + Exponential" queries, so
 * every claim here must match what the integration really does today. Source
 * the tool lists and setup steps from the docs page in `docsHref`, and update
 * both together. (`/integrations` itself is the signed-in app's settings page,
 * which is why these live under /features.)
 */

export interface IntegrationTool {
  /** Tool names exactly as the integration exposes them. */
  names: string[];
  description: string;
}

export interface IntegrationSetupStep {
  title: string;
  body: string;
  code?: { language: string; content: string };
}

export interface IntegrationFaq {
  question: string;
  answer: string;
}

export interface IntegrationData {
  slug: string;
  /** The tool's name, e.g. "Claude". */
  name: string;
  icon: string;
  /** Search-result title; " | Exponential" is appended. */
  seoTitle: string;
  seoDescription: string;
  headline: string;
  intro: string;
  /** Example requests, in the user's words. */
  examplePrompts: string[];
  setupSteps: IntegrationSetupStep[];
  tools: IntegrationTool[];
  /** What makes this integration worth choosing; the page's own angle. */
  reasons: { title: string; body: string }[];
  faqs: IntegrationFaq[];
  docsHref: string;
  related: { label: string; href: string }[];
}

export const integrations: IntegrationData[] = [
  {
    slug: "claude",
    name: "Claude",
    icon: "🤖",
    seoTitle: "Claude MCP Server for Tasks, Projects & OKRs",
    seoDescription:
      "Connect Claude Desktop or Claude Code to your Exponential workspace with the open-source exponential-mcp server. Ask what's on your plate, create actions, read meetings and track key results.",
    headline: "Your tasks, projects and OKRs, inside Claude.",
    intro:
      "The open-source Exponential MCP server gives Claude Desktop and Claude Code tools over your real workspace: actions, projects, meetings, goals and key results. Ask \"what is on my plate today?\" in a chat and the answer comes from your data, not a guess.",
    examplePrompts: [
      "What projects am I working on?",
      "Add an action to call John tomorrow",
      "Summarise yesterday's leadership sync",
      "Which key results are off track?",
      "Why is my overdue list so long?",
      "Move everything from Friday to next Monday",
    ],
    setupSteps: [
      {
        title: "Create an API key",
        body: "In Exponential, open Settings → API keys and create a JWT token. The MCP server acts as you, with the same access you have in the app.",
      },
      {
        title: "Claude Desktop: run the setup",
        body: "Paste the key when asked. It stores the key locally and, on a Mac, writes the Claude Desktop configuration for you. Restart Claude Desktop afterwards.",
        code: { language: "bash", content: "npx exponential-mcp init" },
      },
      {
        title: "Claude Code: add .mcp.json to your project",
        body: "The serve argument is required. Reload the window afterwards.",
        code: {
          language: "json",
          content: `{
  "mcpServers": {
    "exponential": {
      "command": "npx",
      "args": ["-y", "exponential-mcp", "serve"]
    }
  }
}`,
        },
      },
      {
        title: "Check the connection",
        body: "The doctor command checks the setup and prints a configuration snippet for your machine.",
        code: { language: "bash", content: "npx exponential-mcp doctor" },
      },
    ],
    tools: [
      { names: ["get_workspaces"], description: "List your workspaces" },
      {
        names: ["get_projects", "get_project", "update_project"],
        description: "List, read and update projects",
      },
      {
        names: ["get_actions"],
        description: "List actions, filtered by project or status",
      },
      {
        names: ["get_todays_actions"],
        description:
          "What is on your plate now: overdue, today and inbox, across workspaces",
      },
      {
        names: ["get_overdue_triage"],
        description:
          "Why the overdue pile is that size: bulk-created cohorts versus real debt",
      },
      {
        names: ["create_action", "update_action", "complete_action"],
        description:
          "Create (natural language works), change and finish actions",
      },
      {
        names: ["reschedule_actions", "defer_actions"],
        description:
          "Move actions to a new date, or clear their dates back to the backlog",
      },
      {
        names: [
          "get_meetings",
          "get_meeting",
          "create_meeting",
          "update_meeting",
          "append_meeting_notes",
        ],
        description: "Read and write meetings and their notes",
      },
      {
        names: ["get_goals", "get_key_results"],
        description: "Objectives and key results with progress",
      },
      {
        names: ["search"],
        description: "Search across everything, like the app's ⌘K palette",
      },
    ],
    reasons: [
      {
        title: "Open source, end to end",
        body: "The MCP server and the SDK it is built on are MIT-licensed, and Exponential itself is AGPL-3.0. Read exactly what Claude can do, or self-host the whole stack.",
      },
      {
        title: "Your key stays on your machine",
        body: "The key lives in a local config store and the server reads it at startup. It is never handed to the MCP client.",
      },
      {
        title: "Agents can have their own identity",
        body: "The MCP server acts as you. When an autonomous agent should be attributed separately, give it an external agent key and use the same SDK.",
      },
      {
        title: "The same data from the CLI and SDK",
        body: "The MCP server, the exponential CLI and the TypeScript SDK share one sign-in, so scripts, terminals and chats all see the same workspace.",
      },
    ],
    faqs: [
      {
        question: "Which Claude clients work?",
        answer:
          "Claude Desktop (configured by init) and Claude Code (via .mcp.json). Any other MCP client that can run a local command works with the same serve command.",
      },
      {
        question: "Is my API key sent to Claude?",
        answer:
          "No. The key stays in the local config store; the server reads it when it starts.",
      },
      {
        question: "Does Claude see every workspace?",
        answer:
          "Every workspace the key's owner is a member of. Tools accept a workspace id when you want to scope them.",
      },
      {
        question: "Does it cost anything?",
        answer:
          "The MCP server is free and open source on npm, and Exponential is free to start. You need your own Claude plan.",
      },
      {
        question: "Can I use it from Python?",
        answer:
          "Not through the SDK yet, which is TypeScript. Other languages can call the same HTTP API with the bearer token.",
      },
    ],
    docsHref: "/docs/developers/mcp-and-sdk",
    related: [
      { label: "MCP server & SDK docs", href: "/docs/developers/mcp-and-sdk" },
      { label: "CLI reference", href: "/docs/developers/cli" },
      { label: "External agents", href: "/docs/developers/external-agents" },
      { label: "API tokens", href: "/docs/developers/api-tokens" },
      { label: "AI Assistant", href: "/features/ai-assistant" },
    ],
  },
];

export function getIntegrationBySlug(slug: string): IntegrationData | undefined {
  return integrations.find((i) => i.slug === slug);
}

export function getAllIntegrationSlugs(): string[] {
  return integrations.map((i) => i.slug);
}
