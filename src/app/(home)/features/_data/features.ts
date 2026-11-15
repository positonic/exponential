import { PRODUCT_NAME } from "~/lib/brand";

/**
 * A product scene from the home page that shows this feature. Set it only
 * where the scene really depicts the feature; a page without one has a
 * text-only hero.
 */
export type FeatureScene = "goals" | "meetings";

/**
 * A docs screenshot from public/doc-assets. Every one there is 1280×800 with
 * a `-light` twin, so the page shows whichever matches the colour scheme.
 */
export interface FeatureScreenshot {
  /** File name without extension, e.g. "okrs" for /doc-assets/okrs.png. */
  name: string;
  alt: string;
}

export interface FeatureSection {
  heading: string;
  /** Paragraphs, in order. */
  body: string[];
}

export interface FeatureFaq {
  question: string;
  answer: string;
}

/**
 * Each page is a search landing page, so every claim must match what the app
 * does today. Check the code (or the docs page in `related`) before adding
 * one; a page that promises an unbuilt feature costs more than it earns.
 */
export interface FeatureData {
  slug: string;
  category: string;
  title: string;
  /** Search-result title; " | Exponential" is appended. Keep it ≤ 46 characters. */
  seoTitle: string;
  /** Search-result description, ≤ 160 characters. */
  seoDescription: string;
  headline: string;
  description: string;
  benefits: string[];
  icon: string;
  scene?: FeatureScene;
  screenshot?: FeatureScreenshot;
  /** How it works, who it is for, how agents use it: the page's depth. */
  sections: FeatureSection[];
  faqs: FeatureFaq[];
  /** Docs, Learn articles and sibling features. */
  related: { label: string; href: string }[];
}

export const features: FeatureData[] = [
  // ALIGNMENT
  {
    slug: "goals",
    category: `${PRODUCT_NAME}'s Goals`,
    title: "Goals",
    seoTitle: "Goal Tracking Software for Teams",
    seoDescription:
      "Set goals with an owner, a why and a period, nest them five levels deep, and track health and progress. Open-source goal tracking for startups and teams.",
    headline: "Define what matters. Stay focused on why.",
    description:
      "A goal says what success looks like and why it matters. Each one has an owner, a period and a health status, and the projects that serve it hang off it, so the work and the reason for it stay in one place.",
    benefits: [
      "Every goal has an owner (DRI), a why and a target period",
      "Nest goals up to five levels, from annual to quarterly to team",
      "Health updates: on track, at risk or off track, with a note",
      "Progress rolls up from key results, or you set it by hand",
      "Link projects, so the work hangs off the goal it serves",
      "Read and update goals from the CLI and the MCP server",
    ],
    icon: "📎",
    scene: "goals",
    screenshot: {
      name: "goals",
      alt: "The Goals page listing objectives with their owner, period, health and progress",
    },
    sections: [
      {
        heading: "How goals work",
        body: [
          "A goal is a statement of what you want to be true, plus the reasons: a why, an owner (the DRI), a period such as Q1-2026 or Annual-2026, and a status of planned, active, completed or archived. Goals nest up to five levels deep, so an annual company goal can hold the quarterly team goals that get it there. Personal workspaces call them goals; team workspaces call them objectives.",
          "Progress has one source: the average of the goal's key results. If a goal has no key results, or the number is wrong, set a percentage by hand and click Revert to auto later. Linked projects deliberately don't move the number. Finishing a project is not the same as reaching the goal, and pretending otherwise is how a roadmap turns green while the business doesn't.",
        ],
      },
      {
        heading: "Health you can scan, not a status meeting",
        body: [
          "Any goal can carry health updates: on track, at risk or off track, with a sentence on why. The latest one becomes the goal's health in the list, so anyone scanning the Goals page can see which bets are wobbling without opening each one.",
          "The list has Active, Planned and Completed tabs, search, filters for period, health and owner, a Mine toggle and a Timeline view. Each goal has an Overview, an Activity feed with comments and updates, and a Projects tab for the work linked to it. A goal can also be linked to habits, decisions and product features.",
        ],
      },
      {
        heading: "Goals your agents can read",
        body: [
          "Goals are workspace-scoped, and the same goals you see are available to software. The MCP server's get_goals tool gives Claude, Cursor or Codex the objectives with their progress, so an agent asked \"what should I work on?\" answers against what the team decided matters, not against whatever is loudest in its context window.",
          "The CLI covers the rest: goals list, get, create, update, set-status, close and reparent. Goal hygiene, like closing last quarter's goals or moving one under a new parent, can be scripted instead of clicked.",
        ],
      },
    ],
    faqs: [
      {
        question: "What's the difference between a goal and an OKR?",
        answer:
          "An OKR is a goal (an objective) with measurable key results under it. Add key results and the goal's progress comes from them; leave them off and it is a goal with a health status and a progress figure you set yourself.",
      },
      {
        question: "Do tasks link directly to goals?",
        answer:
          "No. Actions belong to projects, and projects link to goals; one project can serve several goals. That keeps the chain from goal to project to action without asking you to tag every task.",
      },
      {
        question: "How deep can goals nest?",
        answer: "Five levels, which covers annual, quarterly, team and personal goals with room to spare.",
      },
      {
        question: "Can an AI agent read our goals?",
        answer:
          "Yes, through the MCP server's get_goals tool and the CLI's goals commands, limited to the workspaces you gave the agent access to.",
      },
      {
        question: "Is it free?",
        answer:
          "Exponential is free to start, open source under the AGPL, and can be self-hosted.",
      },
    ],
    related: [
      { label: "Goals docs", href: "/docs/plan/goals" },
      { label: "OKRs", href: "/features/okrs" },
      { label: "Projects", href: "/features/projects" },
      { label: "Weekly Plan", href: "/features/weekly-plan" },
      { label: "The founder operating system", href: "/learn/founder-operating-system" },
    ],
  },
  {
    slug: "okrs",
    category: `${PRODUCT_NAME}'s OKRs`,
    title: "OKRs",
    seoTitle: "OKR Software for Startups and Small Teams",
    seoDescription:
      "Open-source OKR software: measurable key results, automatic status on every check-in, quarterly and annual views, and an API your agents can use.",
    headline: "Objectives & Key Results that actually work.",
    description:
      "Objectives with measurable key results, checked in as the numbers move. Each check-in updates progress and status on its own, so the dashboard shows where the quarter stands without anyone maintaining a spreadsheet.",
    benefits: [
      "Key results with a start, current and target value, in %, count, currency, hours or your own unit",
      "Status set on every check-in: on track from 70%, at risk from 40%",
      "Every check-in kept, with the old value, the new value and a note",
      "Quarterly and annual tabs, plus a guided team check-in",
      "Link key results to the projects and features meant to move them",
      "Agents can check in through the CLI, the API and the MCP server",
    ],
    icon: "📈",
    scene: "goals",
    screenshot: {
      name: "okrs",
      alt: "The OKR dashboard with quarter progress, key results by confidence and objectives with their key results",
    },
    sections: [
      {
        heading: "How key results are scored",
        body: [
          "A key result has a start value, a target and a current value, in percent, count, currency, hours or a unit you name. Progress is how far the current value has moved from the start toward the target, so \"grow MRR from $10k to $20k\" sitting at $15k is 50%, not 75%.",
          "Each check-in sets the status for you: achieved at 100%, on track from 70%, at risk from 40% and off track below that. When the number doesn't tell the whole story, override the status or record a confidence score from 0 to 100. An objective's progress is the average of its key results.",
        ],
      },
      {
        heading: "A check-in ritual, not a spreadsheet",
        body: [
          "The dashboard has Q1 to Q4 and Annual tabs with a year switch, and cards for quarter progress, key results by confidence, check-ins this week and trajectory. Filter by status, switch to Mine, or see the quarter as a timeline. Zoe, the built-in assistant, flags key results that have gone stale.",
          "The guided OKR check-in walks a team through it in three steps: pick the period, update each key result, read the summary. Every check-in is logged with its previous value and a note, so the history explains how a number got where it is, and the conversation about a key result stays in its comments.",
        ],
      },
      {
        heading: "OKRs wired to the work",
        body: [
          "Link a key result to the projects and product features that should move it. When a linked feature's tickets ship, the delivery progress shows on the key result, next to the number it is supposed to change. In the weekly plan, projects that serve a focus key result are flagged if they have slipped out of your top five.",
          "Agents can read and update key results too: the CLI's goals kr checkin, the API and the MCP server's key-result tools. A coding agent that ships the feature can post the check-in itself, attributed to the agent rather than to you.",
        ],
      },
    ],
    faqs: [
      {
        question: "How is key result progress calculated?",
        answer:
          "(current − start) ÷ (target − start). Status follows from it on each check-in: achieved at 100%, on track from 70%, at risk from 40%, otherwise off track.",
      },
      {
        question: "Can I set the status by hand?",
        answer:
          "Yes. Override the automatic status, or record a confidence score from 0 to 100, whenever the number alone is misleading.",
      },
      {
        question: "Does it handle quarterly and annual OKRs?",
        answer:
          "Yes. The dashboard has Q1 to Q4 and Annual tabs, and objectives nest, so an annual objective can hold quarterly ones.",
      },
      {
        question: "Can I switch OKRs off?",
        answer:
          "OKRs are a plugin that is on by default; a workspace owner can turn it off.",
      },
      {
        question: "Can an agent update key results?",
        answer:
          "Yes, with the CLI, the API or the MCP server. Its check-ins are attributed to the agent.",
      },
    ],
    related: [
      { label: "OKRs docs", href: "/docs/plan/okrs" },
      { label: "Goals", href: "/features/goals" },
      { label: "Weekly Plan", href: "/features/weekly-plan" },
      { label: "Projects", href: "/features/projects" },
      { label: "A weekly planning system for founders", href: "/learn/weekly-planning-system-for-founders" },
    ],
  },
  {
    slug: "weekly-plan",
    category: `${PRODUCT_NAME}'s Weekly Plan`,
    title: "Weekly Plan",
    seoTitle: "Weekly Review and Planning App",
    seoDescription:
      "A weekly review across every workspace: triage, check in on key results, re-rank projects by health score, and keep a streak. Built for founders and small teams.",
    headline: "Reflect, reset, realign—every week.",
    description:
      "A weekly review across all your workspaces in four steps: decide what's in focus, check in on key results, re-rank projects, then go project by project. The projects that most need attention come first.",
    benefits: [
      "One review across every workspace, with focus and dormant workspaces",
      "Projects ordered by a health score, so the neglected ones come first",
      "Key-result check-ins as part of the review",
      "Quick Sweep or Full Review, with an optional timer",
      "Streaks with milestones at 4, 12, 26 and 52 weeks",
      "A team check-in to share with your team or send to Slack",
    ],
    icon: "🔄",
    screenshot: {
      name: "weekly-plan",
      alt: "The Weekly Plan with workspaces in focus, key results to check in and projects ranked into top focus, active and backlog",
    },
    sections: [
      {
        heading: "Four steps, every week",
        body: [
          "First, triage your workspaces: mark each one in focus or dormant, and give the in-focus ones a theme for the week. Second, check in on the key results you're focusing on by clicking the value inline. Third, re-rank projects into Top focus (five at most), Active or Backlog. The move changes the project's real priority everywhere, and if a project serves a focus key result but isn't in Top focus, a banner offers to promote it.",
          "Fourth, go project by project: status, priority, next action and a short reflection (\"What changed since last week? What's the unlock?\"). Progress saves as you go, so closing the tab halfway costs nothing, and past reviews are kept on a history page.",
        ],
      },
      {
        heading: "Neglected projects first",
        body: [
          "In a workspace's review, projects are ordered by a health score that starts at 100 and loses points for the usual signs of drift: no active action (−30), nothing completed in a week (−25), overdue actions (−20), no linked key result (−15), no end date (−15), stuck or blocked (−10). The lowest score is reviewed first.",
          "That's the opposite of how most weekly reviews go, where twenty minutes disappear into the project you enjoy and the one that's quietly on fire gets a glance. Pick Quick Sweep for a light week or Full Review for a thorough one, with a 10, 15 or 25-minute timer if you want the review to end on time.",
        ],
      },
      {
        heading: "Streaks, habits and the team",
        body: [
          "Finishing a review extends your streak, with milestones at 4, 12, 26 and 52 weeks, and the weekly plan can be tracked as a habit on the Habits page. Nobody needs a productivity app to tell them they're doing great, but a visible streak does make skipping a week feel like a choice rather than an accident.",
          "For teams, a finished review shows up as an event in the workspace, and the Weekly Team Check-in shares a summary of what changed with your organisation's teams or posts it to Slack. The summary is a plain account of the changes, not AI-written prose.",
        ],
      },
    ],
    faqs: [
      {
        question: "How long does a weekly review take?",
        answer:
          "As long as you give it. Choose Quick Sweep or Full Review, and set a timer of 10, 15 or 25 minutes, or none.",
      },
      {
        question: "Does it work across several workspaces?",
        answer:
          "Yes. The review starts by marking each workspace in focus or dormant, so a side project can sit out a week without cluttering the review.",
      },
      {
        question: "How is the project order decided?",
        answer:
          "By a health score that starts at 100 and drops for missing next actions, no recent completions, overdue work, no linked key result, no end date and blockers. Lowest first.",
      },
      {
        question: "Does AI write my weekly summary?",
        answer:
          "No. The completion screen counts what changed, and the team check-in sends a templated summary of those changes.",
      },
      {
        question: "Can I share my review with the team?",
        answer:
          "Yes. The Weekly Team Check-in shares it with your organisation's teams or sends it to a Slack channel.",
      },
    ],
    related: [
      { label: "Weekly Plan docs", href: "/docs/reflect/weekly-plan" },
      { label: "Habits docs", href: "/docs/reflect/habits" },
      { label: "Team Weekly Review", href: "/features/team-weekly-review" },
      { label: "OKRs", href: "/features/okrs" },
      { label: "A weekly planning system for founders", href: "/learn/weekly-planning-system-for-founders" },
    ],
  },

  // EXECUTION
  {
    slug: "projects",
    category: `${PRODUCT_NAME}'s Projects`,
    title: "Projects",
    seoTitle: "Project Management Linked to Goals and OKRs",
    seoDescription:
      "Projects with an owner, status and health, linked to the goals and key results they serve, with a kanban, a timeline and instructions your agents follow.",
    headline: "Containers for focused work.",
    description:
      "A project groups the actions for one piece of work and links to the goals and key results it serves. Each has an owner, a status, a priority and a health ring, so the projects list doubles as an honest status report.",
    benefits: [
      "An owner (DRI), status, priority and dates on every project",
      "Link projects to goals and key results, many to many",
      "A health ring computed from the project's real activity",
      "A kanban of actions, a timeline and a meetings tab per project",
      "Restricted projects that only named members can see",
      "Instructions that Zoe and your agents follow on this project",
    ],
    icon: "📋",
    scene: "goals",
    screenshot: {
      name: "projects",
      alt: "The Projects list with each project's status, priority, owner, health ring and linked goals",
    },
    sections: [
      {
        heading: "What a project holds",
        body: [
          "Every project has a status (active, on hold, completed or cancelled), a priority, an owner and start and end dates. Inside it are tabs for the Overview, Tasks (a kanban from Backlog through To Do, In Progress and In Review to Done), Goals, Timeline, Workflows, Meetings, Integrations and Access.",
          "The projects list comes in three views, Projects, Projects & Tasks and Timeline, with status and priority editable inline and columns for health and ETA. There is an Ask Zoe button for when you'd rather ask than scan.",
        ],
      },
      {
        heading: "Linked to why, honest about progress",
        body: [
          "Projects link to goals and key results, many to many, so one project can serve two objectives and a key result can show every project meant to move it. In the weekly plan, a project with no linked key result is one of the first things flagged.",
          "The health ring is automatic: five checks of 20 points each, for being linked to a goal or key result, having something completed in the last week, having an active action, having nothing overdue and having progress recorded. Progress itself is a number you set. We don't pretend that seven of ten tasks done means 70% of the outcome.",
        ],
      },
      {
        heading: "Built for teams that include agents",
        body: [
          "Each project has Instructions: standing context that Zoe and external agents follow when they work on it, such as conventions, who to ask, or what not to touch. Agents read and update projects through the MCP server's get_project and update_project tools and the CLI, under their own identity.",
          "Restricted projects are visible only to named members, while workspace owners and admins keep access. Projects can also sync tasks both ways with Notion or Monday.com, post to a Slack channel and send summaries to a Matrix room.",
        ],
      },
    ],
    faqs: [
      {
        question: "Is project progress calculated automatically?",
        answer:
          "The health ring is; the progress percentage is a number you set, because task counts are a poor measure of how close a project is to its outcome.",
      },
      {
        question: "Can I restrict a project to certain people?",
        answer:
          "Yes. A restricted project is visible only to its named members; workspace owners and admins keep access.",
      },
      {
        question: "Does it sync with other tools?",
        answer:
          "Tasks sync both ways with Notion or Monday.com, and a project can post to Slack and Matrix. There is no GitHub issue sync from projects.",
      },
      {
        question: "Can an AI agent work on a project?",
        answer:
          "Yes. Give the project Instructions, then let Zoe or an external agent read and update it through the MCP server or the CLI.",
      },
    ],
    related: [
      { label: "Projects docs", href: "/docs/do/projects" },
      { label: "Views and timeline", href: "/docs/do/activity-views-timeline" },
      { label: "Members and access", href: "/docs/collaborate/members-and-access" },
      { label: "Actions", href: "/features/actions" },
      { label: "Goals", href: "/features/goals" },
    ],
  },
  {
    slug: "actions",
    category: `${PRODUCT_NAME}'s Actions`,
    title: "Actions",
    seoTitle: "Task Manager for Teams and AI Agents",
    seoDescription:
      "Tasks with natural-language capture, a kanban, multiple assignees and an AI Assistant you can hand work to. Capture from Chrome, iOS, Slack, the CLI or MCP.",
    headline: "Tasks your team and your agents share.",
    description:
      "Actions are the tasks. Type them the way you'd say them, sort them on a kanban, give them to a teammate, or assign one to an AI Assistant and let it do the work and report back.",
    benefits: [
      "Natural-language capture: \"Call John tomorrow for sales project\"",
      "Capture from ⌘N, the Chrome extension, iOS, the desktop app or Slack",
      "A kanban from Backlog to Done, with multiple assignees",
      "Assign an action to an AI Assistant and it works on it alone",
      "Epics, sprints, estimates and blockers when you need them",
      "Full access from the CLI and the MCP server",
    ],
    icon: "✓",
    scene: "goals",
    screenshot: {
      name: "actions",
      alt: "The Actions board with Backlog, To Do, In Progress and In Review columns",
    },
    sections: [
      {
        heading: "Capture without ceremony",
        body: [
          "Type \"Call John tomorrow for sales project\" and you get an action called Call John, due tomorrow, in the Sales project. Capture works from ⌘N anywhere in the app, the Chrome extension, an iOS shortcut, the desktop app, Slack and voice. Anything without a date or a project waits in the Inbox until you sort it.",
          "Priority is yours to set, from eleven values: 1st to 5th Priority for ranked work, plus Quick, Scheduled, Errand, Remember, Watch and Someday Maybe for things that aren't ranked but still need a home. There's no score claiming to know what matters more than you do.",
        ],
      },
      {
        heading: "From the board to done",
        body: [
          "Actions move across a kanban: Backlog, To Do, In Progress, In Review, Done and Cancelled. Dropping one on Done completes it. An action can have several assignees, and each sees it on their own Today. Add due dates, scheduled start and end times, durations, recurrence, time entries, comments and screenshots, and reschedule, defer, assign or move actions in bulk.",
          "Teams that want more can switch on advanced features per workspace: epics, sprints, estimates in points, t-shirt sizes or hours, and blockers between actions. Teams that don't never see them.",
        ],
      },
      {
        heading: "Hand an action to an agent",
        body: [
          "Assign an action to your AI Assistant like any teammate. It goes to work on its own, reading what it needs, commenting, creating sub-actions or handing the action to the right person, and a live pill on the action shows it working. When it's done you get a notification and a summary to confirm. Everything it does is recorded under its own name.",
          "Agents outside the app work with actions too. Claude, Cursor and Codex create, update and complete them through the MCP server, whose create_action tool understands natural language, and the CLI covers today, overdue, kanban, create, update, reschedule and defer. Meetings feed in as well: AI drafts action items from transcripts for you to review.",
        ],
      },
    ],
    faqs: [
      {
        question: "Does every action need a project?",
        answer:
          "No. Actions without a date or a project sit in the Inbox until you give them one.",
      },
      {
        question: "How does priority work?",
        answer:
          "You choose from eleven values: 1st to 5th Priority, plus Quick, Scheduled, Errand, Remember, Watch and Someday Maybe. Nothing is scored automatically.",
      },
      {
        question: "Can an AI do an action for me?",
        answer:
          "Yes. Assign it to your AI Assistant. It works inside Exponential, records everything under its own name and leaves the result for you to confirm; it never marks the action done itself.",
      },
      {
        question: "Where can I capture actions from?",
        answer:
          "⌘N in the app, the Chrome extension, an iOS shortcut, the desktop app, Slack, voice, the CLI and any MCP client.",
      },
      {
        question: "Can I manage actions from the terminal?",
        answer:
          "Yes. The exponential CLI lists, creates, updates, reschedules and defers actions, with JSON output for scripts.",
      },
    ],
    related: [
      { label: "Actions docs", href: "/docs/do/actions" },
      { label: "Assign to your assistant", href: "/docs/zoe/assistant-runs" },
      { label: "Epics", href: "/docs/do/epics" },
      { label: "Inbox", href: "/features/inbox" },
      { label: "Today View", href: "/features/today-view" },
    ],
  },
  {
    slug: "today-view",
    category: `${PRODUCT_NAME}'s Today View`,
    title: "Today View",
    seoTitle: "Daily Planner with Calendar and Tasks",
    seoDescription:
      "A Today view with your calendar beside your tasks, one-click overdue rescheduling, a daily plan wizard and AI scheduling suggestions for what slipped.",
    headline: "Focus on what matters now.",
    description:
      "Today shows what is due today and what is overdue, next to your calendar. Reschedule the overdue pile in one click, or plan the day properly with time blocks and suggestions for where things fit.",
    benefits: [
      "Today, Tomorrow and Upcoming tabs, with overdue work up top",
      "Your calendar's events beside your tasks",
      "Reschedule everything overdue to today in one click",
      "Overdue work grouped by when it was created, so bulk imports don't haunt you",
      "Zoe suggests a time for each overdue item; accept, edit or dismiss",
      "A daily plan wizard for estimates, capacity and time blocks",
    ],
    icon: "📅",
    screenshot: {
      name: "today",
      alt: "The Today view with overdue and today's actions on the left and the day's calendar events on the right",
    },
    sections: [
      {
        heading: "One screen for the day",
        body: [
          "Today has three tabs, Today, Tomorrow and Upcoming, with an Overdue section that shows how long each item has been waiting. Lists follow the priority you set; overdue items sort by priority, then oldest first. The agenda rail shows the day's events from Outlook, ICS feeds and Google Calendar (Google is in early access), alongside meetings scheduled in Exponential.",
          "Filter by tags, edit in bulk to reschedule, defer or delete, add a task straight onto today, and keep an eye on the daily productivity score ring if that's the kind of thing that motivates you. On a phone, Today has its own mobile layout.",
        ],
      },
      {
        heading: "An honest overdue pile",
        body: [
          "A long overdue list is usually not a long list of failures. More often, a generated project plan stamped thirty actions with the same date. Today groups overdue actions created together, so a bulk-created batch can be rescheduled or deferred in one move instead of thirty.",
          "Reschedule all → Today clears the pile in one click when that's the right call. When it isn't, Zoe suggests a date and time for each overdue item based on your calendar, and you accept them all, accept one at a time, or dismiss them.",
        ],
      },
      {
        heading: "Plan the day, or let an agent look first",
        body: [
          "Plan opens the daily plan wizard: estimate what you mean to do, check it against your capacity, drag actions onto a time grid, take AI scheduling suggestions, and pull in tasks from your calendar or Notion.",
          "Agents see the same day. The MCP server's get_todays_actions returns overdue, today and inbox across workspaces, and get_overdue_triage explains why the overdue count is what it is before anyone proposes what to do about it. The CLI has actions today, overdue, reschedule and defer.",
        ],
      },
    ],
    faqs: [
      {
        question: "Which calendars does Today show?",
        answer:
          "Outlook, ICS feeds and meetings scheduled in Exponential. Google Calendar is in early access.",
      },
      {
        question: "Does AI decide my priorities?",
        answer:
          "No. Lists follow the priority you set. AI only suggests times for overdue items, and you accept or dismiss each suggestion.",
      },
      {
        question: "Is there a week or month view?",
        answer:
          "Not in Today, which has Today, Tomorrow and Upcoming. The daily plan wizard is for planning a single day in detail.",
      },
      {
        question: "Can an agent see my day?",
        answer:
          "Yes. get_todays_actions on the MCP server and actions today in the CLI return the same overdue, today and inbox lists.",
      },
    ],
    related: [
      { label: "Inbox and Today docs", href: "/docs/do/inbox-and-today" },
      { label: "Daily plan", href: "/docs/do/daily-plan" },
      { label: "Calendar", href: "/docs/meet/calendar" },
      { label: "Inbox", href: "/features/inbox" },
      { label: "Why founders struggle with productivity tools", href: "/learn/why-founders-struggle-with-productivity-tools" },
    ],
  },
  {
    slug: "inbox",
    category: `${PRODUCT_NAME}'s Inbox`,
    title: "Inbox",
    seoTitle: "Quick Capture Inbox for Tasks and Decisions",
    seoDescription:
      "Capture tasks from anywhere in plain language, then clear them in batches. The Inbox also collects decisions to make, work to review and what your agents did.",
    headline: "Capture anything, process later.",
    description:
      "Anything you capture without a date or a project lands in the Inbox, from ⌘N, Chrome, iOS, Slack or an agent. The Inbox also gathers what is waiting on you: decisions to make, tickets to promote and the results of work you delegated to an AI Assistant.",
    benefits: [
      "Capture from ⌘N, Chrome, iOS, the desktop app, Slack or voice",
      "Plain-language capture picks up the date and the project",
      "Clear actions in batches: date them, move them or delete them",
      "Waiting on me: decisions, meeting drafts and tickets to review",
      "Delegated: what your AI Assistant is working on, and its results",
      "One inbox across every workspace",
    ],
    icon: "📥",
    screenshot: {
      name: "inbox",
      alt: "The Inbox with tabs for Notifications, Waiting on me, Delegated and Actions",
    },
    sections: [
      {
        heading: "Capture first, decide later",
        body: [
          "The point of an inbox is that capturing something costs nothing. Press ⌘N anywhere in the app, use the Chrome extension, an iOS shortcut, the desktop app, the mobile web app, Slack or voice, and type the way you'd say it: \"Call John tomorrow for sales project\" becomes an action with a due date in the right project. Dates and project names are parsed by rules, not guessed by a model.",
          "Anything that arrives without a date or a project stays in the Inbox's Actions tab until it gets one. Give it a date and it moves to Today or Upcoming; give it a project and it moves there. Bulk edit clears a backlog of captures in one pass.",
        ],
      },
      {
        heading: "More than tasks: what's waiting on you",
        body: [
          "The Inbox has four tabs. Notifications are filterable by type, with mark-all-read. Waiting on me collects the things only you can unblock: open decisions you own, meetings with draft decisions to review, tickets in QA to promote once their pull request has merged, and overdue actions.",
          "Delegated shows actions you handed to an AI Assistant, with each run's live status, and lets you review or dismiss the result when it finishes. It all covers every workspace you belong to, with a count in the sidebar.",
        ],
      },
      {
        heading: "Agents fill it too",
        body: [
          "An agent that creates an action without a date or project, through the MCP server's create_action or the CLI, drops it in the same Inbox, attributed to the agent. Ask Claude to \"add an action to look into the billing bug\" and it is waiting for you to triage like anything else you captured.",
          "get_todays_actions on the MCP server includes the Inbox, so an agent helping you plan the day sees the unsorted captures as well as the dated work.",
        ],
      },
    ],
    faqs: [
      {
        question: "Does AI sort my inbox?",
        answer:
          "No. Capture parses dates and project names with rules, and you decide where everything goes. AI is involved only where you ask for it, such as delegating an action to your Assistant.",
      },
      {
        question: "Can I capture from my phone?",
        answer: "Yes, with the iOS shortcut or the mobile web app.",
      },
      {
        question: "What's the difference between Inbox and Today?",
        answer:
          "Inbox holds things with no date or project yet, plus what's waiting on you. Today holds what's due today and what's overdue.",
      },
      {
        question: "Can I email tasks into the Inbox?",
        answer:
          "Not today. Use the Chrome extension, the iOS shortcut, Slack or an MCP client instead.",
      },
    ],
    related: [
      { label: "Inbox and Today docs", href: "/docs/do/inbox-and-today" },
      { label: "Chrome extension", href: "/docs/capture/chrome-extension" },
      { label: "iOS shortcut", href: "/docs/capture/ios-shortcut" },
      { label: "Today View", href: "/features/today-view" },
      { label: "Actions", href: "/features/actions" },
    ],
  },

  // AI FEATURES
  {
    slug: "ai-assistant",
    category: `${PRODUCT_NAME}'s AI Assistant`,
    title: "AI Assistant",
    seoTitle: "AI Assistant for Project Management",
    seoDescription:
      "Zoe works over your projects, tasks, OKRs, calendar, email and meetings. Chat in the app or on WhatsApp, Telegram or Matrix, or assign her an action outright.",
    headline: "Chat with Zoe about your work.",
    description:
      "Zoe is the assistant built into Exponential. She works over your real projects, actions, OKRs, meetings, calendar and email, answers in chat or on your phone, and can take an assigned action and work it on her own.",
    benefits: [
      "Chat on a full page, in the ⌘J drawer or from ⌘K",
      "Creates and updates actions, projects, pages, OKRs, tickets and decisions",
      "Reads your calendar and email, finds free slots, drafts replies",
      "Message her on WhatsApp, Telegram or Matrix",
      "Assign her an action and she works it, then reports back",
      "Give her your name, emoji and personality",
    ],
    icon: "🤖",
    screenshot: {
      name: "agent",
      alt: "The Zoe chat page answering a question about the user's projects",
    },
    sections: [
      {
        heading: "An assistant with your context",
        body: [
          "Zoe has tools over the workspace itself: projects, actions, goals and key results, pages, tickets, decisions, meetings and the CRM. With accounts connected she reaches further: your calendar (find free slots, create events), your email (search, read, reply), Slack, Notion and WhatsApp history. Resources you pin in Knowledge go into every conversation, so she knows the things you'd otherwise paste in each time.",
          "Ask her to break a project into actions, summarise yesterday's meeting, plan your day or reschedule what slipped. She confirms before she changes things in chat, and every reply can be rated, with the full history under Settings.",
        ],
      },
      {
        heading: "Wherever you are",
        body: [
          "Chat on the full Zoe page, which keeps your conversation history, open the drawer with ⌘J on any page, or switch ⌘K into Ask Zoe mode. Off your desk, link WhatsApp with a QR code, or message her on Telegram or Matrix, with the same tools as in the app. Mention a specialist agent with @, and give your assistant your own name, emoji and personality.",
        ],
      },
      {
        heading: "Hand her the work, not just the question",
        body: [
          "Assign an action to your assistant like any teammate and she works it on her own: reading what she needs, commenting, creating sub-actions or passing the action to the right person. A live pill shows how long she has been working and how many tools she has called; when she's done you get a notification, a summary and, as the owner, the full transcript. She writes only inside Exponential and never marks the action done herself.",
          "External agents get the same footing. Claude, Cursor and Codex connect through the MCP server, and your own software through the SDK and CLI, each with its own agent identity, so you can always tell which assistant did what.",
        ],
      },
    ],
    faqs: [
      {
        question: "Does Zoe act without asking?",
        answer:
          "In chat she confirms before making changes. When you assign her an action she works on it on her own, inside Exponential only, and leaves the result for you to confirm.",
      },
      {
        question: "Can I talk to her on my phone?",
        answer: "Yes, over WhatsApp, Telegram or Matrix, with the same tools as in the app.",
      },
      {
        question: "What can she do when assigned an action?",
        answer:
          "Read, comment, create sub-actions and reassign within Exponential. She doesn't send email, book events or write to your CRM or Notion during an assigned run.",
      },
      {
        question: "Is Zoe available on self-hosted installs?",
        answer:
          "Yes, once the install has an AI provider configured. Without one, the assistant is hidden.",
      },
    ],
    related: [
      { label: "Zoe docs", href: "/docs/zoe/assistant" },
      { label: "Assign to your assistant", href: "/docs/zoe/assistant-runs" },
      { label: "Chat gateways", href: "/docs/zoe/chat-gateways" },
      { label: "Knowledge base", href: "/docs/zoe/knowledge-base" },
      { label: "An AI executive assistant for founders", href: "/learn/ai-executive-assistant-for-founders" },
    ],
  },
  {
    slug: "meeting-intelligence",
    category: `${PRODUCT_NAME}'s Meeting Intelligence`,
    title: "Meeting Intelligence",
    seoTitle: "Meeting Notes to Action Items and Decisions",
    seoDescription:
      "Bring meetings in from Fireflies, the Chrome extension or an agent. Get summaries, draft action items and draft decisions, reviewed by you before they land.",
    headline: "Meetings become actions and decisions.",
    description:
      "Meetings arrive from Fireflies, the Chrome extension, a pasted transcript or an agent. Each gets a summary, and AI drafts the action items and decisions for you to review, so nothing lands in a project that nobody agreed to.",
    benefits: [
      "Meetings from Fireflies, Chrome recordings, pasted transcripts or agents",
      "Summaries written automatically, editable and regenerable",
      "Draft action items, reviewed before they join a project",
      "Draft decisions and open questions, confirmed into the Decision Log",
      "Speaker-attributed transcripts with talk time",
      "Summaries posted to the project's Slack channel",
    ],
    icon: "🎙️",
    scene: "meetings",
    screenshot: {
      name: "meeting-detail",
      alt: "A meeting page with its summary, transcript, decisions and participants with talk time",
    },
    sections: [
      {
        heading: "Every meeting in one place",
        body: [
          "Meetings come in from Fireflies through a webhook, from recordings made with the Chrome extension, from a transcript or notes you paste in, or from an agent through the MCP server's create_meeting and append_meeting_notes tools. Each meeting page has a Summary, a speaker-attributed Transcript you can search and export, Decisions and Screenshots, and shows participants with their talk time.",
          "Link a meeting to a project, a recurring ceremony or product features. The list has tabs for All, Mine, 1:1s, Internal and Archive, and summaries are written automatically.",
        ],
      },
      {
        heading: "Drafts, not surprises",
        body: [
          "Click Create Actions and AI drafts the action items from the transcript. You review them, then add them to the meeting's project, with duplicates caught. Recurring ceremonies can opt in to having this done automatically. Either way, a person decides what becomes work, because an AI that quietly files forty tasks after a brainstorm is not helping.",
          "Extract decisions & questions does the same for what was decided and what is still open. Drafts wait in Inbox → Waiting on me, and once confirmed they join the Decision Log with the quote they came from, so six months later you can see who agreed to what, and in which words.",
        ],
      },
      {
        heading: "Meetings that feed the rest",
        body: [
          "Assign a meeting to a project with a Slack channel and its summary is posted there. Ideate Features proposes product features from a customer or planning call. Transcripts are embedded for semantic search, so Zoe and the Knowledge search can answer \"what did we say about pricing?\" across every meeting.",
          "From the terminal, meetings list, get and create, and decisions draft extract, confirm and reject, cover the same flow for scripts and coding agents.",
        ],
      },
    ],
    faqs: [
      {
        question: "Which meeting tools does it work with?",
        answer:
          "Fireflies, through a webhook, plus Chrome-extension recordings, pasted transcripts and anything an agent sends through the MCP server. There is no native Zoom, Meet or Teams bot.",
      },
      {
        question: "Are action items created automatically?",
        answer:
          "They're drafted automatically and created when you approve them. Recurring ceremonies can opt in to automatic extraction; the drafts still wait for review.",
      },
      {
        question: "Where do decisions go?",
        answer:
          "Confirmed decisions go into the workspace's Decision Log, linked to the meeting and the quote they came from.",
      },
      {
        question: "Can I search across meeting transcripts?",
        answer:
          "Yes, through the semantic Knowledge search and by asking Zoe. The meetings list's own search covers titles and previews.",
      },
    ],
    related: [
      { label: "Meetings docs", href: "/docs/meet/meetings" },
      { label: "Fireflies setup", href: "/docs/meet/fireflies" },
      { label: "Decision Log", href: "/docs/plan/decisions" },
      { label: "Ceremonies", href: "/docs/meet/ceremonies" },
      { label: "Smart Search", href: "/features/smart-search" },
    ],
  },
  {
    slug: "smart-search",
    category: `${PRODUCT_NAME}'s Smart Search`,
    title: "Smart Search",
    seoTitle: "Search Across Meetings, Pages and Projects",
    seoDescription:
      "⌘K finds any project, task, goal, ticket or page by name. Semantic search finds meetings, pages and saved resources by meaning, with the passage that matched.",
    headline: "Find anything across your work.",
    description:
      "Two kinds of search. ⌘K jumps to any project, action, goal, ticket, page or contact by name. Semantic search finds meetings, pages and saved resources by what they mean, and shows the passage that matched.",
    benefits: [
      "⌘K across 13 kinds of object, with keyboard navigation",
      "Find tickets by short id, number or #42",
      "Semantic search over meeting transcripts, pages and saved resources",
      "Results show a match score and the passage that matched",
      "Results respect access, down to restricted projects",
      "The same search from the CLI and the MCP server",
    ],
    icon: "🔍",
    screenshot: {
      name: "command-palette",
      alt: "The ⌘K command palette with grouped results for projects, actions and goals",
    },
    sections: [
      {
        heading: "⌘K: jump to anything by name",
        body: [
          "Press ⌘K anywhere and type. The palette matches the names of workspaces, projects, actions, goals, key results, tickets, features, epics, pages, meetings, contacts, organisations and products, groups the results, and lets you move with the keyboard. Tickets can be found by short id, number or #42. Switch modes to narrow to tasks, projects or goals, jump to a workspace section, or ask Zoe instead.",
          "On the desktop app, results from your local wiki are merged into the same palette.",
        ],
      },
      {
        heading: "Semantic search for what was said",
        body: [
          "Some things you can't find by name, like the meeting where someone mentioned the pricing change. Meeting transcripts, pages and resources you save to Knowledge (web pages, documents, notes and bookmarks) are embedded, so search matches meaning rather than exact words and returns the best passage from each source with a match score. It appears as its own section in ⌘K and on the Knowledge page, which falls back to keyword matching on meetings when meaning finds nothing.",
          "Semantic search needs an embeddings provider. On exponential.im it is on; a self-hosted install enables it by configuring one.",
        ],
      },
      {
        heading: "Scoped and scriptable",
        body: [
          "Search only returns what you can open, down to meetings, pages and resources in restricted projects. The same name search is available as exponential search in the CLI and search on the MCP server, so Claude or a script can find the project or ticket you mean before acting on it, and Zoe searches meeting transcripts by meaning when you ask her what was discussed.",
        ],
      },
    ],
    faqs: [
      {
        question: "Is ⌘K search semantic?",
        answer:
          "⌘K matches names and titles. Semantic search covers meeting transcripts, pages and saved Knowledge resources, and shows as its own section in the palette.",
      },
      {
        question: "Does search cover task descriptions and comments?",
        answer: "No, it matches names and titles. Semantic search covers meetings, pages and saved resources.",
      },
      {
        question: "Can I filter search by date?",
        answer: "No. You can narrow ⌘K by type: tasks, projects or goals.",
      },
      {
        question: "Does semantic search work when self-hosting?",
        answer:
          "Yes, once you configure an embeddings provider. Without one, name search still works.",
      },
    ],
    related: [
      { label: "Keyboard shortcuts", href: "/docs/reference/keyboard-shortcuts" },
      { label: "Knowledge base", href: "/docs/zoe/knowledge-base" },
      { label: "CLI reference", href: "/docs/developers/cli" },
      { label: "Meeting Intelligence", href: "/features/meeting-intelligence" },
      { label: "AI Assistant", href: "/features/ai-assistant" },
    ],
  },

  // AI AUTOMATION
  {
    // The slug keeps its indexed URL; the page is about what is built:
    // assigning an action to an AI Assistant (agent runs) and Positions.
    slug: "ai-project-manager",
    category: "AI Delegation",
    title: "AI Teammate",
    seoTitle: "Assign Tasks to an AI Assistant",
    seoDescription:
      "Assign an action to your AI assistant like any teammate. It works on its own, asks when it's stuck, and leaves a summary and a time entry for you to approve.",
    headline: "Assign work to an AI teammate.",
    description:
      "Assign an action to your AI Assistant the way you'd assign it to a colleague. It reads what it needs, does the work inside Exponential, asks you when it's stuck, and hands back a summary for you to approve.",
    benefits: [
      "Assign an action to your Assistant from the Assignees row",
      "Watch it work: a live pill, a step count and a cancel button",
      "It asks whoever assigned the action when it's stuck, then carries on",
      "A summary, a notification and a proposed time entry when it's done",
      "Positions tell it who owns what, so it hands work to the right person",
      "It never sends email or marks work done without you",
    ],
    // No screenshot: none of the docs captures shows a run or the Delegated tab.
    icon: "👔",
    sections: [
      {
        heading: "Delegation, not a chatbot",
        body: [
          "Open an action, click Assignees and tick your Assistant, pinned first under Your assistant. A hosted run starts. The action's status dot becomes a spinning ring and a pill appears, such as \"Working 1m · called 3 tools\", updating every couple of seconds; Cancel stops it. You can assign a teammate's assistant the same way.",
          "The Assistant works inside Exponential: it reads what it needs, comments, edits fields, creates sub-actions and reassigns the action to a person or another assistant, but only to people its owner could assign. The workspace's and the project's AI instructions are part of every run, so standing rules apply without repeating them.",
        ],
      },
      {
        heading: "It asks, and you approve",
        body: [
          "When the Assistant needs something it can't find, it @mentions whoever assigned the action and pauses. Your reply in the comments resumes the run. That's slower than guessing and much cheaper than undoing a confident wrong answer.",
          "When it finishes you get a notification, a summary on the action and a proposed time entry. The owner can expand the full transcript to see every step. Inbox → Delegated groups runs into Working, Waiting on you and Finished, with Mark done and Dismiss. The Assistant never marks an action done itself.",
        ],
      },
      {
        heading: "Guardrails in the tools, plus Positions",
        body: [
          "An assigned run cannot send email, book calendar events, or write to Notion, the CRM, Slack or WhatsApp. That's enforced by which tools the run is given, not by asking the model nicely. Everything it does is recorded under its own name. Runs can also execute on your own machine with a local runner key.",
          "Positions record who does what in a workspace: a title, a remit and what the role is not accountable for. They show in the assign pickers, and the Assistant uses them to decide who to hand work to. They are for routing only and don't grant access. One Assistant per person can be added to several workspaces.",
        ],
      },
    ],
    faqs: [
      {
        question: "Is this an AI that runs my projects?",
        answer:
          "No. It works on the actions you assign it, asks when it's stuck and leaves the result for you to approve. It doesn't chase teammates or close work on its own.",
      },
      {
        question: "What can't the Assistant do during a run?",
        answer:
          "Send email, book events, or write to Notion, the CRM, Slack or WhatsApp. Those tools aren't available to it during a run.",
      },
      {
        question: "Who sees what it did?",
        answer:
          "Everyone with access to the action sees the pill and the summary. The owner can also open the step-by-step transcript.",
      },
      {
        question: "What are Positions?",
        answer:
          "Roles with a remit and a list of what they're not accountable for. The Assistant uses them to route work to the right person; they don't control access.",
      },
      {
        question: "Can external agents do the same?",
        answer:
          "External agents such as Claude, Cursor or Codex work through the MCP server, the SDK and the CLI under their own agent identity.",
      },
    ],
    related: [
      { label: "Assign to your assistant", href: "/docs/zoe/assistant-runs" },
      { label: "Zoe docs", href: "/docs/zoe/assistant" },
      { label: "External agents", href: "/docs/developers/external-agents" },
      { label: "AI Assistant", href: "/features/ai-assistant" },
      { label: "AI-native execution, explained", href: "/learn/ai-native-execution-explained" },
    ],
  },
  {
    // The slug keeps its indexed URL; there is no general workflow builder,
    // so the page covers the automations that are built.
    slug: "ai-workflows",
    category: "Automation",
    title: "Automations",
    seoTitle: "Automated Agendas, Updates and Follow-ups",
    seoDescription:
      "Meeting agendas built from real records, async standups, weekly shipped-work updates drafted by AI for your approval, and CRM automations on a visual canvas.",
    headline: "Automate the work about work.",
    description:
      "The recurring admin that eats a week: building the meeting agenda, chasing standup updates, writing the weekly update, sending the welcome email. Exponential does these from your real records, and anything that goes out waits for a person to approve it.",
    benefits: [
      "Meeting agendas generated from real records before each meeting",
      "Async standup updates, drafted from your own activity",
      "Decisions and actions extracted from a ceremony's recording",
      "A weekly update of what shipped, drafted by AI, sent only after approval",
      "CRM automations on a visual canvas, triggered by contact events",
      "Scheduled broadcast emails to a list",
    ],
    icon: "⚡",
    screenshot: {
      name: "occurrence",
      alt: "A ceremony occurrence page with its generated agenda and participants' async updates",
    },
    sections: [
      {
        heading: "Recurring meetings that prepare themselves",
        body: [
          "Define a recurring meeting once as a ceremony: standup, planning, review, retrospective or all-hands, with an owner, a cadence, participants and an agenda template. Each section of the template is a query over workspace data, such as yesterday's work, blockers, carried-over items, pending decisions, OKR review or cycle progress, so every agenda item comes from a real record and nothing is invented.",
          "At the lead time you choose, the agenda is generated and sent to participants, and to a Matrix room if you like. Participants post async updates beforehand, with Draft from my activity to fill them from recent work and a flag for being blocked. A ceremony can opt in to having decisions and actions extracted from its recording, which still wait for review.",
        ],
      },
      {
        heading: "The weekly update, written for you, sent by you",
        body: [
          "Each week an AI copywriter drafts a short update of what shipped in the workspace: a headline, a summary, up to three highlights and up to eight one-liners. It draws only on work that actually shipped, such as live features, finished tickets, cycle achievements and on-track goal updates. Chores and research never appear, and a week with nothing user-facing gets no draft.",
          "Nothing is sent without approval. Reviewers get the draft by email or Matrix, edit it as a page, then approve, regenerate with feedback or skip the week. Approved updates go to a public page with RSS, a newsletter list and the team's Matrix room.",
        ],
      },
      {
        heading: "CRM automations and broadcasts",
        body: [
          "For the CRM, build automations on a visual canvas: a trigger, then steps in order. Triggers are a contact's type being set, a contact being added to a list, or a schedule; steps include sending a welcome email and generating an agreement. New automations start inactive, so you can build safely. Broadcasts email everyone on a list, skipping anyone who unsubscribed, and can go out on a schedule.",
          "It's deliberately narrow. There is no general-purpose builder with branches and a hundred integrations; these are the automations we use ourselves.",
        ],
      },
    ],
    faqs: [
      {
        question: "Is there a no-code workflow builder?",
        answer:
          "For the CRM, yes: a visual canvas with contact triggers and steps such as a welcome email or an agreement. There is no general-purpose builder with branching or third-party integrations.",
      },
      {
        question: "Does the AI send anything on its own?",
        answer:
          "No. The weekly update waits for a reviewer to approve it, and decisions and actions extracted from meetings wait for review too.",
      },
      {
        question: "Where do meeting agendas come from?",
        answer:
          "From the ceremony's agenda template. Each section queries real workspace data, such as blockers, carried-over items or pending decisions.",
      },
      {
        question: "Can I automate status changes on tasks?",
        answer:
          "Not with a user-built automation. Reminders for due dates and the daily plan are built in.",
      },
    ],
    related: [
      { label: "Ceremonies", href: "/docs/meet/ceremonies" },
      { label: "Workspace updates", href: "/docs/reference/workspace-settings" },
      { label: "CRM automations", href: "/docs/crm/lists-pipelines-automations" },
      { label: "Broadcasts", href: "/docs/crm/pipeline-forms-broadcasts" },
      { label: "Meeting Intelligence", href: "/features/meeting-intelligence" },
    ],
  },

  // TEAM
  {
    slug: "workspaces",
    category: `${PRODUCT_NAME}'s Workspaces`,
    title: "Workspaces",
    seoTitle: "Separate Workspaces for Every Client and Team",
    seoDescription:
      "Keep each client, company or side project in its own workspace, with its own members, roles, plugins, integrations and AI instructions. Switch in a click.",
    headline: "Organize by client or project.",
    description:
      "Each workspace is its own world: projects, goals, members, integrations and AI instructions. Run a company, three clients and a side project from one account without their work bleeding into each other.",
    benefits: [
      "A Personal workspace for everyone, plus team and organization workspaces",
      "Owner, Admin, Member and Viewer roles, plus project-only guests",
      "Plugins such as CRM, OKRs and Product Management, per workspace",
      "Separate integrations and AI instructions in each workspace",
      "Link a team to give all its members access at once",
      "Switch workspaces in a click, and review them all in one weekly plan",
    ],
    icon: "👥",
    screenshot: {
      name: "workspaces",
      alt: "The workspaces list with personal and team workspaces",
    },
    sections: [
      {
        heading: "One account, many contexts",
        body: [
          "Everyone gets a Personal workspace automatically, and can create team or organization workspaces for a company, a client or a side project. Projects, goals and actions belong to a workspace, so a client's backlog never shows up in another client's standup. The switcher moves between them in a click.",
          "Each workspace has its own settings: which plugins are on (CRM, OKRs, Product Management), which advanced features are on (effort estimates, sprints, blockers), its home layout, and its integrations, such as Slack, Zulip, Matrix, Sentry, Notion, Fireflies and Postmark.",
        ],
      },
      {
        heading: "Members, roles and access",
        body: [
          "Invite people as Owner, Admin, Member or Viewer, or as a guest on a single project. Invite links expire after seven days, and pending invitations can be copied, resent or cancelled. Link a team to a workspace and all its members get access without individual invitations. Inside a workspace, a restricted project is visible only to its own members.",
        ],
      },
      {
        heading: "Workspaces for people and agents",
        body: [
          "Each workspace has its own instructions for Zoe, so the assistant follows one client's conventions in their workspace and another's elsewhere. Your AI Assistant can be added to several workspaces, and an external agent's key only reaches the workspaces you added it to.",
          "The weekly plan starts by reviewing every workspace you belong to, marking each in focus or dormant, so juggling several contexts doesn't mean juggling several planning rituals.",
        ],
      },
    ],
    faqs: [
      {
        question: "Can I move a project between workspaces?",
        answer: "Not yet. Projects and contacts stay in the workspace they were created in.",
      },
      {
        question: "Can I change a workspace's URL?",
        answer: "The slug is set when the workspace is created and can't be changed afterwards.",
      },
      {
        question: "Can a guest see only one project?",
        answer: "Yes. Guests are added to a project rather than to the whole workspace.",
      },
      {
        question: "Can an AI agent see all my workspaces?",
        answer:
          "Only the ones you add it to. Each external agent key is limited to its chosen workspaces.",
      },
    ],
    related: [
      { label: "Workspaces docs", href: "/docs/collaborate/workspaces" },
      { label: "Members and access", href: "/docs/collaborate/members-and-access" },
      { label: "Teams", href: "/docs/collaborate/teams" },
      { label: "Workspace settings", href: "/docs/reference/workspace-settings" },
      { label: "Weekly Plan", href: "/features/weekly-plan" },
    ],
  },
  {
    // Was /features/weekly-planning: next.config.js redirects the old URL.
    // Renamed because "Weekly Planning" and the personal "Weekly Plan" page
    // above competed for the same search.
    slug: "team-weekly-review",
    category: `${PRODUCT_NAME}'s Team Weekly Review`,
    title: "Team Weekly Review",
    seoTitle: "Async Weekly Team Check-ins",
    seoDescription:
      "Weekly check-ins without the status meeting: share your plan with the team, post async standup updates, read the week in review and send it all to Slack.",
    headline: "See what everyone's doing.",
    description:
      "Team visibility without another status meeting. Members share their weekly plans, post async updates before the meeting, and the week's activity is summarised for everyone, in the app or in Slack.",
    benefits: [
      "A Weekly Team Check-in of active projects, sent to Slack",
      "Members share their weekly plans with an organization team",
      "Async standup updates, drafted from each person's activity",
      "A blocked flag, and a list of who has answered",
      "A week in review with an AI summary and week-on-week counts",
      "A weekly update of what shipped, approved before it goes out",
    ],
    icon: "📊",
    screenshot: {
      name: "activity",
      alt: "The Activity page with the week in review, events per day and the activity feed",
    },
    sections: [
      {
        heading: "The weekly check-in",
        body: [
          "The Weekly Team Check-in page lists the workspace's active projects with their status, priority and actions, and sends the check-in to a Slack channel in one click. Each person can also share their own weekly check-in with an organization team. Shared plans appear on the team's Weekly Plans tab, and each member's row gets a View Weekly Plan button.",
        ],
      },
      {
        heading: "Standups that happen before the meeting",
        body: [
          "Define your standup as a ceremony and each date gets its own page. Participants post their update ahead of time (done, next, anything blocking), with Draft from my activity to fill it from the work they actually did and I'm blocked on something to flag it. Async summary shows who has answered, and the agenda's Blockers section collects the flags.",
          "Some weeks that makes the meeting short. Some weeks it makes it unnecessary, and the occurrence can be skipped with a reason.",
        ],
      },
      {
        heading: "The week, summarised",
        body: [
          "The Activity page opens with a week in review: a one-sentence summary, event counts against last week and the four-week average, and Plan next week. Regenerate narrative rewrites the summary, or ask an agent for a longer one.",
          "For people outside the team, each week an AI copywriter drafts an update of what shipped, from features, finished tickets and on-track goals. Reviewers approve it before it goes to a public page, a newsletter list or Matrix.",
        ],
      },
    ],
    faqs: [
      {
        question: "Does this replace our status meeting?",
        answer:
          "It can shrink it or skip it. Async updates and shared plans cover the status part, so the meeting, if you still hold it, is for the blockers.",
      },
      {
        question: "Can we send the check-in to Slack?",
        answer: "Yes, from the Weekly Team Check-in page.",
      },
      {
        question: "Who sees my weekly plan?",
        answer:
          "Only the organization teams you share it with, from Sharing Settings on the Weekly Team Check-in page.",
      },
      {
        question: "Is the weekly summary written by AI?",
        answer:
          "The Activity page's narrative and the shipped-work update are drafted by AI. The update is sent only after a reviewer approves it.",
      },
    ],
    related: [
      { label: "Weekly plan docs", href: "/docs/reflect/weekly-plan" },
      { label: "Teams", href: "/docs/collaborate/teams" },
      { label: "Activity", href: "/docs/do/activity-views-timeline" },
      { label: "Ceremonies", href: "/docs/meet/ceremonies" },
      { label: "Weekly Plan", href: "/features/weekly-plan" },
    ],
  },
  {
    // Was /features/team-capacity: next.config.js redirects the old URL.
    // There is no capacity planning; the page covers the delivery metrics
    // that exist.
    slug: "team-metrics",
    category: `${PRODUCT_NAME}'s Team Metrics`,
    title: "Team Metrics",
    seoTitle: "Sprint Velocity and Team Delivery Metrics",
    seoDescription:
      "Velocity, completion and PR turnaround per cycle, a per-person contributions table, and sprint risk signals you can ask Zoe about. Built on your real tickets.",
    headline: "See how the team is delivering.",
    description:
      "Delivery numbers computed from the tickets, pull requests and time your team already records: velocity and completion per cycle, PR turnaround, who shipped what, and the risk signals in the current sprint.",
    benefits: [
      "Velocity, tickets tracked and completion for each cycle",
      "Pull requests merged and average turnaround, from GitHub",
      "A per-person table: tickets, points, PRs, commits and time logged",
      "Trends across cycles, and a breakdown for any one cycle",
      "Ask Zoe for sprint status, burndown and risks",
      "The same signals available to agents through the API",
    ],
    icon: "📆",
    screenshot: {
      name: "metrics",
      alt: "The Metrics page with velocity, tickets tracked, completion and pull requests merged per cycle",
    },
    sections: [
      {
        heading: "The Metrics page",
        body: [
          "With the Product Management plugin on, Metrics shows each cycle's velocity (tickets completed, with story points alongside), tickets tracked, completion rate, and pull requests merged with their average turnaround from opened to merged. Metrics by cycle draws the trend once two cycles have tickets, and Cycle breakdown shows the numbers for any single cycle.",
          "A contributors table breaks the cycle down by person: tickets done, points, PRs merged, commits and time logged, with each person's share of the team's completed tickets. It is a picture of delivery, not a ranking. Use it to see where the work went, not to decide who to promote.",
        ],
      },
      {
        heading: "Sprint risk signals, on request",
        body: [
          "Ask Zoe \"what's the sprint status?\" and she computes it from the actions in the active sprint: planned versus added work, completion rate, velocity, a burndown and risk signals. A signal fires when more than a fifth of the sprint was added after it started, when an action has sat in progress for three days, when work is overdue or blocked, or when the sprint is more than half over and completion is well behind.",
          "External agents can read the same metrics, burndown, risk signals and velocity history through the API, and record a daily snapshot.",
        ],
      },
      {
        heading: "What it doesn't do",
        body: [
          "There is no capacity planner: no hours-per-person availability, no overload warnings and no assignment suggestions. For finding time together, Schedule meeting's Find times looks across attendees' working hours and calendars. Effort estimates in points, t-shirt sizes or hours feed velocity when you switch on advanced action features.",
        ],
      },
    ],
    faqs: [
      {
        question: "What do I need to see Metrics?",
        answer:
          "The Product Management plugin, cycles with tickets, and GitHub connected for the pull request numbers.",
      },
      {
        question: "Does it show team capacity or availability?",
        answer:
          "No. It reports delivery: what was completed, merged and logged. Find times on the calendar shows when people are free to meet.",
      },
      {
        question: "Is there a sprint dashboard?",
        answer:
          "Cycle-level velocity, completion and PR turnaround are on the Metrics page. Sprint status, burndown and risks come from asking Zoe or from the API.",
      },
      {
        question: "Where do the per-person numbers come from?",
        answer:
          "From tickets completed in the cycle, their story points, GitHub pull requests and commits, and time entries.",
      },
    ],
    related: [
      { label: "Metrics docs", href: "/docs/build/retros-insights-metrics" },
      { label: "Sprint insights", href: "/docs/build/sprint-insights" },
      { label: "Products and cycles", href: "/docs/build/products" },
      { label: "Calendar and Find times", href: "/docs/meet/calendar" },
      { label: "Team Weekly Review", href: "/features/team-weekly-review" },
    ],
  },
];

export function getFeatureBySlug(slug: string): FeatureData | undefined {
  return features.find((f) => f.slug === slug);
}

export function getAllFeatureSlugs(): string[] {
  return features.map((f) => f.slug);
}
