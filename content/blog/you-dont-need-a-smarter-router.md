---
title: "You Don't Need a Smarter Router. You Need State."
description: "Everyone's asking for an AI routing layer. But the real problem isn't which model to use — it's that no system remembers what you're trying to accomplish."
date: "2026-02-26"
author: "James Farrell"
tags: ["AI", "productivity", "vision", "architecture"]
---

I saw a post on LinkedIn this week that stopped me mid-scroll.

The gist: someone described switching between three different LLMs for different tasks, copy-pasting context from one to the other, and wishing for a "missing layer" that would apply personal rules before routing work. High-stakes decisions go to a model council. Low-risk admin goes to the cheapest model. Design work goes to Canva, not an LLM at all. And if context already exists in Notion, don't make me re-paste it.

"I want to set the priorities, guardrails and tools I use once," she wrote, "then let the system delegate appropriately."

Hundreds of people agreed. And I get it. The friction is real.

But I think the diagnosis is wrong.

## The Router Fantasy

What she's describing — and what a lot of people are building toward — is essentially a smart dispatcher. A traffic cop that sits between you and your tools:

- If the task is creative → route to Claude
- If it's analytical → route to GPT
- If it's visual → route to Canva
- If it's low-stakes → route to the cheapest model

This sounds elegant. It's also a dead end.

Here's why: **a router without state is just a fancy if-statement.** It can match patterns, but it can't make judgment calls. And the judgment calls are where all the value lives.

Consider: how does a router know that this design task is high-stakes? Not because you tagged it — you're trying to avoid that kind of manual overhead. It's high-stakes because it's the landing page for a product launch that's tied to your Q3 revenue target, which your team committed to in last week's planning session. The router would need to know all of that. It would need *state*.

Or: how does it know not to re-paste context from Notion? Not because it indexed your Notion (though that helps). It's because it understands that the brief you wrote last Tuesday, the feedback from the client call on Wednesday, and the design direction you approved on Thursday are all part of the same project — and it knows which version is current. That's not search. That's *state management*.

## The Real Problem

The friction this person is experiencing isn't a routing problem. It's a state problem.

Every time she opens a new LLM, she starts from zero. Not because the LLM is dumb, but because **no system maintains the state of her work**. Her goals, her projects, their current status, what's blocked, what's urgent, what matters this quarter — all of that lives in her head, spread across a dozen tools, reconstructed from memory every time she sits down.

The LLMs are stateless. Her project management tool doesn't talk to her AI. Her calendar doesn't inform her priorities. Her meeting transcripts don't automatically become action items assigned to the right person in the right project.

So she compensates by becoming the router herself. She's the integration layer. She's the state manager. She copies and pastes context because she's the only system that has it all.

**This is the actual bottleneck.** Not which model to use. Not even which tool. It's that no system holds the full picture of what she's trying to accomplish, why it matters, and where everything currently stands.

## State Changes Everything

When you have state — real, structured, living state about your work — routing becomes trivial.

If the system knows your goals, your outcomes, your projects, and the current status of every action item, it doesn't need you to tell it that this task is high-stakes. It *knows*. It can see that this action is connected to your most important outcome this quarter, that the deadline is in three days, and that two other people are waiting on it.

If the system knows your meeting was just transcribed and that three action items came out of it, it doesn't need you to copy-paste anything. It extracts the actions, links them to the right projects, sets priority based on your existing commitments, and updates your daily plan.

If the system maintains context about every project you're working on, it doesn't matter whether Claude or GPT or Gemini does the actual generation. The model is interchangeable. The state is not.

**This is the layer that's actually missing.** Not a router between tools. An operating system that maintains the state of your work and uses it to coordinate everything downstream.

## Four Layers, Not One

The way I think about it, there are four layers to this stack:

| Layer | What It Does | Example |
|-------|-------------|---------|
| **Strategic Direction** | Defines what matters and where you're headed | Goals, outcomes, quarterly priorities |
| **Work Coordination** | Breaks strategy into execution and tracks state | Projects, actions, daily plans, progress |
| **Tool Orchestration** | Routes work to the right executor | Which agent, which model, which SaaS tool |
| **Individual Tools** | Does the actual work | ChatGPT, Claude, Canva, Notion, Figma |

The LinkedIn post is asking for Layer 3. But Layer 3 without Layers 1 and 2 is blind. It can pattern-match on keywords, but it can't make decisions informed by context, priority, or state.

Most people are building at Layer 4 (better individual tools) or Layer 3 (routers and aggregators). Almost nobody is building Layers 1 and 2 — the part that actually knows what you're trying to accomplish and where everything stands.

That's what we're building with Exponential.

## The Execution Gap

Here's what I keep coming back to: **we're drowning in intelligence and starving for execution.**

It's never been easier to generate ideas, draft documents, write code, create designs. Every week there's a new model that's faster, cheaper, more capable. The capability curve is exponential.

But execution hasn't kept pace. Not because individuals are slow — because coordination is broken. The gap between "I know what needs to happen" and "it's actually happening, tracked, and connected to my bigger goals" is wider than ever.

The person switching between three LLMs isn't struggling with capability. Each LLM is incredible on its own. She's struggling because:

- No system remembers what she told the last one
- No system connects today's task to this quarter's goal
- No system tracks what she decided yesterday so she doesn't re-decide today
- No system notices that the thing she's about to start is blocked by something someone else hasn't finished

A router solves none of this. State solves all of it.

## What This Actually Looks Like

Imagine this instead:

A meeting gets transcribed. The system extracts three action items, recognizes which projects they belong to, and adds them — already prioritized against your existing commitments. One of them is high-stakes because it's connected to your top outcome this quarter. The system flags it.

You sit down in the morning. Instead of opening three tools and reconstructing your context, you see a daily plan that's already been composed — informed by your calendar, your deadlines, your priorities, and what happened yesterday. Two items need your attention. One needs deep focus. One is a quick approval.

You start working. The AI has full context — not because you pasted it, but because it can see your goal hierarchy, your project state, your meeting notes, and your team's capacity. It knows this is draft three of a proposal that needs to ship by Friday. It knows the client's feedback from the last round. It knows your brand guidelines.

You steer. It drives.

**The model doesn't matter.** What matters is that the system holds the state of your work — and uses it to make every interaction smarter, faster, and more connected to what actually matters.

## The Exponential Thesis

We call this the Self-Steering Method. You set the direction — your goals, your outcomes, your coordinates for what matters right now. The system handles the thousand micro-decisions downstream: what to work on today, how to prioritize incoming requests, when to surface something that needs your attention, when to handle something autonomously.

This isn't a router. It's not a chatbot. It's not another project management tool with AI bolted on.

It's the operating system for a new way of working — one where humans provide high-quality directional input and AI handles execution at a pace and scale that wasn't possible before.

The person on LinkedIn is right that there's a missing layer. She's right that we shouldn't be manually routing between tools. She's right that we should set our priorities once and let the system delegate.

But the layer she's looking for isn't a smart dispatcher.

**It's a system that knows what you're building, why it matters, and where everything stands — and uses that knowledge to make every tool, every model, and every minute more effective.**

That's what we're building. And we think it changes everything.
