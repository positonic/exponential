/**
 * PM Standup Summary Template
 * 
 * Generates a daily standup summary including:
 * - Actions completed yesterday
 * - Actions planned for today
 * - Blockers and risks
 * - Project health highlights
 */
export const pmStandupSummaryTemplate = {
  slug: "pm-standup-summary",
  name: "Daily Standup Summary",
  description:
    "Generate an automated daily standup summary with completed work, planned tasks, blockers, and project health status.",
  category: "pm",
  triggerTypes: ["manual", "scheduled"],
  configSchema: {
    type: "object",
    properties: {
      userId: { 
        type: "string", 
        title: "User ID",
        description: "Target user for the standup summary",
      },
      workspaceId: {
        type: "string",
        title: "Workspace ID (optional)",
        description: "Filter to a specific workspace",
      },
      includeProjects: {
        type: "boolean",
        title: "Include Project Updates",
        default: true,
      },
      includeBlockers: {
        type: "boolean",
        title: "Include Blockers",
        default: true,
      },
      outputFormat: {
        type: "string",
        title: "Output Format",
        enum: ["markdown", "slack", "email"],
        default: "markdown",
      },
      notifyChannel: {
        type: "string",
        title: "Notification Channel (optional)",
        description: "WhatsApp, Slack, or Email",
      },
    },
    required: ["userId"],
  },
  stepDefinitions: [
    {
      type: "fetch_completed_actions",
      label: "Fetch yesterday's completed actions",
      defaultConfig: { lookbackDays: 1 },
    },
    {
      type: "fetch_planned_actions",
      label: "Fetch today's planned actions",
      defaultConfig: {},
    },
    {
      type: "fetch_blockers",
      label: "Identify blockers and overdue items",
      defaultConfig: {},
    },
    {
      type: "fetch_project_health",
      label: "Get project health summaries",
      defaultConfig: { healthThreshold: 70 },
    },
    {
      type: "ai_generate_standup",
      label: "Generate standup summary",
      defaultConfig: { modelName: "gpt-4o" },
    },
    {
      type: "send_notification",
      label: "Send standup notification",
      defaultConfig: {},
    },
  ],
} as const;
