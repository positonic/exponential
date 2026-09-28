---
title: Lists, pipelines & automations
description: How the three CRM building blocks fit together — who, where they are in a process, and what happens automatically
icon: IconBolt
order: 2
sidebarTitle: "Lists, pipelines & automations"
updated: 2026-09-28
---

The CRM gives you three building blocks that look similar but do different jobs. A **List** is *who*, a **Pipeline** is *where each contact is in a process*, and an **Automation** is *what happens automatically* when something changes.

| Block | What it is | Example |
|-------|-----------|---------|
| **List** | A named group of contacts | "Newsletter subscribers", "Beta testers" |
| **Pipeline** | Deals moving through stage columns | Lead → Proposal → Won |
| **Automation** | Steps that run when a trigger fires | "When a contact becomes a Channel Partner, send the welcome email" |

## Where to find it

**Connect → CRM** in the sidebar, then **Lists**, **Pipeline** or **Automations** in the CRM menu. Contacts and organizations themselves are covered on [CRM contacts & organizations](/docs/crm/contacts).

## Lists

A list is a curated set of contacts: in or out, nothing more. A contact can be in many lists at once ("Investors" *and* "Newsletter"). Lists have no order and no stages.

1. Open **Lists** and click **Create list**.
2. Give it a **List name**.
3. Open the list, pick contacts under **List members** and click **Add**. A contact's own page shows the lists it is on under **Lists**.

Two things use a list: a **Broadcast** (under **Broadcasts** in the CRM menu (see [Pipeline, forms & broadcasts](/docs/crm/pipeline-forms-broadcasts))) emails everyone on the list, skipping anyone who has unsubscribed, and the list's own **Automations** section runs an automation whenever a contact is added to the list.

## Pipelines

A pipeline is a Kanban board of **deals**. Each deal is a card in exactly one column (a **stage**) at a time. A new pipeline starts with **Lead**, **Qualified**, **Proposal**, **Negotiation**, **Won** and **Lost**; rename, recolor, reorder, add or remove stages under **Pipeline Settings**. A workspace can have several pipelines; switch between them with the selector at the top of the board.

A deal is its own record: it links to a contact and an organization and carries a value, a win probability and an expected close date. One contact can have several deals. Drag a card between columns as the deal progresses.

## Automations

An automation is a trigger followed by an ordered list of steps, built on a visual canvas.

1. Open **Automations** and click **Create new automation**.
2. Give it a **Name** and choose the trigger: **when Customer type is set to** a given Profile Type (for example *Investor*).
3. The automation opens in the builder. Add steps (send an email, generate an agreement, and so on) in the order they should run.
4. Activate it when you are ready. New automations start **inactive** so you can build safely, and an automation cannot be activated without a trigger type.

Steps run in a straight line — step 1, then step 2, then step 3 — with no branching.

## How they fit together

- A **List** answers *who*.
- A **Pipeline** answers *where each contact is in a process*.
- An **Automation** answers *what happens automatically* when something changes.

They are deliberately kept separate: a contact can be in many lists but in only one stage of a pipeline. They meet through events. Setting a contact's **Profile Type** to *Channel Partner* is an event; an automation listening for it sends the welcome email and generates the partner agreement, and the contact record itself stays a contact. Adding a contact to a list is another event, and the list's automations react the same way.

## How it connects

- **[CRM contacts & organizations](/docs/crm/contacts)** — the records that lists, deals and automations act on.
- **Broadcasts** — the CRM's bulk email, sent to a list; find it under **Broadcasts** in the CRM menu.
- **[Notifications](/docs/collaborate/notifications)** — automation emails go to your contacts; your own notifications are configured separately.

## FAQ

**Can an automation trigger when a deal enters a stage?**
Not yet. Automations trigger on a contact's Profile Type today, and lists can run automations when a contact is added. Pipeline-stage triggers are not available.

**Can an automation branch?**
No. Steps always run in order, one after the other.

**Does a broadcast go to contacts who unsubscribed?**
No. A contact who opted out is skipped even if they are on the list.
