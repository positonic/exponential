---
title: Epics
description: Group related actions together into larger initiatives to see the bigger picture
icon: IconStack2
order: 4
updated: 2026-09-29
---

Sometimes a single action is not enough to capture a bigger piece of work. That is where Epics come in. An epic is simply a way to group related actions under one umbrella, so you can track progress on a larger initiative at a glance. Think of epics like chapters in a book — each chapter (epic) holds several pages (actions) that tell the same story.

## Where to find it

Epics live inside the action form, behind the **Epic** button. Two things need to be in place first:

- **Advanced Action Features** must be on. A workspace owner or admin turns it on under [workspace settings → **Features**](/go/settings) (see [Workspace settings](/docs/reference/workspace-settings#advanced-action-features)).
- Every epic belongs to a **Product**, so the Product Management plugin must be on and at least one product must exist.

## How to create an epic

You can create an epic right from the action form — no need to leave what you are doing.

1. Open an action, or click the **Create Action** button (⌘N) above the sidebar items.
2. Click the **Epic** button.
3. Click **New Epic** at the bottom of the list.
4. Fill in the **Name** (required), a **Description**, the **Product** it belongs to, a **Priority** (**High**, **Medium**, **Low** or **None**), and an optional **Start Date** and **Target Date**.
5. Click **Create**.

Your new epic is ready to use straight away.

## How to put an action in an epic

1. Open the action and click the **Epic** button.
2. Pick the epic from the list. Each row shows the epic's status and how many actions it already holds.

The button turns purple and shows the epic's name. Click it again to switch epics or clear it.

## How to follow an epic's progress

Every epic has a status that moves through simple stages:

| Status | What it means |
|--------|---------------|
| **Open** | Work has not started, or is just getting going |
| **In Progress** | Someone is actively working on it |
| **Done** | All the work is complete |
| **Cancelled** | The initiative is no longer needed |

Open an epic to see its **Status**, **Priority**, **Product**, **Owner**, **Start** and **Target** dates, and the **Actions** and **Tickets** inside it. Change the status, priority or dates from there.

## How it connects

- **[Actions](/docs/do/actions)** — the building blocks inside an epic; assign them with the **Epic** button.
- **[Projects](/docs/do/projects)** — projects group work by outcome; epics group it by initiative, and an epic's actions can come from several projects.
- **Sprints** — assign an epic's actions to a cycle with the **Sprint** button next to **Epic** (see [Actions](/docs/do/actions#how-to-use-the-advanced-features)).

## Tips

- An epic should be a meaningful chunk of work — bigger than one action, smaller than a project. "Redesign onboarding flow" or "Q1 marketing campaign" are the right size.
- Even a rough **Target Date** gives everyone a shared sense of when the initiative should wrap up.
- Check on your epics during the [weekly plan](/docs/reflect/weekly-plan): are they moving, or do any need to be reprioritised or cancelled?

## FAQ

**I do not see the Epic button.**
Turn on **Advanced Action Features** in [workspace settings → **Features**](/go/settings). If it is on and the list is empty, you also need a product to attach the epic to.

**Is there a page listing all my epics?**
Not yet. Assign and switch epics from the action form; each epic has its own page once you open it.

**Can an epic span more than one project?**
Yes. An epic groups actions, and those actions can belong to any project in the workspace.
