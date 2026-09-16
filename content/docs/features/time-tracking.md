---
title: Time Tracking
description: Track where your time goes with a timer, let an agent propose the rest of your day, and confirm it in one click
---

## Overview

Time tracking shows where your days actually went: per task, per project and per product.

Time can reach Exponential in two ways:

- **You record it.** Start a timer from the Chrome extension, or log an entry from the CLI. This is **your time**, and it is always treated as correct.
- **An agent proposes it.** An [external agent](/docs/features/external-agents) can log time on your behalf, for example by reading yesterday's AI coding conversations. This is **proposed time**. It shows on your Time page straight away, but nothing counts until you confirm it.

Most people end up using both. The agent fills in the work it can see, and you use the timer for what it can't, like calls, whiteboard sessions and reading.

## The Time Page

Open **Time** from the sidebar, just below **Today**, or go to [exponential.im/time](https://www.exponential.im/time). The header shows your totals for **Today** and this **Week**. Use the **Day / Week** switch to change view, and the workspace menu to narrow it to one workspace.

### Week view

The week view lists your time entries grouped by day, most recent first, with three reports underneath:

- **By project** — hours per project
- **By action (top 10)** — the tasks that took the most time
- **Daily totals** — hours per day across the range

Click any entry to edit it. You can change when it **Started** and **Ended**, **Reassign** it to a different task, or delete it.

### Day view

The day view is built for the question "what did I do yesterday?".

| What you see | What it means |
|---|---|
| **Attention** | The minutes you spent working. If two entries overlap, each minute is counted once. |
| **Session** | The plain total of all your entries. It is higher than attention whenever you work on two things at once. |
| **Agent-run** | Time an agent spent working on your tasks while you were not involved. Shown separately and never added to your attention. |
| **Proposed** | How many entries are waiting for you to confirm them. |
| **Unassigned** | How many entries sit on tasks that belong to no project or ticket. |

Below the headline you'll find:

- **By product** and **By action** charts
- A **Timeline** with one lane per product, an **Unassigned** lane, and an **Agent-run** lane last
- A table of every task with its **Ticket**, **Product**, **Attention** and **Agent-run** time

When two entries overlap, the product and task charts split the shared minutes evenly between them, so the charts add up to your attention time. Your entries themselves are never shortened.

## Tracking Time Yourself

### With the timer

1. Open the [Chrome extension](/docs/features/chrome-extension) and go to the **Track Time** tab
2. Type what you're working on, or pick an existing task
3. Start the timer

The running timer appears in the Exponential sidebar, where you can stop it with **Stop timer**. You can only run one timer at a time. Starting a new one stops the previous one automatically.

### From the command line

Log a finished block of time with explicit start and end times. This never touches a running timer.

```bash
exponential time log --action <action-id> --from 2026-09-11T14:00 --to 2026-09-11T15:30 --note "Planning call"
```

Entries you log with your own sign-in count as your time and are confirmed immediately. See [Using the CLI](#using-the-cli) below for setup.

## Proposed Time

When an external agent logs time for you, the entry is created as **proposed**:

- It belongs to **you** and appears on your Time page, but the agent is recorded as the one who wrote it.
- It is marked with a **proposed** badge in the week view and drawn dashed on the day timeline.
- It does **not** count towards a task's time spent until you confirm it.
- An agent can never confirm time. Only you can.

### Confirming a day

1. Open **Time** and switch to **Day**
2. Pick the day and check the entries look right
3. Click **Confirm day**

Every proposed entry on that day becomes confirmed, and the tasks' time spent updates. If you've picked a workspace in the workspace menu, only that workspace's entries are confirmed. If nothing was proposed, the button is disabled.

**Editing a proposed entry confirms it.** If you change its times or move it to another task, the agent treats it as settled and will never change it again, even if it runs again for the same day.

### Your time always wins

When proposed time overlaps something you recorded yourself, Exponential keeps yours:

- **Same task.** If the agent proposes time on a task you already timed, the proposal is dropped. Your entry gets a note linking to where the proposal came from.
- **Different task.** If the agent proposes time on another task during minutes you already timed, the proposal is trimmed to the minutes you didn't cover. If that leaves nothing, or less than 5 minutes, nothing is added.
- **Your entries are never changed.** The agent never moves, shortens or reassigns time you recorded.

### Forgotten timers

If a timer you ran ends more than an hour after your last recorded activity that day, the week view marks it **forgotten timer?**. Exponential leaves it exactly as it is. Click the entry and fix the end time if the timer ran on.

## Unassigned Time

Some work doesn't belong to a project or ticket yet, such as a strategy memo or a research session. Its time lands as **Unassigned** rather than being guessed into the wrong place.

To place it:

1. Open **Time** → **Day**
2. In the task table, click **Assign** on the unassigned row
3. Search for a project or ticket and pick it

Leave **Remember for conversations with this title** ticked, and the next time an agent logs work under the same title it lands in the same place automatically.

## How Time Rolls Up

Every time entry belongs to a task. The task decides where the time is counted:

- A task linked to a **ticket** counts towards that ticket's **product**
- Otherwise, a task in a **project** counts towards that project's **product**
- A task with neither is **Unassigned**

For product teams, the cycle **Metrics** page also shows how much confirmed time went into work with no ticket, so untracked work is visible rather than discovered by hand.

## Daily Summary

If you receive the [Daily summary](/docs/features/notifications#daily-summary), it includes a line for yesterday's time:

```text
Yesterday's time: 1h 32m across Exponential, CLEAR, 2 proposed → /time
```

The link opens the Time page, so a proposed day is one click away from being confirmed. On a day with no recorded time, the line reads **No time recorded yesterday**.

## Using the CLI

### Set up

Install the CLI, then sign in with a **JWT Token** created under **Tokens** in the sidebar (see [API Access](/docs/features/api-access)):

```bash
npm install -g exponential-cli
exponential auth login --token <your-token> --api-url https://www.exponential.im
```

To let an agent log time for you, give the agent its own key instead. Under an agent key, every entry is created as **proposed** and belongs to you. See [External Agents](/docs/features/external-agents).

### Commands

| Command | What it does |
|---|---|
| `exponential time log` | Log one finished entry with `--action`, `--from` and `--to`. Add `--note` for a one-line description. |
| `exponential time log --from-file <file>` | Log many entries at once from a JSON file. Use `-` to read from standard input. |
| `exponential time list --date YYYY-MM-DD` | List a day's entries with their status. Add `--proposed` to see only proposed ones. |
| `exponential time report --date YYYY-MM-DD` | The same numbers the Day view shows. Outputs JSON when piped. |
| `exponential time confirm --date YYYY-MM-DD` | Confirm a day from the terminal. Works with your own sign-in only. |
| `exponential time segment` | Turn a conversation's message timestamps into entries. See below. |
| `exponential actions upsert` | Create a task for an outside source, or update it if it already exists. |

Every command that takes a date also accepts `--workspace` to limit it to one workspace.

### Logging many entries

A batch file is a JSON array. Each entry needs a task and a start and end time:

```json
[
  {
    "action": "<action-id>",
    "from": "2026-09-11T09:20",
    "to": "2026-09-11T10:30",
    "note": "Fixed the slow create-task modal",
    "ref": "my-tool:session-42#0"
  }
]
```

Accepted fields are `action`, `from`, `to`, `note`, `ref`, `source` and `status`. Unknown fields are rejected, so a typo never silently drops data.

**Use `ref` to make logging safe to repeat.** An entry with the same `ref` is updated instead of duplicated. Once you've confirmed or edited it, a repeat run leaves it alone.

### Recipe: logging your AI coding sessions

If you work with an AI coding assistant, its conversation history already records when you were working. You can turn that into proposed time with three commands, run by a script or a scheduled job under an agent key.

**1. Create one task per conversation.** The same source ID always maps to the same task, so running this again only refreshes the title:

```bash
exponential actions upsert --source-type ai-session --source-id <conversation-id> \
  -t "Fix the slow create-task modal" --workspace <workspace>
```

Add `--ticket` or `--project` if you know where the work belongs. If you don't, the task lands as Unassigned for you to place.

**2. Cut the conversation into working stretches.** Give `time segment` the timestamps of each message:

```json
[
  { "at": "2026-09-11T09:22:10Z", "role": "user" },
  { "at": "2026-09-11T09:23:45Z", "role": "assistant" }
]
```

A gap of more than 30 minutes between your messages ends one stretch and starts the next. Each stretch is widened to whole 5-minute marks, so 09:22 to 10:28 becomes 09:20 to 10:30. Long runs where only the assistant was working become **Agent-run** time instead of yours.

**3. Pipe the result straight into `time log`:**

```bash
exponential time segment --from-file messages.json --action <action-id> \
  --ref-prefix ai-session:<conversation-id> \
| exponential time log --from-file -
```

Each stretch gets a stable reference, so running the recipe twice for the same day changes nothing. Open **Time → Day** the next morning, check the day, and click **Confirm day**.

## FAQ

**Why doesn't proposed time count straight away?**
So an agent can be wrong without consequence. Proposed entries show you what the agent saw, but your task totals and reports only move once you've agreed.

**Can an agent change time I recorded myself?**
No. Your own entries always win. The agent can only add a note to them, never change their times, task or owner.

**Why is my session time higher than my attention time?**
You worked on more than one thing at once. Session time adds up every entry. Attention time counts each minute once.

**Does agent-run time count as my time?**
No. It is shown on its own lane and in its own column so you can see how much the agent did, but it never adds to your attention hours.

**Can I start a timer from the Exponential web app?**
Not yet. Start timers from the [Chrome extension](/docs/features/chrome-extension), and stop them from either the extension or the Exponential sidebar. You can log finished blocks of time from the CLI.
