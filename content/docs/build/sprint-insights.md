---
title: Sprint insights
description: Ask Zoe how the current sprint is going and get throughput, velocity, a burndown and risk signals computed from your actions
icon: IconChartBar
order: 3
sidebarTitle: Sprint insights
updated: 2026-09-28
---

Sprint insights are the numbers Exponential computes from the sprint your actions are assigned to: how much was planned, how much is done, what was added after the start, the velocity, a burndown, and a set of risk signals. There is no sprint page to read them on; you ask Zoe, or an [external agent](/docs/developers/external-agents) pulls them through the API. The per-cycle totals also appear on the **Metrics** page for product teams.

## Where to find it

Open Zoe from **Amplify** → **Agents** in the sidebar (see [Zoe](/docs/zoe/assistant)) or through a chat gateway such as [Chat gateways](/docs/zoe/chat-gateways), and ask about the sprint. Product teams with the Product Management plugin also get **Deliver** → **Metrics**, which shows **Velocity**, **Tickets tracked**, **Completion** and **PRs merged** per cycle.

## How to set a sprint up

Insights only exist for a workspace with an active sprint and actions in it.

1. Create a cycle: open a product from **Deliver** → **Products**, go to **Cycles**, click **New cycle**, fill in the dates and click **Create cycle**. The active cycle is the sprint.
2. Assign actions to it with the **Sprint** button on the action form. This needs **Advanced Action Features**, turned on under workspace settings → **Features**.
3. Give actions an **Effort** estimate so velocity means something, and due dates so overdue work can be flagged.
4. Move cards across the board as work progresses — the columns are the source of every count.
5. Optionally connect GitHub (see [Integrations](/docs/integrations)) so commits and pull requests can be reported alongside the sprint.

## How to ask Zoe

Ask in plain language. Some starting points:

- "What's the sprint status?" — planned, completed and added actions, the count in each board column, and the completion rate.
- "Any risks I should know about?" — the risk signals below.
- "How is our velocity trending?" — completed effort per sprint across recent sprints.
- "What got merged this week?" — commits and pull requests since a date, when GitHub is connected.
- "Give me a standup summary" — Zoe combines the above into a short update.

## What the numbers mean

- **Planned actions** are those in the sprint when it started; **added actions** joined later. The share of added work is the scope creep figure.
- **Completion rate** is the share of the sprint's actions that are done.
- **Velocity** is the effort completed in the sprint, using the workspace's effort estimates. Velocity history compares recent sprints.
- **Burndown** is the count of open actions per day from the sprint's start to its end.

Risk signals fire when:

- more than a fifth of the sprint's actions were added after it started;
- an action has sat **In Progress** for three days or more without a status change;
- actions are past their due date;
- actions are blocked by dependencies;
- the sprint is more than half over and completion is well behind the elapsed time.

## How it connects

- **Metrics page** — the in-app dashboard for cycle velocity and completion: [Retrospectives, insights & metrics](/docs/build/retros-insights-metrics).

- **[Actions](/docs/do/actions#how-to-use-the-advanced-features)** — the **Sprint**, **Effort** and **Blockers** controls feed every number here.
- **[Epics](/docs/do/epics)** — group the sprint's actions into initiatives so Zoe can report on them by theme.
- **[Zoe](/docs/zoe/assistant)** — the assistant that answers sprint questions in the app and over chat.
- **[External agents](/docs/developers/external-agents)** — an agent key can read sprint metrics, the burndown, risk signals and velocity history, and record a daily snapshot.

## Tips

- Keep the board honest. A card left in **In Progress** after the work moved on shows up as a stale-item risk three days later.
- Ask for the sprint status at the same time each day and the answers become a running log of the sprint.

## FAQ

**Is there a sprint dashboard in the app?**
Not for actions. Product teams see cycle-level velocity, completion and PR turnaround on the **Metrics** page; everything else comes through Zoe or the API.

**Can Zoe send a scheduled standup?**
There is no switch in the app for a scheduled sprint standup today. Ask Zoe for one when you need it.

**Why does Zoe say there is no active sprint?**
The sprint is the active cycle in the workspace. Create one under the product's **Cycles** page, or check that the current one has not ended.
