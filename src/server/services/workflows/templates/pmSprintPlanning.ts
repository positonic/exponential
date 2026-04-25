/**
 * PM Sprint Planning Template
 * 
 * Assists with sprint planning by:
 * - Analyzing backlog priority and estimates
 * - Suggesting sprint capacity allocation
 * - Identifying dependencies and risks
 * - Generating sprint goals
 */
export const pmSprintPlanningTemplate = {
  slug: "pm-sprint-planning",
  name: "Sprint Planning Assistant",
  description:
    "Analyze backlog, suggest sprint capacity allocation, identify dependencies, and generate sprint goals.",
  category: "pm",
  triggerTypes: ["manual"],
  configSchema: {
    type: "object",
    properties: {
      projectId: {
        type: "string",
        title: "Project ID",
        description: "Project to plan sprint for",
      },
      sprintDuration: {
        type: "number",
        title: "Sprint Duration (days)",
        default: 14,
      },
      teamCapacity: {
        type: "number",
        title: "Team Capacity (hours)",
        description: "Total available team hours for the sprint",
        default: 80,
      },
      focusAreas: {
        type: "array",
        title: "Focus Areas",
        items: { type: "string" },
        description: "Themes or areas to prioritize",
      },
      includeCarryover: {
        type: "boolean",
        title: "Include Carryover Items",
        default: true,
      },
    },
    required: ["projectId"],
  },
  stepDefinitions: [
    {
      type: "fetch_backlog",
      label: "Fetch prioritized backlog",
      defaultConfig: { includeEstimates: true },
    },
    {
      type: "analyze_dependencies",
      label: "Analyze task dependencies",
      defaultConfig: {},
    },
    {
      type: "calculate_velocity",
      label: "Calculate team velocity",
      defaultConfig: { sprintCount: 3 },
    },
    {
      type: "ai_suggest_sprint_items",
      label: "AI suggests sprint items",
      defaultConfig: { modelName: "gpt-4o" },
    },
    {
      type: "ai_generate_sprint_goals",
      label: "Generate sprint goals",
      defaultConfig: { modelName: "gpt-4o" },
    },
    {
      type: "store_sprint_plan",
      label: "Save sprint plan draft",
      defaultConfig: {},
    },
  ],
} as const;
