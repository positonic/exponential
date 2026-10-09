---
title: Notion
description: Sync a Notion database with a project, map its status values to kanban columns, and choose which way changes flow
icon: IconBrandNotion
order: 3
sidebarTitle: Notion
updated: 2026-09-28
---

Connect a Notion database to a project and actions flow between them: pull from Notion, push to Notion, or both. Notion's status values are mapped to your kanban columns, so an item marked "Doing" in Notion lands in **In Progress** here.

## Where to find it

- **Per project (recommended):** open the project, then its **Integrations** tab → **Notion Tasks Sync**.
- **Across projects:** the [Workflows page](/workflows) (user menu → **Workflows**) → **Notion Tasks Database** → **Configure**.
- **Accounts:** Notion accounts are connected under [Settings → Integrations](/settings/integrations) → **Add Integration** → provider **Notion** → **Connect with Notion**. Connecting from the project wizard does the same thing.

## How to sync a project with Notion

1. Open the project, click the **Integrations** tab, then **Setup Integration** under **Notion Tasks Sync**.
2. **Account** — pick a connected Notion account, or click **Connect** and approve Exponential in Notion.
3. **Database** — choose the **Notion Database**. If it is missing, share it with Exponential in Notion first (open the database, **...** → **Connections**) and try again.
4. **Status** — map Notion's values to your columns (see below).
5. **Sync** — choose a **Sync Direction** (**Pull from Notion**, **Push to Notion** or **Bidirectional**) and a **Sync Frequency** (**Manual**, **Hourly** or **Daily**).
6. Click **Save Configuration**.

The Integrations tab now shows **Configure Notion** to change any of this, and **Configure Project** to limit the sync to one Notion project.

## How to map statuses

Notion status values become your kanban columns: **Backlog**, **To Do**, **In Progress**, **In Review**, **Done** and **Cancelled**.

1. On the **Status** step, choose the **Status Property** — the wizard lists the database's status and select properties.
2. Click **Auto-detect** to match common names ("Doing" → **In Progress**, "Complete" → **Done**), then fix any row with its **Select column** dropdown.
3. Values you leave unmapped use the default mapping.

If the database has no status or select property, the wizard says so and applies the default mapping automatically. A checkbox property also works: checked syncs as **Done**, unchecked as not started.

## How to sync from the Workflows page

Use this route for one sync that gathers actions from several sources, or to run and manage syncs you have already set up.

1. Open [Workflows](/workflows) → **Notion Tasks Database** → **Configure** and follow **Workflow Setup Steps**: create a Notion internal integration (**Open Notion**), paste its secret with **Add Secret**, share the database with it in Notion, then click **Setup Sync**.
2. In **Create Notion Workflow**, name the workflow, pick a **Tasks Database** (and optionally a **Projects Database**), and match the **Title**, **Assignee**, **Due Date**, **Priority** and **Description** properties.
3. Choose an **Action Source** (Fireflies meetings only, internal actions only, or all actions), a **Sync Direction** and a **Sync Frequency**, then save.

Existing syncs are listed under **Active Notion Workflows** with **Sync Now**, **Edit** and **Delete**.

## How it connects

- [Projects](/docs/do/projects) — each sync belongs to one project; synced items appear on its board.
- [Fireflies](/docs/meet/fireflies) — with **Action Source** set to Fireflies meetings, actions extracted from meetings are pushed to Notion.
- [Integrations](/docs/integrations) — connected Notion accounts live with your other services.

## Tips

- Choose **Pull from Notion** when your team plans in Notion and you only want to see the work here — nothing you do in Exponential overwrites theirs.
- Name statuses in Notion the standard way ("To Do", "In Progress", "Done") and **Auto-detect** does the mapping for you.

## FAQ

**Which columns can I map to?**
The six kanban columns above. Custom columns are not supported yet.

**Can I set a mapping once for the whole workspace?**
Not from the app. Mappings are set per project; a project without its own mapping uses the defaults.

**My database doesn't show up.**
Share it with the integration in Notion: open the database, click **...**, choose **Connections** and add Exponential (or your internal integration). Then reopen the wizard.

**What happens to a status I didn't map?**
It follows the default mapping — "Not started", "Backlog" and "Icebox" go to **Backlog**, "Todo" to **To Do**, "Doing" to **In Progress**, "Review" to **In Review**, "Complete" or "Finished" to **Done**.
