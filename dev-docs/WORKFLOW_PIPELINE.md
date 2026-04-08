# Workflow Pipeline System — Developer Guide

The workflow pipeline system is a template-based automation engine that executes multi-step workflows with sequential data flow, full audit trails, and pluggable step types.

## Architecture Overview

```
WorkflowTemplate (system blueprint)
  └─ WorkflowDefinition (user instance with config + schedule)
       └─ WorkflowStep[] (ordered step types with per-step config)
            └─ WorkflowPipelineRun (execution instance)
                 └─ WorkflowStepRun[] (per-step execution with I/O)
```

### Core Components

| Component | File | Purpose |
|-----------|------|---------|
| `WorkflowEngine` | `src/server/services/workflows/WorkflowEngine.ts` | Executes pipeline runs — iterates steps sequentially, chains I/O, records results |
| `StepRegistry` | `src/server/services/workflows/StepRegistry.ts` | Maps step type strings to executor instances |
| `IStepExecutor` | `src/server/services/workflows/steps/IStepExecutor.ts` | Interface every step type must implement |
| Templates | `src/server/services/workflows/templates/` | System template definitions |
| `seedTemplates` | `src/server/services/workflows/seedTemplates.ts` | Upserts system templates into the database |
| tRPC Router | `src/server/api/routers/workflowPipeline.ts` | API for CRUD + execution |

### Execution Flow

```
1. User calls workflowPipeline.execute(definitionId, overrideConfig?)
2. WorkflowEngine loads the definition + its ordered steps
3. Creates a WorkflowPipelineRun (status: RUNNING)
4. For each WorkflowStep (in order):
   a. Creates a WorkflowStepRun (status: RUNNING)
   b. Looks up the executor via StepRegistry.get(step.type)
   c. Calls executor.execute(input, stepConfig, context)
   d. Merges step output into the running input for the next step
   e. Records output, duration, status on the WorkflowStepRun
5. If all steps succeed: marks run as SUCCESS, stores final output
6. If any step fails: marks step and run as FAILED, stores error
7. Updates definition.lastRunAt
```

**Input/Output chaining**: Each step receives the merged output of all previous steps plus the initial config. Steps add to this accumulating context — step 3 can access outputs from step 1 and step 2.

---

## Data Models

### WorkflowTemplate

System-defined blueprints. Users create definitions from these.

```prisma
model WorkflowTemplate {
  id              String   @id @default(cuid())
  slug            String   @unique        // e.g. "content-generation"
  name            String                  // Display name
  description     String   @db.Text       // What this template does
  category        String                  // e.g. "content", "pm", "analytics"
  triggerTypes    String[]                // ["manual", "scheduled", "webhook"]
  configSchema    Json                    // JSON Schema for user config
  stepDefinitions Json                    // Default steps (type, label, defaultConfig)
  isSystem        Boolean  @default(true) // System vs user-created
  isActive        Boolean  @default(true)
}
```

### WorkflowDefinition

A user's configured instance of a template (or standalone).

```prisma
model WorkflowDefinition {
  id           String    @id @default(cuid())
  workspaceId  String                    // Scoped to workspace
  createdById  String
  templateId   String?                   // Optional template reference
  name         String                    // User-given name
  description  String?
  config       Json                      // Runtime config (merged with step input)
  triggerType  String    @default("manual")  // "manual" | "scheduled" | "webhook"
  cronSchedule String?                   // Cron expression (e.g. "0 9 * * MON")
  isActive     Boolean   @default(true)
  lastRunAt    DateTime?
}
```

### WorkflowStep

Ordered steps within a definition.

```prisma
model WorkflowStep {
  id           String   @id @default(cuid())
  definitionId String
  order        Int                       // Execution order (0, 1, 2, ...)
  type         String                    // Matches IStepExecutor.type
  label        String                    // Display label
  config       Json     @default("{}")   // Per-step configuration
  @@unique([definitionId, order])
}
```

### WorkflowPipelineRun

One execution of a definition.

```prisma
model WorkflowPipelineRun {
  id            String    @id @default(cuid())
  definitionId  String
  triggeredById String?
  status        String    @default("RUNNING")  // RUNNING | SUCCESS | FAILED
  input         Json?                          // Initial input
  output        Json?                          // Final accumulated output
  errorMessage  String?
  startedAt     DateTime  @default(now())
  completedAt   DateTime?
  metadata      Json?
}
```

### WorkflowStepRun

One step's execution within a run.

```prisma
model WorkflowStepRun {
  id           String    @id @default(cuid())
  runId        String
  stepId       String
  status       String    @default("PENDING")  // PENDING | RUNNING | SUCCESS | FAILED
  input        Json?                          // What this step received
  output       Json?                          // What this step produced
  errorMessage String?
  startedAt    DateTime?
  completedAt  DateTime?
  durationMs   Int?
}
```

### ContentDraft

Output artifact created by content generation workflows.

```prisma
model ContentDraft {
  id                String    @id @default(cuid())
  workspaceId       String
  createdById       String
  pipelineRunId     String?   // Links to the run that created this
  title             String
  content           String    @db.Text
  platform          String    // BLOG | TWITTER | LINKEDIN | YOUTUBE_SCRIPT
  status            String    @default("DRAFT")
  assistantId       String?
  tone              String?
  version           Int       @default(1)
  wordCount         Int?
}
```

---

## Creating a New Step Type

### 1. Implement the `IStepExecutor` interface

Create a new file in `src/server/services/workflows/steps/`:

```typescript
// src/server/services/workflows/steps/MyNewStep.ts
import { type IStepExecutor, type StepContext } from "./IStepExecutor";

export class MyNewStep implements IStepExecutor {
  type = "my_new_step";       // Unique step type identifier
  label = "Do Something New"; // Human-readable label

  async execute(
    input: Record<string, unknown>,    // Accumulated data from previous steps + config
    config: Record<string, unknown>,   // Per-step config from WorkflowStep.config
    context: StepContext,              // { userId, workspaceId, runId }
  ): Promise<Record<string, unknown>> {
    // Read from input (output of previous steps + definition config)
    const someData = input.someField as string;

    // Do work...
    const result = await doSomething(someData);

    // Return output (merged into input for next step)
    return {
      myResult: result,
      myCount: result.length,
    };
  }
}
```

**Key rules:**
- `type` must be unique across all registered steps
- `input` is the accumulated context — outputs from all prior steps merged together
- `config` is step-specific configuration from the `WorkflowStep.config` JSON field
- `context` provides `userId`, `workspaceId`, and `runId`
- Return value is merged (`{ ...previousInput, ...thisOutput }`) for the next step
- Throw an error to fail the step (and the entire run)

### 2. Register in StepRegistry

```typescript
// src/server/services/workflows/StepRegistry.ts
import { MyNewStep } from "./steps/MyNewStep";

export function createStepRegistry(db: PrismaClient): StepRegistry {
  const registry = new StepRegistry();
  // ... existing registrations ...
  registry.register(new MyNewStep());       // Add your step
  return registry;
}
```

If your step needs database access, pass `db` via constructor (see `StoreContentDraftStep` for this pattern).

### 3. Use in a template or definition

Reference your step's `type` string in template `stepDefinitions` or when creating `WorkflowStep` records.

---

## Creating a New Template

Templates are defined as TypeScript objects and seeded into the database.

### 1. Define the template

Create a file in `src/server/services/workflows/templates/`:

```typescript
// src/server/services/workflows/templates/myTemplate.ts
export const myTemplate = {
  slug: "my-template",                    // URL-safe unique identifier
  name: "My Workflow Template",           // Display name
  description: "What this template does", // Shown to users
  category: "analytics",                  // Grouping category
  triggerTypes: ["manual", "scheduled"],  // Supported trigger types
  configSchema: {                         // JSON Schema for user config
    type: "object",
    properties: {
      projectId: { type: "string", title: "Project" },
      lookbackDays: { type: "number", title: "Days to analyze", default: 7 },
    },
    required: ["projectId"],
  },
  stepDefinitions: [                      // Default steps (in order)
    {
      type: "gather_data",               // Must match a registered step type
      label: "Gather project data",
      defaultConfig: {},                  // Default per-step config
    },
    {
      type: "analyze_data",
      label: "Analyze trends",
      defaultConfig: { modelName: "gpt-4o" },
    },
    {
      type: "send_notification",
      label: "Send results",
      defaultConfig: { message: "Analysis complete!" },
    },
  ],
} as const;
```

### 2. Register in seedTemplates

```typescript
// src/server/services/workflows/seedTemplates.ts
import { myTemplate } from "./templates/myTemplate";

const SYSTEM_TEMPLATES = [contentGenerationTemplate, myTemplate];
```

### 3. Seed the database

Call `workflowPipeline.seedTemplates` via tRPC (admin only) or include in database seeding scripts.

---

## Built-in Step Types

### `fetch_github_commits`

**File**: `steps/FetchGitHubCommitsStep.ts`

Fetches commits from a GitHub repository within a date range.

| Input | Type | Description |
|-------|------|-------------|
| `owner` | string | GitHub org/user |
| `repo` | string | Repository name |
| `branch` | string | Branch (default: "main") |
| `dayRange` | number | Days to look back (default: 7) |
| `since` | string | ISO date (overrides dayRange) |
| `until` | string | ISO date (default: now) |

| Output | Type | Description |
|--------|------|-------------|
| `commits` | GitHubCommit[] | Array of `{ sha, message, author, date, url }` |
| `commitCount` | number | Total commits fetched |
| `repoOwner` | string | Resolved owner |
| `repoName` | string | Resolved repo |
| `branch` | string | Branch used |
| `since` | string | Start date used |
| `until` | string | End date used |

Uses `GITHUB_TOKEN` env var for authenticated access. Paginates automatically (100 per page).

### `ai_analyze`

**File**: `steps/AiAnalyzeStep.ts`

Groups commits into user-facing feature descriptions using GPT-4o.

| Input | Type | Description |
|-------|------|-------------|
| `commits` | GitHubCommit[] | From `fetch_github_commits` |

| Config | Type | Description |
|--------|------|-------------|
| `modelName` | string | OpenAI model (default: "gpt-4o") |

| Output | Type | Description |
|--------|------|-------------|
| `featureGroups` | FeatureGroup[] | `{ name, description, significance, commitShas }` |
| `featureCount` | number | Number of feature groups |

Significance levels: `major` (new features), `minor` (enhancements), `bugfix` (fixes). Max 15 groups.

### `ai_generate_content`

**File**: `steps/AiGenerateContentStep.ts`

Generates platform-specific content from feature groups.

| Input | Type | Description |
|-------|------|-------------|
| `featureGroups` | FeatureGroup[] | From `ai_analyze` |
| `platforms` | string[] | Target platforms (default: ["BLOG"]) |
| `tone` | string? | Writing tone |
| `assistantPersonality` | string? | Custom voice/personality |
| `repoName` | string? | Product name for content |

| Config | Type | Description |
|--------|------|-------------|
| `modelName` | string | OpenAI model (default: "gpt-4o") |

| Output | Type | Description |
|--------|------|-------------|
| `drafts` | GeneratedDraft[] | `{ title, content, platform, wordCount }` |
| `draftCount` | number | Number of drafts created |

Supported platforms: `BLOG`, `TWITTER`, `LINKEDIN`, `YOUTUBE_SCRIPT`.

### `store_content_draft`

**File**: `steps/StoreContentDraftStep.ts`

Persists generated drafts to the `ContentDraft` table.

| Input | Type | Description |
|-------|------|-------------|
| `drafts` | DraftInput[] | From `ai_generate_content` |
| `assistantId` | string? | Assistant used for generation |
| `tone` | string? | Tone used |

| Output | Type | Description |
|--------|------|-------------|
| `draftIds` | string[] | Created draft record IDs |
| `draftCount` | number | Number stored |

Requires `db` constructor injection (see StepRegistry setup).

### `send_notification`

**File**: `steps/SendNotificationStep.ts`

Sends a notification when the workflow completes. Currently logs to console — designed to be extended with the existing `NotificationService` for email/Slack/WhatsApp delivery.

| Input | Type | Description |
|-------|------|-------------|
| `draftCount` | number? | Used in default message |

| Config | Type | Description |
|--------|------|-------------|
| `message` | string? | Custom notification message |

| Output | Type | Description |
|--------|------|-------------|
| `notified` | boolean | Always true |
| `message` | string | Message sent |

---

## tRPC API Reference

Router: `workflowPipeline` (file: `src/server/api/routers/workflowPipeline.ts`)

### Templates

| Procedure | Type | Description |
|-----------|------|-------------|
| `listTemplates(category?)` | query | List active system templates, optionally filtered by category |
| `getTemplate(slug)` | query | Get a single template by slug |
| `seedTemplates()` | mutation | Upsert system templates (admin) |

### Definitions (User Workflows)

| Procedure | Type | Description |
|-----------|------|-------------|
| `createDefinition(templateId?, name, config, ...)` | mutation | Create a workflow from template or standalone |
| `listDefinitions(workspaceId)` | query | List user's workflows with run counts |
| `getDefinition(id)` | query | Get definition with all steps |
| `updateDefinition(id, ...)` | mutation | Update name, config, trigger, schedule, active status |
| `deleteDefinition(id)` | mutation | Delete a workflow |

### Execution

| Procedure | Type | Description |
|-----------|------|-------------|
| `execute(definitionId, overrideConfig?)` | mutation | Run a workflow manually. Override config merges with definition config. |
| `listRuns(definitionId?, workspaceId?, limit, cursor)` | query | Paginated execution history |
| `getRun(id)` | query | Single run with step details and content drafts |

---

## Scheduling

The `WorkflowDefinition` model supports scheduled execution via:
- `triggerType: "scheduled"` — marks the definition as schedule-triggered
- `cronSchedule: "0 9 * * MON"` — standard cron expression

**Current state**: The `cronSchedule` field is stored but not yet enforced by an automatic scheduler. Definitions must be triggered manually via the `execute` tRPC call. A `WorkflowSchedulerService` is planned to enforce cron schedules via Vercel Cron Jobs — see the AI PM Agent plan for details.

---

## Example: Content Generation Pipeline

The built-in "Commit → Content Pipeline" template demonstrates the full system:

**Template**: `src/server/services/workflows/templates/contentGeneration.ts`

**Pipeline**:
```
fetch_github_commits → ai_analyze → ai_generate_content → store_content_draft → send_notification
```

**Config**: GitHub owner/repo, branch, day range, platforms, tone, assistant voice

**Flow**:
1. `fetch_github_commits` fetches commits from GitHub → outputs `commits[]`
2. `ai_analyze` groups commits into features → outputs `featureGroups[]`
3. `ai_generate_content` creates platform-specific content → outputs `drafts[]`
4. `store_content_draft` persists drafts to database → outputs `draftIds[]`
5. `send_notification` logs completion notification

Each step reads from the accumulated input and adds its output for the next step.

---

## File Index

```
src/server/services/workflows/
├── WorkflowEngine.ts              # Core execution engine
├── StepRegistry.ts                # Step type registry + factory function
├── seedTemplates.ts               # System template seeding
├── steps/
│   ├── IStepExecutor.ts           # Step interface + StepContext type
│   ├── FetchGitHubCommitsStep.ts  # GitHub commit fetching
│   ├── AiAnalyzeStep.ts          # AI commit analysis
│   ├── AiGenerateContentStep.ts   # AI content generation
│   ├── StoreContentDraftStep.ts   # Database persistence
│   └── SendNotificationStep.ts    # Notification (console log)
└── templates/
    └── contentGeneration.ts       # Content Generation template definition

src/server/api/routers/
└── workflowPipeline.ts            # tRPC router for CRUD + execution
```
