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

// Try a list of common arg field names in order.
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
  searchVideosTool: {
    verb: 'Search videos',
    pastTense: 'Searched videos',
    pluralPast: 'Ran {n} video searches',
    progress: 'Searching videos… {n}/{total}',
    pickArg: pickFirstString('query', 'q'),
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
