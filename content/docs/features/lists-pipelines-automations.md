---
title: Lists, Pipelines & Automations
description: How the three CRM building blocks fit together — what each one is, and how they connect
---

## Overview

The CRM gives you three building blocks that look similar but do different jobs. Knowing which is
which — and how they connect — is the key to setting up your workflow.

| Block | What it is | Example |
|-------|-----------|---------|
| **List** | A bag of contacts | "Newsletter subscribers", "Beta testers" |
| **Pipeline** | Contacts (as deals) moving through columns | Lead → Proposal → Won |
| **Automation** | A robot that does something when an event happens | "When a deal reaches Proposal, email the proposal" |

The short version: a **List** is *who*, a **Pipeline** is *where they are in a process*, and an
**Automation** is *what happens automatically* as they move.

## Lists

A **List** is a curated set of contacts — in or out, nothing more. A contact can be in many Lists at
the same time ("Investors" *and* "Newsletter"). Lists have no order and no stages; they're just a
named group you can act on.

The main thing you do with a List today is **send to it** — a [Broadcast](/docs/features/workflows)
emails everyone on a List (respecting each contact's unsubscribe choice).

Find Lists under **CRM → Lists**.

## Pipelines

A **Pipeline** is a Kanban board of **deals**. Each deal is a card that lives in exactly one column
(**stage**) at a time — `Lead`, `Qualified`, `Proposal`, `Negotiation`, `Won`, `Lost`. You drag a
card from one stage to the next as the deal progresses, and the board remembers where every deal sits.

A deal is its own thing — it links to a contact and an organization, and carries a value, a win
probability, and an expected close date. One contact can have several deals.

Stages are fully customizable per workspace (rename, recolor, reorder, add, remove) from the pipeline
settings. Find your Pipeline under **CRM → Pipeline**.

## Automations

An **Automation** is a *trigger → steps* recipe run by Exponential's automation engine. You build it
on a visual canvas (**CRM → Automations**): one **trigger** at the top, then an ordered list of
**steps** beneath it (send a welcome email, generate an agreement, …).

Automations run in a straight line — step 1, then step 2, then step 3 — with no branching. They start
**inactive** so you can build safely, and only run once you explicitly activate them.

## How they fit together

This is the mental model worth holding onto:

- A **List** answers *who*.
- A **Pipeline** answers *where each contact is in a process*.
- An **Automation** answers *what happens automatically* when something changes.

They are deliberately kept separate — a "bag of contacts" and a "board of stages" are genuinely
different (a contact is in many Lists at once, but in only one pipeline stage). They connect through
**events**: something happens, and an Automation reacts.

**Example 1 — onboarding.** You tag a new contact as a *Channel Partner*. That change is an event. An
Automation listening for it sends the welcome email and generates the partner agreement. The contact
record stays a contact; the Automation just reacted to the change.

**Example 2 — the pipeline.** You drag a deal into the *Proposal* column. That move is an event. An
Automation listening for "entered Proposal" sends the proposal email and schedules a follow-up. The
board stays the board; the Automation is a sticky note on the column saying *"on arrival here, do
this."*

In other words: **the board is the view you look at, and Automations are hooks attached to its
stages.** You don't manage automations on a separate screen divorced from your board — they hang off
the stages your contacts and deals move through.

## Next steps

- [CRM (Contacts & Organizations)](/docs/features/crm)
- [Workflows & Broadcasts](/docs/features/workflows)
