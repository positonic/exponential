---
title: Hand work to your assistant
description: Assign an action to your assistant and let it research, delegate or do the work inside Exponential while you watch the result come in
section: zoe
order: 2
icon: IconRobot
sidebarTitle: Assign to your assistant
updated: 2026-10-10
---

Your assistant is more than a chat partner: it can be **assigned an action** like any teammate. When you do, it goes to work on its own — reading what it needs, commenting, creating sub-actions or handing the action to the right person — and reports back with a summary for you to confirm. Everything it does is recorded under its own name, never yours.

## Where to find it

Open any action and click the **Assignees** row, or use the assign option on an action in a list. Your assistant is pinned first under **Your assistant**; teammates' assistants are listed under **Assistants**, labelled with their owner's name, and people come after. You need an assistant first — set one up in [Settings → AI assistant](/settings/assistant).

## How to hand an action to your assistant

1. Open the action and click the **Assignees** row.
2. Tick your assistant under **Your assistant** and click **Save Changes**.
3. The action's status dot becomes a spinning ring, and a pill appears above **Activity**: **Aria · Working 1m · called 3 tools**. The pill updates every couple of seconds while the run is live; click **Cancel** on it to stop the run.
4. When it finishes the pill reads **Worked for 2m · called 12 tools**, you get a notification, and the summary is on the pill (hover it) and in the action's comments. You, as the owner, can expand the **transcript** under the pill to see each step; teammates see the pill and the summary only.

## What your assistant will and will not do

- It reads anything you can read: your projects, actions, goals, meetings, calendar, email, CRM and Notion.
- It writes **only inside Exponential**: comments on the action, action fields, sub-actions, and reassigning to a person or another assistant.
- It **never sends email, books calendar events, or writes to Notion or your CRM** on its own. If the work needs one of those, it does everything up to that step and asks you.
- It **never marks the action done**. It tells you when the work is ready and you confirm.

## When it needs you

If it gets stuck on something only you can decide, it posts a comment on the action mentioning you and the pill reads **Waiting on owner**. Reply in the action's comments — your reply resumes the run with the thread so far.

## How it connects

- **Notifications** — a finished or stopped run sends you one notification; tune the channels under **Assistant runs** in [Settings → Notifications](/settings/notifications). See [Notifications](/docs/collaborate/notifications).
- **Time** — a finished run logs a proposed time entry on the action for the time it worked, marked as your assistant's work on your behalf.
- **Teammates' assistants** — you can assign a colleague's assistant too; it works as their assistant, with their permissions, and reports to them and to you.
- [Zoe, your assistant](/docs/zoe/assistant) — chatting with Zoe is different: in chat she acts as you and confirms before changing anything.
- [External agents](/docs/developers/external-agents) — software you run yourself under its own identity; assigning it an action does not start a run here, it picks the work up on its own.

## Tips

- Write the action's description the way you would brief a new colleague: the goal, what good looks like, and where to look. The assistant works from that brief.
- Give your assistant instructions once in [Settings → AI assistant](/settings/assistant) ("always propose two options", "never contact clients") and every run follows them.

## FAQ

**Can I assign the same action to my assistant twice?**
While a run is live, re-assigning does nothing. Once it has finished, assign again to start a new run.

**What happens if it takes too long?**
A run that stops reporting for five minutes is marked **Stopped**; you are notified and can assign again.

**Where do I see everything my assistant is working on?**
A **Delegated** tab in the Inbox listing live, waiting and finished runs is coming next; until then, each action's page shows its own run.

**Does the assistant see my private things?**
It sees what you see and acts within your permissions. Its transcript is visible only to you.
