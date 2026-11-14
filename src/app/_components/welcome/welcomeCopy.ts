import { PRODUCT_NAME } from "~/lib/brand";
import { type NavUseCase } from "~/lib/navLayout";

/**
 * Copy + step model for the "Getting started" welcome page.
 * The framework taught here is exactly Goals → Actions → Today.
 */
export type StepId = "goal" | "action" | "plan" | "cal";

export const STEP_ORDER: StepId[] = ["goal", "action", "plan", "cal"];

export interface StepMeta {
  id: StepId;
  title: string;
  desc: string;
  optional?: boolean;
}

export const STEPS: StepMeta[] = [
  {
    id: "goal",
    title: "Set your first goal",
    desc: "The anchor everything else hangs off",
  },
  {
    id: "action",
    title: "Add your first action",
    desc: "A concrete step toward your goal this week",
  },
  {
    id: "plan",
    title: "Plan your day",
    desc: "Turn it into a realistic schedule",
  },
  {
    id: "cal",
    title: "Connect your calendar",
    desc: "Optional — meetings and actions in one place",
    optional: true,
  },
];

export const STEP_GROUPS: { label: string; steps: StepId[] }[] = [
  { label: "Align", steps: ["goal"] },
  { label: "Deliver", steps: ["action", "plan"] },
  { label: "Connect", steps: ["cal"] },
];

export const GOAL_SUGGESTIONS = [
  "Launch the new website by end of Q3",
  "Grow to 20 active pilot customers",
  "Build a consistent weekly review habit",
];

export const ACTION_SUGGESTIONS: Record<number, string[]> = {
  0: [
    "Draft the homepage wireframe",
    "Write the launch checklist",
    "Pick a hosting setup",
  ],
  1: [
    "List 10 prospects to reach out to",
    "Book the first pilot kickoff call",
    "Draft the pilot onboarding email",
  ],
  2: [
    "Block 30 min on Friday for review",
    "Write my review template",
    "Do a 10-minute inbox sweep",
  ],
  [-1]: [
    "Break the goal into 3 steps",
    "Book 30 min to scope it",
    "Write down the first blocker",
  ],
};

export function actionSuggestions(goalSuggestionIndex: number): string[] {
  return ACTION_SUGGESTIONS[goalSuggestionIndex] ?? ACTION_SUGGESTIONS[-1]!;
}

/** Playful copy set (chosen tone — see design handoff README). */
export const COPY = {
  greet: (firstName: string) =>
    `Hey ${firstName} — you made it! Let's turn this empty workspace into yours.`,
  frame: `Everything in ${PRODUCT_NAME} flows through one loop:`,
  intro2:
    "Want to build your first loop together? Takes about a minute, and it's oddly satisfying.",
  ask: {
    goal: "Big question first: what's the one thing you're really trying to make happen? Pick one or type your own.",
    action:
      "Now let's get tiny. What's one thing you could actually do this week to move it?",
    plan: "Drumroll — here's your first day plan, built from everything you just made.",
    cal: "Last thing, promise: want your calendar in here too? Totally fine to skip.",
  } satisfies Record<StepId, string>,
  made: {
    goal: "First goal — it's official. Everything else hangs off this.",
    action:
      "That's the smallest piece of the machine, linked straight to your goal. It'll pop up in Today.",
    plan: "And that's a real plan. Goal → action → today. You just built the loop.",
    cal: "Connected! Meetings and actions, finally in the same room.",
    calskip: "Skipped — no guilt. It'll be in Settings whenever.",
  },
  nudge: {
    goal: ["Let's go —", "one goal to rule the workspace."],
    action: [
      "Great start!",
      "One small action for this week and the loop takes shape.",
    ],
    plan: ["So close.", "Let's turn this into an actual day."],
    cal: ["Optional bonus round:", "hook up your calendar?"],
  } satisfies Record<StepId, string[]>,
  done: "And that's the whole game. Today is where you'll live — everything you made is already there.",
  doneTitle: "Look at you go",
  // Chat-view specific
  chips: {
    setup: "Set up with me (~1 min)",
    how: `How does ${PRODUCT_NAME} work?`,
    explore: "I'll explore on my own",
  },
  welcomeBack: (done: number, total: number) =>
    `Welcome back — you're ${done} of ${total} steps in. Let's keep going.`,
  howItWorks: {
    main: "Think of it top-down: a goal is the destination, and actions are the actual flying. Today is where actions meet your real day.",
    sub: "As you complete setup, this diagram lights up — watch the left sidebar too.",
  },
  exploreReply:
    "Totally fine — dropping you into your workspace to look around. I'm always in the corner if you need a hand.",
  freeTextFallback:
    "Let's get you set up first — it only takes a minute, then Zoe can help with anything. Want to continue?",
  railSub: {
    inProgress:
      "Your assistant is setting things up with you — everything it creates is real.",
    done: "Setup complete. Your workspace is live.",
  },
  checklistSub: "Four steps to a working system. Your assistant walks each one with you.",
  planChips: {
    confirm: "Looks right — plan my day",
    adjust: "Plan it, I'll adjust later",
  },
  calChips: {
    google: "Google Calendar",
    /** Shown while our Google calendar scopes are awaiting verification. */
    googleComingSoon: "Google Calendar (coming soon)",
    outlook: "Outlook",
    skip: "Skip for now",
  },
  goToToday: "Go to Today",
  /** Invited variant — shown instead of chat/checklist when the user joined via an invitation. */
  invited: {
    title: (workspaceName: string) => `You've joined ${workspaceName}`,
    subtitleWithInviter: (inviterName: string) =>
      `${inviterName} invited you, and you're in. One quick question before you look around.`,
    subtitle: "You're in. One quick question before you look around.",
    cta: (workspaceName: string) => `Take me to ${workspaceName}`,
  },
  /**
   * The menu picker. Written to be read once by anyone: short sentences, no
   * idioms, no product jargon, and "menu" for the list of pages on the left
   * (the word "sidebar" appears only where it names the existing command).
   */
  menu: {
    firstRunTitle: (firstName: string | null) =>
      firstName ? `Welcome, ${firstName}` : "Welcome",
    firstRunSubtitle: "One quick question first, so your menu only has what you need.",
    firstRunCta: "Continue",
    settingsTitle: "Set up your menu",
    settingsSubtitle:
      "Choose what shows in the menu on the left. This applies in every workspace you belong to.",
    settingsCta: "Done",
    question: `What would you like to use ${PRODUCT_NAME} for?`,
    questionHint:
      "Pick the closest fit. It only decides what your menu starts with, and you can change it whenever you like.",
    startsWith: "Starts with",
    listTitle: "Your menu",
    listHint:
      "Switch on what you want to see. Anything you switch off is still there, under More at the bottom of the menu.",
    liveHint: "Watch the menu on the left change as you choose.",
    afterList:
      "Inbox, Today and Time are always there. To change your menu later, choose More at the bottom of the menu.",
    on: "On",
    off: "Off",
    count: (on: number, total: number) => `${on} of ${total} switched on`,
    saving: "Saving…",
    saved: "Saved",
    saveFailed: "Not saved. Your menu was put back as it was.",
    changeLater: "You can change this at any time.",
  },
};

/** The three answers to the menu picker's question, in the order they are offered. */
export const USE_CASE_COPY: Record<NavUseCase, { title: string; desc: string }> = {
  personal: {
    title: "My own to-do list",
    desc: "Keep track of your tasks and what is due today.",
  },
  team: {
    title: "Working with a team",
    desc: "Follow shared goals, projects and decisions.",
  },
  both: {
    title: "Both",
    desc: "Your own tasks and your team's work, side by side.",
  },
};

/** Framework diagram cells: Goals → Actions → Today. */
export const FRAMEWORK_CELLS: { step: StepId; name: string; desc: string }[] = [
  { step: "goal", name: "Goals", desc: "What you want to achieve" },
  { step: "action", name: "Actions", desc: "What moves it forward" },
  { step: "plan", name: "Today", desc: "Where it gets done" },
];
