---
title: MCP server & SDK
description: Give Claude and other MCP clients tools over your workspace, or build your own integration with the TypeScript SDK
section: developers
order: 4
icon: IconRobot
updated: 2026-11-16
---

Two ways to put Exponential inside software you already use. The **MCP server** (`exponential-mcp`) exposes your workspaces, projects, actions, meetings and goals as tools to any Model Context Protocol client, such as Claude Desktop or Claude Code, so you can ask "what is on my plate today?" in a chat and have the answer come from your real data. The **SDK** (`exponential-sdk`) is the TypeScript client both the MCP server and the CLI are built on, for when you are writing your own script or service.

The MCP server signs in with an [external agent](/docs/developers/external-agents) key, so what Claude does in your workspace is attributed to the agent rather than to you. The SDK accepts the same keys, or a JWT token from [Settings → API keys](/settings/api-keys) when a script should act as *you*.

## Where to find it

- MCP server: the `exponential-mcp` package on npm ([github.com/exponential-im/exponential-mcp](https://github.com/exponential-im/exponential-mcp)).
- SDK: the `exponential-sdk` package on npm ([github.com/exponential-im/exponential-sdk](https://github.com/exponential-im/exponential-sdk)).
- The key the MCP server uses: [Settings → Agents → New agent](/settings/agents/new).

## How to connect Claude with the MCP server

You need [Node.js](https://nodejs.org) 18 or later.

1. Open [/settings/agents/new](/settings/agents/new), name the agent (for example "Claude"), pick its workspaces and click **Create agent**. Copy the key it shows.
2. For Claude Desktop, run the setup in a terminal and paste the key when asked:

   ```bash
   npx exponential-mcp init
   ```

   It stores the key locally and adds the server to Claude Desktop's configuration on macOS, Windows and Linux. Quit and reopen Claude Desktop.
3. For Claude Code, add the server with the key you copied:

   ```bash
   claude mcp add --scope user exponential -e EXPONENTIAL_API_KEY=exp_agent_... -- npx -y exponential-mcp serve
   ```

   `--scope user` makes the server available in every project; leave it out to add it to the current project only.
4. Check the setup. For Claude Desktop, `npx exponential-mcp doctor` checks the saved key and Claude Desktop's configuration and prints an entry that works on your machine; `npx exponential-mcp config` shows where the key is stored. `doctor` does not look at Claude Code: there, run `claude mcp list`, and `exponential` should show as connected.

### Other MCP clients

Any client that can run a local command works: run `npx` with the arguments `-y exponential-mcp serve` and set `EXPONENTIAL_API_KEY` to the agent's key.

- **Cursor** reads `~/.cursor/mcp.json` (every project) or `.cursor/mcp.json` (one project), in the same `mcpServers` format shown under [One key per app](#one-key-per-app). See [Exponential for Cursor](/features/integrations/cursor).
- **VS Code** reads `.vscode/mcp.json`. It has the same entry, but the top-level key is `servers`, not `mcpServers`.
- **Codex** reads `~/.codex/config.toml`, shown below. See [Exponential for Codex](/features/integrations/codex).

### Claude Desktop by hand

`init` edits Claude Desktop's configuration file for you. To edit it yourself, add the `exponential` entry shown under [One key per app](#one-key-per-app) to the file for your platform:

| Platform | Configuration file |
|---|---|
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |
| Linux | `~/.config/Claude/claude_desktop_config.json` |

If you installed Node with nvm or a similar version manager, a bare `npx` does not work in that file, because Claude Desktop does not start servers with your shell's `PATH`. Use the entry `npx exponential-mcp doctor` prints: it names `npx` by its full path and puts Node's directory on `PATH`.

### If it does not connect

| Symptom | Fix |
|---|---|
| The tools do not appear | Quit the app completely and reopen it. MCP servers load only at startup. |
| Claude Desktop logs `npx: command not found` or `env: node: No such file or directory` | Node is outside the system `PATH` (nvm and similar). Run `npx exponential-mcp init` again, or copy the entry `doctor` prints. |
| It worked, then stopped starting | Versions of the MCP server before 0.13.1 pointed Claude Desktop at npx's cache, which npx may delete. Run `npx exponential-mcp init` again. |
| `Cannot find package …` when the server starts | npx's cache holds a half-finished install. Delete the `_npx` folder inside your npm cache (`~/.npm/_npx` on macOS and Linux) and restart the app. |
| The key is rejected, or the app acts as the wrong agent | `npx exponential-mcp config` shows the saved key and address. An `EXPONENTIAL_API_KEY` in the app's configuration overrides the saved key. |

### One key per app

`init` stores one key that every app on your machine shares. To give Claude and Codex separate identities, create an agent for each and set its key in that app's MCP configuration — `EXPONENTIAL_API_KEY` takes precedence over the stored key.

Claude Desktop (`claude_desktop_config.json`), Cursor or a project `.mcp.json`:

```json
{
  "mcpServers": {
    "exponential": {
      "command": "npx",
      "args": ["-y", "exponential-mcp", "serve"],
      "env": { "EXPONENTIAL_API_KEY": "exp_agent_..." }
    }
  }
}
```

Codex (`~/.codex/config.toml`):

```toml
[mcp_servers.exponential]
command = "npx"
args = ["-y", "exponential-mcp", "serve"]
env = { EXPONENTIAL_API_KEY = "exp_agent_..." }
```

Restart each app afterwards. Running `init` again rewrites Claude Desktop's entry and drops its `env`, so add the key back if you re-run it.

Then ask Claude: "What projects am I working on?", "Add an action to call John tomorrow", "Summarise yesterday's leadership sync", "Which key results are off track?"

## What the MCP tools do

| Tool | What it does |
|---|---|
| `get_workspaces` | List your workspaces |
| `get_projects`, `get_project`, `update_project` | List, read and update projects |
| `get_actions` | List actions, filtered by project or status |
| `get_todays_actions` | What is on your plate now: overdue, today and inbox, across workspaces |
| `get_overdue_triage` | Why the overdue pile is that size: bulk-created cohorts versus real debt |
| `create_action`, `update_action`, `complete_action` | Create (natural language works), change and finish actions |
| `reschedule_actions`, `defer_actions` | Move actions to a new date, or clear their dates back to the backlog |
| `get_meetings`, `get_meeting`, `create_meeting`, `update_meeting`, `append_meeting_notes` | Read and write meetings and their notes |
| `get_goals`, `get_key_results` | Objectives and key results with progress |
| `search` | Search across everything, like the app's ⌘K palette |

Claude is told to use `get_todays_actions` rather than `get_actions` for anything about today or priorities, and to run `get_overdue_triage` before deciding what to do with a large overdue count.

## How to use the SDK

```bash
npm install exponential-sdk
```

```typescript
import { ExponentialClient } from "exponential-sdk";

const client = new ExponentialClient({
  token: process.env.EXPONENTIAL_TOKEN!,
  apiUrl: "https://<your-exponential-host>",
});

const workspaces = await client.workspaces.list();
const today = await client.actions.getToday(workspaces[0]!.id);

await client.decisions.create({
  workspaceId: workspaces[0]!.id,
  statement: "Ship the importer behind a flag",
  status: "ACCEPTED",
  source: "AGENT",
});
```

The client has one namespace per object: `workspaces`, `projects`, `actions` (and `actionComments`), `goals`, `keyResults`, `meetings`, `decisions`, `calendar`, `products`, `features`, `scopes`, `requirements`, `userStories`, `tickets`, `epics`, `cycles`, `labels`, `areas`, `pages`, `contacts`, `organizations`, `pipelines` and `search`. `saveConfig` and `loadConfig` persist the token and host in the same store the CLI and MCP server use, so the three can share one sign-in. API errors are thrown; `isTRPCError(error)` tells them apart from other failures and carries the server's message.

## How it connects

- **Claude integration** — what Claude can do with your workspace, on one page: [Exponential for Claude](/features/integrations/claude).
- **API tokens** — the key everything here signs in with: [API tokens](/docs/developers/api-tokens).
- **External agents** — a separate identity for autonomous software, with the same SDK: [External agents](/docs/developers/external-agents).
- **CLI** — the same SDK on the command line, every command documented in the [CLI reference](/docs/developers/cli).
- **Zoe** — the assistant inside the app has more tools than the MCP server exposes; the MCP server is for bringing your data into *other* assistants: [Zoe](/docs/zoe/assistant).

## FAQ

**Which Claude clients work?**
Claude Desktop (configured by `init`) and Claude Code (added with `claude mcp add`). Any other MCP client that can run a local command works with the same `serve` command.

**Is the key sent to the MCP client?**
No. The key stays in the local config store (or the app's MCP configuration, if you set `EXPONENTIAL_API_KEY` there); the server reads it when it starts.

**Does the MCP server see every workspace?**
Only the workspaces you added the agent to. Add or remove them on the agent's card under [Settings → Agents](/settings/agents).

**Can I still use a personal API token?**
Yes — a JWT token from [Settings → API keys](/settings/api-keys) works too, but then everything Claude does is attributed to you.

**Can I use the SDK from Python?**
Not yet. The SDK is TypeScript; other languages can call the same HTTP API with the bearer token.
