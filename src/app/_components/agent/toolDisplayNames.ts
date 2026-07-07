// Friendly display labels for agent tool invocations.
// Falls back to the raw tool name when an entry is missing.

export interface ToolDisplay {
  /** Imperative-present, e.g. "Create project". */
  verb: string;
  /** Past tense, single, e.g. "Created project". */
  pastTense: string;
  /** Past tense, plural with {n} placeholder, e.g. "Created {n} projects". */
  pluralPast: string;
  /** Present continuous with {n} / {total} for live count, e.g. "Creating projects… {n}/{total}". */
  progress: string;
  /** Pull the headline label from the tool args (project name, search query, etc.). */
  pickArg: (args: Record<string, unknown> | undefined) => string | undefined;
}

// Try a list of curated arg field names in order. Only ever returns fields a
// curator vetted as human-readable text — never ids, booleans, or JSON.
const pickFirstString =
  (...keys: string[]) =>
  (args: Record<string, unknown> | undefined): string | undefined => {
    if (!args) return undefined;
    for (const key of keys) {
      const v = args[key];
      if (typeof v === 'string' && v.trim()) return v;
    }
    return undefined;
  };

// For tools whose args carry no safe human-readable headline (ids, flags,
// date ranges): the row shows the verb alone.
const noArg = (): undefined => undefined;

export const TOOL_DISPLAY: Record<string, ToolDisplay> = {
  createProjectTool: {
    verb: 'Create project',
    pastTense: 'Created project',
    pluralPast: 'Created {n} projects',
    progress: 'Creating projects… {n}/{total}',
    pickArg: pickFirstString('name', 'title', 'projectName'),
  },
  createActionTool: {
    verb: 'Create task',
    pastTense: 'Created task',
    pluralPast: 'Created {n} tasks',
    progress: 'Creating tasks… {n}/{total}',
    pickArg: pickFirstString('name', 'title', 'description'),
  },
  quickCreateActionTool: {
    verb: 'Create task',
    pastTense: 'Created task',
    pluralPast: 'Created {n} tasks',
    progress: 'Creating tasks… {n}/{total}',
    pickArg: pickFirstString('name', 'title', 'description'),
  },
  searchVideosTool: {
    verb: 'Search videos',
    pastTense: 'Searched videos',
    pluralPast: 'Ran {n} video searches',
    progress: 'Searching videos… {n}/{total}',
    pickArg: pickFirstString('query', 'q'),
  },
  getTodaysActionsTool: {
    verb: "Get today's tasks",
    pastTense: "Fetched today's tasks",
    pluralPast: "Fetched today's tasks ×{n}",
    progress: "Fetching today's tasks… {n}/{total}",
    pickArg: noArg,
  },
  getAllProjectsTool: {
    verb: 'Get projects',
    pastTense: 'Fetched projects',
    pluralPast: 'Fetched projects ×{n}',
    progress: 'Fetching projects… {n}/{total}',
    pickArg: noArg,
  },
  getProjectActionsTool: {
    verb: 'Get project tasks',
    pastTense: 'Fetched project tasks',
    pluralPast: 'Fetched project tasks ×{n}',
    progress: 'Fetching project tasks… {n}/{total}',
    pickArg: noArg,
  },
  listProductsTool: {
    verb: 'List products',
    pastTense: 'Listed products',
    pluralPast: 'Listed products ×{n}',
    progress: 'Listing products… {n}/{total}',
    pickArg: noArg,
  },
  createTicketTool: {
    verb: 'Create ticket',
    pastTense: 'Created ticket',
    pluralPast: 'Created {n} tickets',
    progress: 'Creating tickets… {n}/{total}',
    pickArg: pickFirstString('title'),
  },
  bulkCreateTicketsTool: {
    verb: 'Create tickets',
    pastTense: 'Created tickets',
    pluralPast: 'Created tickets ×{n}',
    progress: 'Creating tickets… {n}/{total}',
    pickArg: noArg,
  },
  getOkrObjectivesTool: {
    verb: 'Get OKR objectives',
    pastTense: 'Fetched OKR objectives',
    pluralPast: 'Fetched OKR objectives ×{n}',
    progress: 'Fetching OKR objectives… {n}/{total}',
    pickArg: noArg,
  },
  getTodayCalendarEventsTool: {
    verb: "Get today's calendar",
    pastTense: "Fetched today's calendar",
    pluralPast: "Fetched today's calendar ×{n}",
    progress: "Fetching today's calendar… {n}/{total}",
    pickArg: noArg,
  },
  getUpcomingCalendarEventsTool: {
    verb: 'Get upcoming events',
    pastTense: 'Fetched upcoming events',
    pluralPast: 'Fetched upcoming events ×{n}',
    progress: 'Fetching upcoming events… {n}/{total}',
    pickArg: noArg,
  },
  getUserWorkspacesTool: {
    verb: 'Get workspaces',
    pastTense: 'Fetched workspaces',
    pluralPast: 'Fetched workspaces ×{n}',
    progress: 'Fetching workspaces… {n}/{total}',
    pickArg: noArg,
  },
  queryMeetingContextTool: {
    verb: 'Search meeting notes',
    pastTense: 'Searched meeting notes',
    pluralPast: 'Ran {n} meeting-notes searches',
    progress: 'Searching meeting notes… {n}/{total}',
    pickArg: pickFirstString('query', 'question'),
  },
};

// Convert a raw tool name like "createProjectTool" into "Create project tool"
// for unmapped tools. Better than showing `createProjectTool` in user-facing UI.
export function humanizeToolName(name: string): string {
  return name
    .replace(/Tool$/, '')
    .replace(/([A-Z])/g, ' $1')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/^./, (c) => c.toUpperCase());
}
