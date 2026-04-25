/**
 * PM Meeting Prep Template
 * 
 * Prepares context for upcoming meetings:
 * - Relevant project updates
 * - Open action items for attendees
 * - Previous meeting notes
 * - Suggested agenda items
 * - Key discussion points
 */
export const pmMeetingPrepTemplate = {
  slug: "pm-meeting-prep",
  name: "Meeting Preparation",
  description:
    "Prepare comprehensive meeting context including project updates, action items, previous notes, and suggested agenda.",
  category: "pm",
  triggerTypes: ["manual", "scheduled"],
  configSchema: {
    type: "object",
    properties: {
      meetingId: {
        type: "string",
        title: "Meeting ID (optional)",
        description: "Existing meeting to prepare for",
      },
      calendarEventId: {
        type: "string",
        title: "Calendar Event ID (optional)",
        description: "Google Calendar event ID",
      },
      projectId: {
        type: "string",
        title: "Project ID (optional)",
        description: "Focus on a specific project",
      },
      attendeeIds: {
        type: "array",
        title: "Attendee User IDs",
        items: { type: "string" },
      },
      meetingType: {
        type: "string",
        title: "Meeting Type",
        enum: ["standup", "planning", "review", "1on1", "stakeholder", "general"],
        default: "general",
      },
      includeActionItems: {
        type: "boolean",
        title: "Include Open Action Items",
        default: true,
      },
      includePreviousNotes: {
        type: "boolean",
        title: "Include Previous Meeting Notes",
        default: true,
      },
    },
    required: [],
  },
  stepDefinitions: [
    {
      type: "fetch_meeting_context",
      label: "Fetch meeting details",
      defaultConfig: {},
    },
    {
      type: "fetch_attendee_actions",
      label: "Fetch open actions for attendees",
      defaultConfig: {},
    },
    {
      type: "fetch_previous_meetings",
      label: "Fetch previous meeting notes",
      defaultConfig: { limit: 3 },
    },
    {
      type: "fetch_project_updates",
      label: "Fetch relevant project updates",
      defaultConfig: { dayRange: 7 },
    },
    {
      type: "ai_generate_agenda",
      label: "Generate suggested agenda",
      defaultConfig: { modelName: "gpt-4o" },
    },
    {
      type: "ai_generate_talking_points",
      label: "Generate key talking points",
      defaultConfig: { modelName: "gpt-4o" },
    },
    {
      type: "compile_prep_document",
      label: "Compile prep document",
      defaultConfig: {},
    },
  ],
} as const;
