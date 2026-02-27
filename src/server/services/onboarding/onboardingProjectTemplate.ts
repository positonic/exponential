export interface OnboardingActionTemplate {
  /** Unique key matching the welcome checklist step ID */
  stepKey: string;
  name: string;
  description: string;
  order: number;
}

export const ONBOARDING_PROJECT_NAME = "Learn Exponential";

export const ONBOARDING_PROJECT_DESCRIPTION =
  "Your guided tour of Exponential. Complete these actions to master the core features — goals, outcomes, actions, daily planning, and more.";

export const ONBOARDING_ACTIONS: OnboardingActionTemplate[] = [
  {
    stepKey: "project",
    name: "Create your first project",
    description:
      "Projects are the foundation for organizing your work. Group related actions, goals, and outcomes together.",
    order: 1,
  },
  {
    stepKey: "goal",
    name: "Set your first goal",
    description:
      "Goals keep you focused on what matters most. They cascade into outcomes and actions to drive execution.",
    order: 2,
  },
  {
    stepKey: "outcome",
    name: "Define an outcome",
    description:
      "Outcomes are measurable results linked to your goals. They help you track whether you're making real progress.",
    order: 3,
  },
  {
    stepKey: "actions",
    name: "Add actions to a project",
    description:
      "Actions are the concrete tasks that move projects forward. Link them to projects to keep everything connected.",
    order: 4,
  },
  {
    stepKey: "calendar",
    name: "Connect your calendar",
    description:
      "Sync your Google or Outlook calendar to unify planning and execution in one place.",
    order: 5,
  },
  {
    stepKey: "dailyPlan",
    name: "Plan your first day",
    description:
      "The daily plan turns your goals and actions into a realistic schedule. It's where execution happens.",
    order: 6,
  },
  {
    stepKey: "complete",
    name: "Complete your first action",
    description:
      "Check off your first task to see how momentum builds. Small wins compound into big results.",
    order: 7,
  },
];

/** Map from stepKey to action name for quick lookup */
export const STEP_KEY_TO_ACTION_NAME: Record<string, string> =
  Object.fromEntries(ONBOARDING_ACTIONS.map((a) => [a.stepKey, a.name]));
