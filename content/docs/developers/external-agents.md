---
title: External agents
description: Connect third-party AI agents to Exponential as first-class team members with their own identity, scoped access and revocable keys
icon: IconRobotFace
order: 2
sidebarTitle: External agents
updated: 2026-11-09
---

External agents let you connect autonomous AI software — [Hermes Agent](https://hermes-agent.nousresearch.com/), MCP clients, custom scripts, anything that can send an HTTP request — to Exponential **as its own identity**, not as you. When your agent creates an action, the action says the *agent* created it, and the workspace's activity feed and members list show it with an **agent** badge. This is different from Zoe, who works *with* you in a conversation and acts as you with your confirmation.

![The External agents page under Settings → Agents](/doc-assets/agents-settings.png)

## Where to find it

[Settings → Agents](/settings/agents) (user menu → **Settings** → **Agents**). To go straight to the create form, open [/settings/agents/new](/settings/agents/new).

## How to create an agent

1. Click **New agent** (or open [/settings/agents/new](/settings/agents/new)). A panel opens on the right.
2. Give it a **Name** ("Hermes", "Claude Code") and an optional description of the work it should get.
3. Pick its **Workspaces**. The agent joins each one as a **member**; only workspaces where you have at least member access yourself are offered.
4. Keep or change the **Key label** (for example "laptop") and click **Create agent**. Clear the label to create the agent without a key.
5. Copy the key now — it starts with `exp_agent_` and is never shown again. Click **Done**.

To add more workspaces or keys later, use **Add** next to **Workspaces** and **New key** under **Keys** on the agent's card.

## How to point your software at Exponential

Your agent authenticates by sending the key as a Bearer token:

```
Authorization: Bearer exp_agent_...
```

For agent software that runs shell commands (like Hermes), the simplest path is the Exponential CLI with the agent key as its token — see [API tokens](/docs/developers/api-tokens#how-to-use-a-token).

## How to give an agent access to a restricted project

Joining a workspace makes the agent an ordinary **member**, so it sees what members see. A [restricted project](/docs/collaborate/members-and-access#how-to-open-or-close-a-project) is the exception: only the project's creator, its project members and workspace admins can see it and the pages, meetings and actions inside it. An agent is never a workspace admin, so a restricted project refuses it until a project admin adds it:

1. Find out which account the agent is. Run `exponential auth whoami` with the agent's key — it prints the account's name and id and says it is an agent, and who owns it. The same account appears in the workspace **Members** list with an **agent** badge.
2. Open the project, go to its **Members** tab and search for the agent by name. Agents in the project's workspace are listed with an **Agent** badge.
3. Add it as **Editor** (to create and edit pages and actions in the project) or **Viewer** (read only). Agents can't be project admins.

Two rules keep this safe. The agent's owner must already have access to the project — a project admin can't let someone's agent in around them — and when the owner is removed from the project, their agents leave with them.

If the agent is refused, the error says why. A refusal on a restricted project reads like `Access denied: Claude Desktop (cmsf…, an agent owned by James) can't read this page. "Manage Syntrofi" is a restricted project and Claude Desktop is not one of its members. A project admin can add Claude Desktop under the project's Members tab.`

## How to rotate or revoke a key

- Each agent can hold up to 10 keys. Create a second key, move your software to it, then revoke the first — no downtime.
- To revoke, click the revoke icon on the key's row. It takes effect on the agent's next request.
- The key table shows **Last used** and **Expires**, so you can spot stale or unexpected activity.
- Deleting the agent removes its keys and workspace access immediately; its past work stays attributed to it.

## What an agent can and cannot do

External agents are deliberately more limited than human members:

- **Member role only.** An agent is always a workspace *member* — never an owner or admin. It cannot manage members, change workspace settings or manage other agents. In a restricted project it is at most an *editor*, and only once a project admin adds it (see above).
- **Your access is the ceiling.** If you leave a workspace or are changed to viewer, your agents lose that workspace immediately.
- **No credential minting.** Agents cannot create API tokens, connect integrations or generate other credentials.
- **Admins can remove it.** A workspace admin can remove an agent from the **Members** list at any time without touching your keys.

## How it connects

- **MCP server and SDK** — the client libraries an agent can use with its key: [MCP server & SDK](/docs/developers/mcp-and-sdk).

- [API tokens](/docs/developers/api-tokens) — tokens act *as you*; use them for webhooks and personal automation instead.
- [Zoe, your assistant](/docs/zoe/assistant) — the built-in assistant that works with you in a conversation.
- [Workspaces](/docs/collaborate/workspaces#roles) — what a member can and cannot do.

## FAQ

**Can an agent be read-only?**
Not yet. Agents always join as members. A read-only (viewer) tier is planned.

**Can my whole team share one agent?**
Agents are personal — each belongs to the user who created it, and its access is tied to that user's. Shared workspace-owned agents are under consideration.

**Does this replace API tokens?**
No. [API tokens](/docs/developers/api-tokens) act as you and are right for webhooks and personal automation. Use an external agent when software should have its own identity and audit trail.

**I assigned an action to my external agent — does Exponential run it?**
No. An external agent is software you run; it polls for the actions assigned to it (`exponential actions list` with its key) and works them itself, commenting and changing status as it goes. Exponential starts a hosted run only when you assign your built-in [assistant](/docs/zoe/assistant-runs), which has no software of its own. The two never overlap: the same assignment is either yours to pick up or the assistant's to run.

**How do I see what an agent did?**
Actions it created list the agent as creator, and the workspace activity feed shows its entries with an **agent** chip.
