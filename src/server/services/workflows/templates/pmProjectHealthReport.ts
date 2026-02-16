/**
 * PM Project Health Report Template
 * 
 * Generates comprehensive project health reports:
 * - Progress vs targets
 * - Risk assessment
 * - Team velocity trends
 * - Blocker analysis
 * - Recommendations
 */
export const pmProjectHealthReportTemplate = {
  slug: "pm-project-health-report",
  name: "Project Health Report",
  description:
    "Generate comprehensive project health reports with progress tracking, risk assessment, and AI recommendations.",
  category: "pm",
  triggerTypes: ["manual", "scheduled"],
  configSchema: {
    type: "object",
    properties: {
      projectId: {
        type: "string",
        title: "Project ID",
      },
      reportPeriod: {
        type: "string",
        title: "Report Period",
        enum: ["week", "sprint", "month", "quarter"],
        default: "week",
      },
      includeComparison: {
        type: "boolean",
        title: "Include Period Comparison",
        default: true,
      },
      stakeholderFormat: {
        type: "boolean",
        title: "Stakeholder-Friendly Format",
        description: "Simplify technical details for stakeholders",
        default: false,
      },
      outputFormat: {
        type: "string",
        title: "Output Format",
        enum: ["markdown", "pdf", "notion"],
        default: "markdown",
      },
    },
    required: ["projectId"],
  },
  stepDefinitions: [
    {
      type: "fetch_project_metrics",
      label: "Fetch project metrics",
      defaultConfig: {},
    },
    {
      type: "calculate_health_score",
      label: "Calculate health score",
      defaultConfig: {},
    },
    {
      type: "analyze_velocity_trends",
      label: "Analyze velocity trends",
      defaultConfig: { trendPeriods: 4 },
    },
    {
      type: "identify_risks",
      label: "Identify risks and blockers",
      defaultConfig: {},
    },
    {
      type: "ai_generate_recommendations",
      label: "Generate AI recommendations",
      defaultConfig: { modelName: "gpt-4o" },
    },
    {
      type: "ai_compile_report",
      label: "Compile health report",
      defaultConfig: { modelName: "gpt-4o" },
    },
    {
      type: "store_report",
      label: "Save report",
      defaultConfig: {},
    },
  ],
} as const;
