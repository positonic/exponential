---
title: Features, PRDs and tickets
description: How a team plans and ships product work in Exponential, what goes where, and how coding agents fit in
section: build
order: 1.5
icon: IconCircles
sidebarTitle: Features, PRDs & tickets
updated: 2026-10-09
---

Product work in Exponential is written down in three different places, because it changes at three different speeds. A **feature** says what the product is and lives forever. A **PRD** argues what to build next and ages into history once it is built. A **ticket** is one piece of work and closes in days. This page explains how the three fit together and how a team, with or without coding agents, moves from an idea to merged code. The screens themselves are covered in [Products, tickets, features & cycles](/docs/build/products).

## Where to find it

Turn on the Product Management plugin under [workspace settings → **Plugins**](/go/settings/plugins), then open [**Deliver → Products**](/go/products) in the sidebar. Features live on a product's **Features** tab, tickets on its **Backlog** tab, and PRDs are [Pages](/docs/do/pages) linked to a feature.

## The three speeds

| | What it is | Lives for | Length |
|---|---|---|---|
| **Feature** | One capability of the product: "Daily summary", "Calendar feeds". | As long as the product has it. | A paragraph and a status. |
| **PRD** | The argument for building it, or for its next version: problem, goals, solution, requirements. | Until it is built, then it is history. | As long as the argument needs. |
| **Ticket** | One unit of work: one branch, one pull request. | Days. | What to build, acceptance criteria, what blocks it. |

Keeping them apart is what keeps each one readable. The feature list stays short enough to be a map of the product. A PRD can be long, because only the people deciding need to read it. The backlog holds only work, so whoever triages it can get through it.

## How it all hangs together

```
Product
├── Area            (5–10 buckets that sort the product's features)
│   └── Feature     (one capability; permanent)
│       ├── Scope        (a version of the feature: v1, v2, …)
│       ├── Requirement  (one testable "shall" sentence, ticked when met)
│       ├── PRD page     (the argument; linked under Docs)
│       └── Ticket       (work; one branch, one pull request)
│           └── Action   (an ordered step inside the ticket)
└── Epic            (groups tickets across a bigger initiative)
```

- **Scopes are versions.** A feature ships as v1, grows a v2, and so on. Each scope moves **Planned → In progress → Live**, and the feature is Live as soon as any scope is.
- **Requirements are rows, not prose.** Each is one sentence such as "When a form is submitted, the system shall create exactly one insight." Tick it on the feature page when the product meets it. A PRD drafts requirements; the rows on the feature are the copy that counts.
- **A ticket carries its steps as actions.** Prefer one ticket with several ordered actions to several tiny tickets. People read the ticket; whoever builds it works through the actions.

## How to plan a change

1. **Find or create the feature.** On the product's **Features** tab, check whether the capability already exists. If it does, you are adding a new scope to it, not a new feature. If not, click **New feature** and write one paragraph saying what the capability is.
2. **Add scopes** for the increments you plan to ship, such as "v1: manual entry" and "v2: bulk import".
3. **Write a PRD if the change needs an argued case.** On the feature page, under **Docs**, click **New PRD**. You get a page titled after the feature with Problem, Goals, Non-goals, Requirements, Rollout and Open questions headings to fill in. Skip this step for small, obvious changes.
4. **Add the requirements** to the feature as rows, each pinned to the scope that delivers it.
5. **Create tickets**: by default one per scope, set to that feature. Break the work into ordered actions on the ticket rather than into more tickets. Record **Depends on** links only where one ticket really needs another merged first.

## How to ship a ticket

1. Move the ticket to **In progress** and set its **Branch**.
2. Work through its actions in order, one commit per action, so the branch works after every step.
3. Open a pull request, paste it into the ticket's **PR URL**, and move the ticket to **QA**.
4. When the pull request merges, move the ticket to **Done**. If you forget, it appears in [Inbox → **Waiting on me**](/docs/do/inbox-and-today) marked **PR merged — promote?** To have merges do this for you, add the merge hook described below.

## How to work with coding agents

The workflow above is also packaged as a set of open-source skills for Claude Code, so a team, and its agents, does it the same way every time. The skills drive Exponential through the [command-line interface (CLI)](/docs/developers/cli).

Install them once:

```bash
npm install -g exponential-cli@latest
exponential auth login
claude plugin marketplace add positonic/skills
claude plugin install syntro-skills@syntrofi
```

The `positonic/skills` repository publishes a marketplace named `syntrofi`, which is why the install line ends in `@syntrofi` rather than `@positonic/skills`.

Then, in a Claude Code session inside your repository, run `/setup-syntro-skills` once. It asks which workspace and product the repository belongs to and records the answer for the other skills.

**Plan, in one session:**

| Skill | What it does |
|---|---|
| `/grill-with-docs` | Interviews you about the change until you and the agent agree what is being built. |
| `/to-prd` | Writes the PRD page, links it to the feature (creating the feature only if it does not exist), adds the scopes and the requirement rows. |
| `/to-robo-prd` | Appends an implementation section for agents to the bottom of the same PRD page. People can stop reading above it. |
| `/to-tickets` | Creates one ticket per scope with the steps as ordered actions, wires the dependencies and names the branches. |

**Build, one fresh session per ticket:**

| Skill | What it does |
|---|---|
| `/start-ticket` | Fetches the ticket, moves it to **In progress** and checks out its branch. |
| `/implement` | Works through the actions in order, test-first, one commit each. |
| `/ship-ticket` | Runs the checks, opens the pull request, links it and moves the ticket to **QA**. |
| `/setup-merge-hook` | Run once per repository. Adds a GitHub Action that moves tickets to **Done** when their pull request merges. |

`/to-expo` also exists, for a loose plan that does not belong to any feature. It creates one ticket per small slice, which floods a backlog when used for feature work, so use `/to-tickets` for anything that belongs to a feature.

## How it connects

- **Products** — the screens for features, scopes, tickets and cycles: [Products, tickets, features & cycles](/docs/build/products).
- **Pages** — a PRD is an ordinary page linked to a feature, so it has comments, sub-pages and search: [Pages](/docs/do/pages).
- **Epics** — group tickets for an initiative that spans several features: [Epics](/docs/do/epics).
- **OKRs** — link a feature to a key result as the work that moves it: [OKRs](/docs/plan/okrs).
- **External agents** — give an agent its own identity in the workspace instead of acting as you: [External agents](/docs/developers/external-agents).

## Tips

- Keep a feature's description to one paragraph. Anything longer is an argument, and belongs in a PRD.
- If a ticket wants more than about ten actions, it is probably two tickets, or the scope is two scopes.
- Put the *why* behind a ticket in its comments, not its body. The body says what to build.

## FAQ

**Is a feature the same as an epic?**
No. A feature permanently describes one capability inside one product. An epic temporarily groups work for an initiative.

**Why is the PRD a separate page and not the feature's description?**
Because they go stale at different rates. The description stays short and current; the PRD records the reasoning at one point in time. Keeping the PRD out of the feature keeps the features list readable.

**Does every feature need a PRD?**
No. A feature can carry only requirement rows. Write a PRD when the change needs an argued case: a real problem, a choice between solutions, or a staged rollout.

**Can a feature have more than one PRD?**
Yes. One is normal; a second makes sense when you plan a large new version of a feature that is already live.

**What happens to a PRD after the feature ships?**
It stays linked under **Docs** as history. The feature's description and its ticked requirements describe the feature from then on.

**Why one ticket per scope instead of one per small task?**
Because a person triages the backlog. One ticket per shippable increment keeps it short enough to read, and the small steps are still there as the ticket's actions.

**Do I need the agent skills?**
No. Everything they do can be done in the app or with the CLI. They exist so the workflow is the same for everyone, and so an agent can be handed a ticket and left to work.

**Who moves a ticket to Done?**
You do, unless the repository has the merge hook from `/setup-merge-hook`, in which case the merge does. **QA** only means a pull request is open.
