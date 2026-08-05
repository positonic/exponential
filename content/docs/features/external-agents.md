---
title: External Agents
description: Connect third-party AI agents to Exponential as first-class team members with their own identity, scoped access, and revocable keys
---

## Overview

External agents let you connect autonomous AI software — [Hermes Agent](https://hermes-agent.nousresearch.com/), MCP clients, custom scripts, anything that can send an HTTP request — to Exponential **as its own identity**, not as you.

When your agent creates a task, the task says the *agent* created it. Your workspace's activity feed and members list show the agent with an **agent** badge, so everyone can see what the software did versus what you did.

This is different from Zoe, Exponential's built-in assistant: Zoe works *with* you in a conversation and acts as you with your confirmation. An external agent works *for* you, on its own, under its own name.

## How It Works

1. **Create an agent** — give it a name ("Hermes", "Standup Bot").
2. **Grant it workspaces** — the agent joins as a **member** of workspaces you choose. It can only join workspaces where you yourself have at least member access.
3. **Create a key** — a secret starting with `exp_agent_`, shown exactly once. Put it in your agent software's configuration.
4. **The agent works** — it authenticates with the key and sees only the workspaces you granted. Everything it does is attributed to it.

## Setting Up

### Create an Agent

1. Go to **Settings → Agents**
2. Click **New agent** and name it
3. Click **Add** next to *Workspaces* and pick where it may work
4. Click **New key**, label it (e.g. "laptop"), and **copy the key immediately** — it is never shown again

### Point Your Software at Exponential

Your agent authenticates by sending the key as a Bearer token:

```
Authorization: Bearer exp_agent_...
```

For agent software that runs shell commands (like Hermes), the simplest path is the [Exponential CLI](/docs/features/api-access) with the agent key as its token.

## Access & Safety

External agents are deliberately more limited than human members:

- **Member role only.** An agent is always a workspace *member* — never an owner or admin. It cannot manage members, change workspace settings, or manage other agents.
- **Your access is the ceiling.** An agent can never do more than you can. If you leave a workspace or are changed to viewer, your agents lose that workspace immediately and automatically.
- **No credential minting.** Agents cannot create API tokens, connect integrations, or generate any other credentials.
- **Revocation is instant.** Deleting a key blocks the agent on its very next request. Workspace admins can also remove an agent from the members list at any time, without touching your keys.

## Keys

- A key is shown **once**, at creation. Store it in your agent's config; if you lose it, revoke it and create a new one.
- Each agent can hold up to 10 keys — create a second key and delete the first to rotate without downtime.
- The Agents page shows each key's **last used** time, so you can spot stale or unexpected activity.

## Attribution

Everything an agent does is recorded under the agent's own name:

- Tasks show the agent as creator, with source `agent`
- The workspace **activity feed** shows the agent's actions with an agent badge
- The **members list** shows the agent as a member with an agent badge

Deleting an agent removes its keys and workspace access immediately; its past work stays attributed to it in your history.

## FAQ

**Can an agent be read-only?**
Not yet. Agents always join as members. A read-only (viewer) tier is planned.

**Can my whole team share one agent?**
Agents are personal — each agent belongs to the user who created it, and its access is tied to that user's. Shared workspace-owned agents are under consideration.

**Does this replace API tokens?**
No — [API tokens](/docs/features/api-access) act *as you* and are right for webhooks and personal automation. Use an external agent when software should have its own identity and audit trail.
