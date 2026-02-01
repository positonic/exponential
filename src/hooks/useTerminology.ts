'use client';

import { useWorkspace } from '~/providers/WorkspaceProvider';

export interface Terminology {
  // Goals/Objectives
  goal: string;
  goals: string;
  addGoal: string;
  createGoal: string;
  updateGoal: string;
  deleteGoal: string;
  noGoalsFound: string;
  noGoalsYet: string;
  whyThisGoal: string;
  whatIsYourGoal: string;

  // Weekly outcomes
  weeklyOutcome: string;
  weeklyOutcomes: string;

  // OKR-specific (only for team/org)
  keyResult: string;
  keyResults: string;
  okr: string;
  okrs: string;

  // Feature flags
  showOkrFeatures: boolean;
  showKeyResults: boolean;

  // Outcome types to show for this workspace type
  visibleOutcomeTypes: Array<'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual' | 'life' | 'problem'>;
}

const personalTerminology: Terminology = {
  // Goals (human-friendly language)
  goal: 'Goal',
  goals: 'Goals',
  addGoal: 'Add Goal',
  createGoal: 'Create Goal',
  updateGoal: 'Update Goal',
  deleteGoal: 'Delete Goal',
  noGoalsFound: 'No goals found',
  noGoalsYet: 'No goals yet',
  whyThisGoal: 'Why this goal?',
  whatIsYourGoal: "What's your goal?",

  // Weekly outcomes become "Weekly Focus"
  weeklyOutcome: 'Weekly Focus',
  weeklyOutcomes: 'Weekly Focus',

  // OKR terminology hidden for personal
  keyResult: '',
  keyResults: '',
  okr: '',
  okrs: '',

  // Feature flags - hide OKR features for personal
  showOkrFeatures: false,
  showKeyResults: false,

  // Simpler outcome types for personal users
  visibleOutcomeTypes: ['daily', 'weekly', 'monthly'],
};

const teamTerminology: Terminology = {
  // Objectives (professional OKR language)
  goal: 'Objective',
  goals: 'Objectives',
  addGoal: 'Add Objective',
  createGoal: 'Create Objective',
  updateGoal: 'Update Objective',
  deleteGoal: 'Delete Objective',
  noGoalsFound: 'No objectives found',
  noGoalsYet: 'No objectives yet',
  whyThisGoal: 'Why this objective?',
  whatIsYourGoal: "What's your objective?",

  // Standard outcome terminology
  weeklyOutcome: 'Weekly Outcome',
  weeklyOutcomes: 'Weekly Outcomes',

  // Full OKR terminology
  keyResult: 'Key Result',
  keyResults: 'Key Results',
  okr: 'OKR',
  okrs: 'OKRs',

  // Feature flags - show all OKR features
  showOkrFeatures: true,
  showKeyResults: true,

  // Full outcome types for teams
  visibleOutcomeTypes: ['daily', 'weekly', 'monthly', 'quarterly', 'annual'],
};

/**
 * Hook that returns context-aware terminology based on workspace type.
 *
 * - Personal workspaces: Human-friendly language (Goals, Weekly Focus)
 * - Team/Organization workspaces: Professional OKR terminology (Objectives, Key Results)
 */
export function useTerminology(): Terminology {
  const { workspace } = useWorkspace();

  // Default to team terminology if workspace not loaded yet
  // This prevents UI flicker when switching workspaces
  if (!workspace) {
    return teamTerminology;
  }

  const isPersonal = workspace.type === 'personal';

  return isPersonal ? personalTerminology : teamTerminology;
}

/**
 * Helper to check if a workspace type is personal.
 * Useful for conditional rendering without the full terminology object.
 */
export function useIsPersonalWorkspace(): boolean {
  const { workspace } = useWorkspace();
  return workspace?.type === 'personal';
}
