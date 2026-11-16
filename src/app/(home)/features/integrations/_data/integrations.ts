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

/**
 * "assistant" is an AI client that reaches the workspace through the MCP
 * server; "developer" is a tool you drive yourself (the CLI, the SDK). The
 * two get different headings, and a developer page shows its examples as code.
 */
export type IntegrationKind = "assistant" | "developer";

export interface IntegrationData {
  slug: string;
  kind: IntegrationKind;
  /** The tool's name, e.g. "Claude". */
  name: string;
  icon: string;
  /** One sentence for the /features/integrations index. */
  summary: string;
  /** Search-result title; " | Exponential" is appended. */
  seoTitle: string;
  seoDescription: string;
  headline: string;
  intro: string;
  /**
   * Example requests in the user's words, or for a developer integration,
   * commands or code they would write.
   */
  examplePrompts: string[];
  setupSteps: IntegrationSetupStep[];
  tools: IntegrationTool[];
  /** Overrides "The tools <name> gets" when the list is not MCP tools. */
  toolsHeading?: string;
  toolsIntro?: string;
  /** What makes this integration worth choosing; the page's own angle. */
  reasons: { title: string; body: string }[];
  faqs: IntegrationFaq[];
  docsHref: string;
  related: { label: string; href: string }[];
}

/**
 * The MCP server's tools, by the names every MCP client sees. Source:
 * the exponential-mcp README. Shared by every assistant page.
 */
const MCP_TOOLS: IntegrationTool[] = [
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
    description: "Create (natural language works), change and finish actions",
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
  {
    names: [
      "tickets",
      "features",
      "epics",
      "stories",
      "decisions",
      "pages",
      "comments",
      "time",
      "contacts",
      "deals",
    ],
    description:
      "One tool per area of the SDK, each taking an operation and its parameters: the product backlog, the decision log, Knowledge pages, comments, time entries and the CRM, and more",
  },
];

const MCP_SETUP_AGENT_STEP: IntegrationSetupStep = {
  title: "Create an agent and copy its key",
  body: "In Exponential, open Settings → Agents → New agent, name it after the app it will run in, pick the workspaces it may work in and click Create agent. Copy the exp_agent_ key; it is shown once. What the agent does is attributed to it, not to you.",
};

export const integrations: IntegrationData[] = [
  {
    slug: "claude",
    kind: "assistant",
    name: "Claude",
    icon: "🤖",
    summary:
      "Ask Claude Desktop or Claude Code what is on your plate, and let it create actions, read meetings and track key results.",
    seoTitle: "Claude MCP Server for Tasks, Projects & OKRs",
    seoDescription:
      "Connect Claude Desktop or Claude Code to Exponential with the open-source MCP server. Ask what's on your plate, create actions and track key results.",
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
        title: "Create an agent and copy its key",
        body: "In Exponential, open Settings → Agents → New agent, name it, pick the workspaces it may work in and click Create agent. Its work is attributed to the agent, not to you.",
      },
      {
        title: "Claude Desktop: run the setup",
        body: "You need Node.js 18 or later. Paste the key when asked. It stores the key locally and adds the server to Claude Desktop's configuration on macOS, Windows and Linux. Quit and reopen Claude Desktop afterwards.",
        code: { language: "bash", content: "npx exponential-mcp init" },
      },
      {
        title: "Claude Code: add the server",
        body: "Run this with the key you copied. --scope user makes the server available in every project; leave it out to add it to the current project only.",
        code: {
          language: "bash",
          content:
            "claude mcp add --scope user exponential -e EXPONENTIAL_API_KEY=exp_agent_... -- npx -y exponential-mcp serve",
        },
      },
      {
        title: "Check the connection",
        body: "For Claude Desktop, the doctor command checks the saved key and Claude Desktop's configuration, and prints an entry that works on your machine. It does not look at Claude Code. There, list your MCP servers: exponential should show as connected.",
        code: {
          language: "bash",
          content: `# Claude Desktop
npx exponential-mcp doctor

# Claude Code
claude mcp list`,
        },
      },
    ],
    tools: MCP_TOOLS,
    reasons: [
      {
        title: "Open source, end to end",
        body: "Exponential, the MCP server and the SDK it is built on are all AGPL-3.0. Read exactly what Claude can do, or self-host the whole stack.",
      },
      {
        title: "Your key stays on your machine",
        body: "The key lives in a local config store, or in Claude's own MCP configuration if you give it a key of its own, and the server reads it at startup.",
      },
      {
        title: "Claude gets its own identity",
        body: "The MCP server signs in with an agent key, so what Claude does in your workspace is attributed to the agent rather than to you, and you choose which workspaces it can reach.",
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
          "Claude Desktop (configured by init) and Claude Code (added with claude mcp add). Any other MCP client that can run a local command works with the same serve command.",
      },
      {
        question: "Claude Desktop does not show the tools. What now?",
        answer:
          "Quit Claude Desktop completely and reopen it, because it loads MCP servers only at startup. If the tools are still missing, run npx exponential-mcp doctor. If you installed Node with nvm or a similar version manager, run npx exponential-mcp init again: Claude Desktop does not use your shell's PATH, so init writes an entry with the full path to npx.",
      },
      {
        question: "Is my API key sent to Claude?",
        answer:
          "No. The key stays in the local config store (or in Claude's MCP configuration, if you set EXPONENTIAL_API_KEY there); the server reads it when it starts.",
      },
      {
        question: "Does Claude see every workspace?",
        answer:
          "Only the workspaces you added the agent to. Add or remove them on the agent's card under Settings → Agents.",
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
  {
    slug: "cursor",
    kind: "assistant",
    name: "Cursor",
    icon: "🖱️",
    summary:
      "Give Cursor's agent your tickets, decisions and actions, so it can pick up work and report back without leaving the editor.",
    seoTitle: "Cursor MCP Server for Project Management",
    seoDescription:
      "Connect Cursor to Exponential with the open-source MCP server. Your agent reads tickets, logs decisions and updates actions from the editor.",
    headline: "Your backlog, inside Cursor.",
    intro:
      "The open-source Exponential MCP server gives Cursor's agent tools over your real workspace: tickets and features, the decision log, actions, projects, meetings and OKRs. The agent can read the ticket it is working on, record what it decided and move the work along, and every change is attributed to the agent you created for it.",
    examplePrompts: [
      "What tickets are ready for me to pick up?",
      "Read the ticket for this branch and summarise what it asks for",
      "Create a bug ticket for the failing sign-in test",
      "Log a decision: we keep the v1 endpoint for one more release",
      "What is on my plate today?",
      "Add the release checklist as actions on the launch project",
    ],
    setupSteps: [
      MCP_SETUP_AGENT_STEP,
      {
        title: "Store the key on your machine",
        body: "You need Node.js 18 or later. Run the setup and paste the key when asked. It saves the key in a local config store, so it never goes in a file you might commit. (If Claude Desktop is installed, it also adds Exponential there, which you can ignore.)",
        code: { language: "bash", content: "npx exponential-mcp init" },
      },
      {
        title: "Add the server to Cursor",
        body: "Create .cursor/mcp.json in your project, or ~/.cursor/mcp.json to use it in every project. The serve argument is required. The file holds no key, so it is safe to commit.",
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
        body: "Open Cursor's MCP settings and make sure the exponential server is enabled. If it is not, the doctor command checks the setup and prints a configuration snippet for your machine.",
        code: { language: "bash", content: "npx exponential-mcp doctor" },
      },
    ],
    tools: MCP_TOOLS,
    reasons: [
      {
        title: "The ticket and the code in one place",
        body: "Tickets, features, epics and decisions are tools, so the agent works from the real requirement and writes back what it did, instead of you copying text between tabs.",
      },
      {
        title: "Attributed to the agent, not to you",
        body: "Cursor signs in with its own agent key. Its comments, status changes and new actions show the agent's name, and it only reaches the workspaces you added it to.",
      },
      {
        title: "Your key stays out of the repo",
        body: "The key lives in a local config store and the server reads it at startup, so the project's .cursor/mcp.json can be shared with the team.",
      },
      {
        title: "Open source, end to end",
        body: "Exponential, the MCP server and the SDK it is built on are all AGPL-3.0. Read exactly what Cursor can do, or self-host the whole stack.",
      },
    ],
    faqs: [
      {
        question: "Where does the configuration go?",
        answer:
          "In .cursor/mcp.json at the root of a project, or in ~/.cursor/mcp.json to make the server available in every project.",
      },
      {
        question: "Can each app have its own key?",
        answer:
          "Yes. Create a separate agent for Cursor and add \"env\": { \"EXPONENTIAL_API_KEY\": \"exp_agent_...\" } to the exponential entry. That key takes precedence over the one init stored. Keep that file out of version control.",
      },
      {
        question: "Which workspaces can Cursor see?",
        answer:
          "Only the workspaces you added the agent to. Add or remove them on the agent's card under Settings → Agents.",
      },
      {
        question: "Does it cost anything?",
        answer:
          "The MCP server is free and open source on npm, and Exponential is free to start. You need your own Cursor plan.",
      },
    ],
    docsHref: "/docs/developers/mcp-and-sdk",
    related: [
      { label: "MCP server & SDK docs", href: "/docs/developers/mcp-and-sdk" },
      { label: "External agents", href: "/docs/developers/external-agents" },
      { label: "Features, PRDs and tickets", href: "/docs/build/features-prds-tickets" },
      { label: "Codex integration", href: "/features/integrations/codex" },
      { label: "All integrations", href: "/features/integrations" },
    ],
  },
  {
    slug: "codex",
    kind: "assistant",
    name: "Codex",
    icon: "🧑‍💻",
    summary:
      "Let OpenAI Codex pick up tickets, log time and decisions, and keep your projects current while it works.",
    seoTitle: "OpenAI Codex MCP Server for Project Management",
    seoDescription:
      "Connect OpenAI Codex to Exponential with the open-source MCP server. Codex reads tickets, records decisions, logs time and updates your actions.",
    headline: "Codex that knows what to work on next.",
    intro:
      "Add the open-source Exponential MCP server to Codex and it can read your backlog, check what a ticket depends on, record the decisions it makes and log the time it spends, all in your real workspace. It signs in with its own agent key, so its work is attributed to Codex rather than to you.",
    examplePrompts: [
      "Pick the next ready ticket in the Platform product and summarise it",
      "What is overdue on the onboarding project?",
      "Record the decisions we made in this session in the decision log",
      "Log an hour against this ticket for the refactor I just did",
      "Summarise yesterday's planning meeting and list its open questions",
      "Mark the migration ticket as in QA",
    ],
    setupSteps: [
      MCP_SETUP_AGENT_STEP,
      {
        title: "Add the server to ~/.codex/config.toml",
        body: "Paste this into Codex's configuration file with the key you copied. The serve argument is required. Codex starts the server with npx, so you need Node.js 18 or later.",
        code: {
          language: "toml",
          content: `[mcp_servers.exponential]
command = "npx"
args = ["-y", "exponential-mcp", "serve"]
env = { EXPONENTIAL_API_KEY = "exp_agent_..." }`,
        },
      },
      {
        title: "Restart Codex",
        body: "Codex loads MCP servers when it starts. Then ask it something only your workspace knows, such as \"what is on my plate today?\".",
      },
      {
        title: "If it does not connect",
        body: "Start the server by hand with the same key. It prints \"Exponential MCP server running\" when it starts; press Ctrl+C to stop it. An error here is the reason Codex cannot start it.",
        code: {
          language: "bash",
          content: "EXPONENTIAL_API_KEY=exp_agent_... npx -y exponential-mcp serve",
        },
      },
    ],
    tools: MCP_TOOLS,
    reasons: [
      {
        title: "Made for agents doing real work",
        body: "Beyond actions and projects, Codex gets the product backlog, the decision log, Knowledge pages and time entries, so it can take a ticket from ready to QA and leave a record of how.",
      },
      {
        title: "Its own identity",
        body: "With its own agent key, everything Codex writes is attributed to the agent, and time it logs arrives as proposed entries for you to confirm.",
      },
      {
        title: "One key per app",
        body: "Claude, Cursor and Codex can each have their own agent, so you can see which tool did what and revoke one without touching the others.",
      },
      {
        title: "Open source, end to end",
        body: "Exponential, the MCP server and the SDK it is built on are all AGPL-3.0. Read exactly what Codex can do, or self-host the whole stack.",
      },
    ],
    faqs: [
      {
        question: "Why put the key in config.toml?",
        answer:
          "So Codex has its own identity. EXPONENTIAL_API_KEY takes precedence over a key stored by npx exponential-mcp init, which every app on the machine would otherwise share.",
      },
      {
        question: "What happens to time Codex logs?",
        answer:
          "Entries written with an agent key belong to the agent's owner and are always proposed, so they wait for you to confirm them in the day view.",
      },
      {
        question: "Which workspaces can Codex see?",
        answer:
          "Only the workspaces you added the agent to. Add or remove them on the agent's card under Settings → Agents.",
      },
      {
        question: "Does it cost anything?",
        answer:
          "The MCP server is free and open source on npm, and Exponential is free to start. You need your own OpenAI plan for Codex.",
      },
    ],
    docsHref: "/docs/developers/mcp-and-sdk",
    related: [
      { label: "MCP server & SDK docs", href: "/docs/developers/mcp-and-sdk" },
      { label: "External agents", href: "/docs/developers/external-agents" },
      { label: "Time tracking", href: "/docs/do/time-tracking" },
      { label: "Cursor integration", href: "/features/integrations/cursor" },
      { label: "All integrations", href: "/features/integrations" },
    ],
  },
  {
    slug: "cli",
    kind: "developer",
    name: "CLI",
    icon: "⌨️",
    summary:
      "Every object in your workspace from the terminal, with JSON output for scripts and coding agents.",
    seoTitle: "Project Management CLI for Teams and AI Agents",
    seoDescription:
      "The open-source exponential CLI: actions, projects, OKRs, tickets, decisions and time from the terminal, with JSON output for scripts and agents.",
    headline: "Your whole workspace, one command away.",
    intro:
      "The exponential command-line tool gives you, your scripts and your coding agents the same objects the app has: actions, projects, goals and OKRs, meetings, decisions, products and tickets, Knowledge pages, CRM contacts and deals, and time entries. Output is readable in a terminal and JSON when piped, so it works as well in an agent's shell as in yours.",
    examplePrompts: [
      "exponential actions today",
      'exponential actions create -n "Call John" --due 2026-12-01',
      "exponential okrs list --status off-track",
      "exponential tickets list --product <product> --workspace <workspace> --status READY_TO_PLAN --json",
      'exponential decisions create -s "Ship the importer behind a flag" --status ACCEPTED',
      'exponential search "onboarding"',
    ],
    setupSteps: [
      {
        title: "Install it",
        body: "The CLI is the exponential-cli package on npm and needs Node.js.",
        code: { language: "bash", content: "npm install -g exponential-cli" },
      },
      {
        title: "Create a token",
        body: "Create a JWT token under Settings → API keys to act as yourself. For a coding agent, create an agent under Settings → Agents instead and use its exp_agent_ key, so its work is attributed to the agent.",
      },
      {
        title: "Sign in",
        body: "Name the address you open Exponential at. A self-hosted installation works the same way with its own address.",
        code: {
          language: "bash",
          content:
            "exponential auth login --token <your token> --api-url https://www.exponential.im",
        },
      },
      {
        title: "Check who you are signed in as",
        body: "whoami prints the account's name, whether it is an agent and how many workspaces it can see.",
        code: { language: "bash", content: "exponential auth whoami" },
      },
    ],
    tools: [
      {
        names: ["actions"],
        description:
          "Today, overdue, kanban, create, update, reschedule, defer and comment",
      },
      { names: ["projects"], description: "List, read and manage projects" },
      {
        names: ["goals", "okrs"],
        description: "Objectives and key results, by period, status or owner",
      },
      {
        names: ["meetings"],
        description: "Recorded, imported or manual meetings and their notes",
      },
      {
        names: ["decisions"],
        description: "The decision log: decisions and open questions",
      },
      {
        names: ["products", "features", "tickets", "epics", "labels"],
        description:
          "The product backlog: tickets with dependencies, branches and pull requests",
      },
      {
        names: ["pages"],
        description: "Knowledge pages such as PRDs, research and specs",
      },
      {
        names: ["contacts", "organizations", "deals"],
        description: "The CRM and the deal pipeline",
      },
      {
        names: ["time"],
        description: "Log, list and confirm time entries",
      },
      {
        names: ["search"],
        description: "Search across everything, like the app's ⌘K palette",
      },
      {
        names: ["workspaces", "auth"],
        description: "Workspaces, sign-in and who you are signed in as",
      },
    ],
    reasons: [
      {
        title: "JSON when piped",
        body: "Every command prints readable output in a terminal and JSON when piped or given --json, so it slots into scripts, cron jobs and an agent's shell without a wrapper.",
      },
      {
        title: "Agents get their own identity",
        body: "Sign in with an agent's exp_agent_ key and everything the CLI does is attributed to that agent, with access limited to the workspaces you chose.",
      },
      {
        title: "Works against any installation",
        body: "Point --api-url at exponential.im or at your own self-hosted instance. The commands are the same.",
      },
      {
        title: "The same data as the SDK and MCP server",
        body: "The CLI is built on the TypeScript SDK and shares its config store, so the CLI, the SDK and the MCP server see the same workspace.",
      },
    ],
    faqs: [
      {
        question: "Where is every command documented?",
        answer:
          "The CLI reference in the docs lists every command and option, generated from the CLI itself.",
      },
      {
        question: "Can a coding agent use it?",
        answer:
          "Yes. Give the agent its own exp_agent_ key, and have it pass --json (or pipe the output) to read the results.",
      },
      {
        question: "Does it work with a self-hosted installation?",
        answer:
          "Yes. Pass that installation's address to --api-url when you sign in.",
      },
      {
        question: "Is it free?",
        answer:
          "Yes. The CLI is open source (AGPL-3.0) on npm, and Exponential is free to start.",
      },
    ],
    toolsHeading: "Every command group",
    toolsIntro: "Each group is a command, with its subcommands under it.",
    docsHref: "/docs/developers/cli",
    related: [
      { label: "CLI reference", href: "/docs/developers/cli" },
      { label: "API tokens", href: "/docs/developers/api-tokens" },
      { label: "External agents", href: "/docs/developers/external-agents" },
      { label: "TypeScript SDK", href: "/features/integrations/sdk" },
      { label: "All integrations", href: "/features/integrations" },
    ],
  },
  {
    slug: "sdk",
    kind: "developer",
    name: "SDK",
    icon: "🧩",
    summary:
      "A typed TypeScript client for your workspace: the same client the CLI and the MCP server are built on.",
    seoTitle: "TypeScript SDK for Projects, Tasks and OKRs",
    seoDescription:
      "The open-source TypeScript client for Exponential. Read and write actions, projects, OKRs, tickets, decisions and pages from your own code.",
    headline: "Build on your workspace in TypeScript.",
    intro:
      "exponential-sdk is the typed client that the CLI and the MCP server are built on. Use it to write your own scripts, services and agents against actions, projects, goals and key results, meetings, decisions, the product backlog, Knowledge pages, the CRM and more, with a personal token or an agent's key.",
    examplePrompts: [
      "await client.workspaces.list()",
      "await client.actions.getToday(workspaceId)",
      "await client.projects.list({ workspaceId })",
      "await client.decisions.create({ workspaceId, statement, status: \"ACCEPTED\", source: \"AGENT\" })",
      "await client.users.me()",
      "await client.positions.list(workspaceId)",
    ],
    setupSteps: [
      {
        title: "Install it",
        body: "The SDK is the exponential-sdk package on npm.",
        code: { language: "bash", content: "npm install exponential-sdk" },
      },
      {
        title: "Create a token",
        body: "Create a JWT token under Settings → API keys for a script that acts as you, or an agent under Settings → Agents for software that should be attributed separately.",
      },
      {
        title: "Create a client and make a call",
        body: "Point apiUrl at exponential.im, or at your own installation.",
        code: {
          language: "typescript",
          content: `import { ExponentialClient } from "exponential-sdk";

const client = new ExponentialClient({
  token: process.env.EXPONENTIAL_TOKEN!,
  apiUrl: "https://www.exponential.im",
});

const workspaces = await client.workspaces.list();
const today = await client.actions.getToday(workspaces[0]!.id);`,
        },
      },
      {
        title: "Share the sign-in with the CLI",
        body: "saveConfig and loadConfig keep the token and address in the same store the CLI and the MCP server use, so all three see the same workspace.",
      },
    ],
    tools: [
      {
        names: ["workspaces", "users"],
        description: "Your workspaces, and who the token signs in as",
      },
      {
        names: ["projects", "actions", "actionComments"],
        description: "Projects, actions and their comments",
      },
      {
        names: ["goals", "keyResults"],
        description: "Objectives and key results",
      },
      {
        names: ["meetings", "decisions", "calendar"],
        description: "Meetings, the decision log and calendar events",
      },
      {
        names: [
          "products",
          "features",
          "scopes",
          "requirements",
          "userStories",
          "tickets",
          "epics",
          "cycles",
          "labels",
          "areas",
        ],
        description: "The product backlog, from features to tickets and cycles",
      },
      {
        names: ["pages", "databases"],
        description: "Knowledge pages and the tables inside them",
      },
      {
        names: ["contacts", "organizations", "pipelines"],
        description: "The CRM and the deal pipeline",
      },
      {
        names: ["positions"],
        description: "A workspace's roles and responsibilities",
      },
      {
        names: ["search"],
        description: "Search across everything",
      },
    ],
    reasons: [
      {
        title: "The client everything else uses",
        body: "The CLI and the MCP server are built on this SDK, so anything they can do, your code can do too.",
      },
      {
        title: "Typed end to end",
        body: "Requests and responses are typed. API errors are thrown, and isTRPCError(error) tells them apart from other failures and carries the server's message.",
      },
      {
        title: "Personal token or agent key",
        body: "Act as yourself with a JWT token, or give your software an agent's exp_agent_ key so its work is attributed to the agent.",
      },
      {
        title: "Open source",
        body: "The SDK is AGPL-3.0 on npm and GitHub, like Exponential itself, and works against exponential.im or your own installation.",
      },
    ],
    faqs: [
      {
        question: "Can I use it from Python or another language?",
        answer:
          "Not through the SDK, which is TypeScript. Other languages can call the same HTTP API with the bearer token.",
      },
      {
        question: "Does it work with a self-hosted installation?",
        answer: "Yes. Set apiUrl to that installation's address.",
      },
      {
        question: "Should my script use a personal token or an agent key?",
        answer:
          "Use a personal token when the script should act as you. Use an agent key when it is software doing its own work, so its changes are attributed to the agent and limited to its workspaces.",
      },
      {
        question: "Is it free?",
        answer:
          "Yes. The SDK is open source (AGPL-3.0) on npm, and Exponential is free to start.",
      },
    ],
    toolsHeading: "What the client covers",
    toolsIntro: "One namespace per object, as you call it on the client.",
    docsHref: "/docs/developers/mcp-and-sdk",
    related: [
      { label: "MCP server & SDK docs", href: "/docs/developers/mcp-and-sdk" },
      { label: "API tokens", href: "/docs/developers/api-tokens" },
      { label: "External agents", href: "/docs/developers/external-agents" },
      { label: "Exponential CLI", href: "/features/integrations/cli" },
      { label: "All integrations", href: "/features/integrations" },
    ],
  },
];

export function getIntegrationBySlug(slug: string): IntegrationData | undefined {
  return integrations.find((i) => i.slug === slug);
}

export function getAllIntegrationSlugs(): string[] {
  return integrations.map((i) => i.slug);
}
