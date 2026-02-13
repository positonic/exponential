# CRM Architecture — Developer Guide

The CRM is a workspace-scoped system for managing contacts, organizations, interactions, communications, and a deal pipeline. This document covers the full architecture, data model relationships, and developer patterns.

---

## Module Overview

| Module | What it does | Router | Key models |
|--------|-------------|--------|------------|
| **Contacts** | People management with PII encryption, import from Gmail/Calendar | `crmContact` | `CrmContact`, `CrmContactInteraction` |
| **Organizations** | Company/account management linked to contacts | `crmOrganization` | `CrmOrganization` |
| **Pipeline** | Sales pipeline as a Kanban board with configurable stages | `pipeline` | `Deal`, `PipelineStage`, `DealActivity` |
| **Communications** | Multi-channel messaging (email, Telegram) with templates | *(coming soon)* | `CrmCommunication`, `CrmCommunicationTemplate` |

---

## URL Structure

All CRM pages live under the workspace-scoped route:

```
/w/[workspaceSlug]/crm/
├── page.tsx                    # Dashboard — stats overview
├── layout.tsx                  # CRM shell with dedicated sidebar
├── contacts/
│   ├── page.tsx                # Contact list (search, filter, import)
│   └── [id]/page.tsx           # Contact detail (tabs: overview, interactions, communications)
├── organizations/
│   ├── page.tsx                # Organization list
│   └── [id]/page.tsx           # Organization detail with linked contacts
└── pipeline/
    ├── page.tsx                # Deal Kanban board (main pipeline view)
    └── settings/page.tsx       # Stage configuration
```

The CRM has its **own sidebar navigation** (separate from the main app sidebar), defined in `layout.tsx`:

- **Dashboard** — `/crm`
- **Pipeline** — `/crm/pipeline`
- **Contacts** — `/crm/contacts`
- **Organizations** — `/crm/organizations`
- **Communications** — `/crm/communications` *(coming soon, renders as disabled)*

---

## Data Model

### Entity Relationship Diagram

```
Workspace
├── CrmContact[]
│   ├── CrmContactInteraction[]     (activity log: emails, calls, meetings, notes)
│   ├── CrmCommunication[]          (sent messages: email/telegram)
│   └── Deal[]                      (linked sales opportunities)
├── CrmOrganization[]
│   ├── CrmContact[]                (employees/members)
│   └── Deal[]                      (linked sales opportunities)
├── Deal[]
│   ├── DealActivity[]              (audit trail: stage changes, notes, value changes)
│   ├── CrmContact?                 (primary contact)
│   ├── CrmOrganization?            (account)
│   ├── User (createdBy)
│   └── User? (assignedTo)
├── Project (type="pipeline")
│   ├── PipelineStage[]             (configurable columns)
│   └── Deal[]
├── CrmCommunication[]
├── CrmCommunicationTemplate[]
└── ContactImportBatch[]            (Gmail/Calendar import tracking)
```

### Key Relationships

- A **Deal** links to a **CrmContact** (the person) and/or a **CrmOrganization** (the company)
- A **Deal** belongs to a **PipelineStage** within a **Project** (type="pipeline")
- A **CrmContact** belongs to an optional **CrmOrganization**
- A **CrmContact** has many **CrmContactInteractions** (logged activities) and **CrmCommunications** (sent messages)
- A **DealActivity** is an audit log entry (stage transitions, value changes, notes, creation, closing)

---

## Pipeline Architecture

### Pipeline = Project with `type: "pipeline"`

The deal pipeline reuses the `Project` model with a `type` field discriminator:

```prisma
model Project {
  type            String    @default("standard")  // "standard" | "pipeline"
  pipelineStages  PipelineStage[]
  deals           Deal[]
  // ... all other Project fields (name, slug, workspace, members, etc.)
}
```

**Why this approach (hybrid model)?**

We evaluated three architectures:

1. **Extend workflow system** — Rejected. The workflow engine (`WorkflowEngine`) is an automation pipeline (sequential code execution). A deal pipeline is a manual state machine. These are fundamentally different paradigms.

2. **Fully dedicated models** — Rejected. Would duplicate workspace scoping, permissions, slug generation, and other infrastructure already in the Project model.

3. **Hybrid: Project + Deal models** — Chosen. Pipeline IS a Project (reuses workspace scoping, slug, members, permissions). Deals and Stages are NEW dedicated models purpose-built for sales tracking.

### Pipeline vs Workflow: They are NOT the same

| | Deal Pipeline | Workflow Pipeline |
|---|---|---|
| **Paradigm** | Manual state machine | Automated sequential execution |
| **Movement** | User drags deals between stages | Engine runs steps in order |
| **State** | Deal sits in a stage until moved | Steps execute once and complete |
| **Stages/Steps** | User-configurable columns | Developer-defined step types |
| **Data** | Deals with value, probability, contacts | Step input/output JSON |
| **Model** | `Deal` + `PipelineStage` | `WorkflowPipelineRun` + `WorkflowStepRun` |
| **Router** | `pipeline` | `workflowPipeline` |
| **Docs** | This document | `/docs/WORKFLOW_PIPELINE.md` |

**Future integration point**: Stage transitions in the deal pipeline could trigger workflow automations (e.g., "when deal moves to Won, send congratulations email"). This is not yet implemented.

### Default Stages

When a pipeline is created (`pipeline.create`), it initializes with 6 default stages:

| Order | Name | Color | Type | Behavior |
|-------|------|-------|------|----------|
| 0 | Lead | gray | active | Normal stage |
| 1 | Qualified | blue | active | Normal stage |
| 2 | Proposal | violet | active | Normal stage |
| 3 | Negotiation | orange | active | Normal stage |
| 4 | Won | green | won | Terminal — sets `closedAt` |
| 5 | Lost | red | lost | Terminal — sets `closedAt` |

Stage types:
- `active` — Standard stage, deal is in progress
- `won` — Terminal stage. Moving a deal here sets `deal.closedAt = now()`
- `lost` — Terminal stage. Moving a deal here sets `deal.closedAt = now()`

Moving a deal FROM a terminal stage back to an active stage clears `closedAt`.

### One Pipeline Per Workspace (MVP)

The current implementation supports one pipeline per workspace. The `pipeline.get` query finds the first `Project` with `type: "pipeline"` in the workspace. The `pipeline.create` mutation checks for existence before creating.

The page uses a `useEffect` pattern to auto-create the pipeline on first visit:

```typescript
const { data: pipeline } = api.pipeline.get.useQuery({ workspaceId });
const createMutation = api.pipeline.create.useMutation({ ... });

useEffect(() => {
  if (!pipeline && !loading && !error && !createMutation.isPending) {
    createMutation.mutate({ workspaceId });
  }
}, [/* deps */]);
```

**Important**: The `get` is a query (read-only) and `create` is a mutation (write). These were originally combined as a single `getOrCreate` query, but that caused blank pages because tRPC queries shouldn't perform writes.

---

## API Layer

### Routers

| Router | File | Lines | Registration |
|--------|------|-------|-------------|
| `crmContact` | `src/server/api/routers/crmContact.ts` | ~1,070 | `root.ts` |
| `crmOrganization` | `src/server/api/routers/crmOrganization.ts` | ~430 | `root.ts` |
| `pipeline` | `src/server/api/routers/pipeline.ts` | ~653 | `root.ts` |

### Pipeline Router Procedures

**Pipeline management:**
| Procedure | Type | Input | Description |
|-----------|------|-------|-------------|
| `get` | query | `workspaceId` | Get workspace's pipeline project (with stages) |
| `create` | mutation | `workspaceId` | Create pipeline with default stages (idempotent) |
| `update` | mutation | `projectId, name?, description?` | Update pipeline metadata |

**Stage management:**
| Procedure | Type | Input | Description |
|-----------|------|-------|-------------|
| `getStages` | query | `projectId` | Ordered stages with deal counts |
| `createStage` | mutation | `projectId, name, color?, type?, order` | Add stage, shifts existing orders |
| `updateStage` | mutation | `id, name?, color?, type?` | Edit stage properties |
| `reorderStages` | mutation | `projectId, stages[{id, order}]` | Atomic reorder via transaction |
| `deleteStage` | mutation | `id, moveDealsToStageId?` | Delete stage, optionally migrate deals |

**Deal CRUD:**
| Procedure | Type | Input | Description |
|-----------|------|-------|-------------|
| `getDeals` | query | `projectId` | All deals with stage/contact/org/assignee |
| `getDeal` | query | `id` | Single deal with 50 recent activities |
| `createDeal` | mutation | `projectId, stageId, title, value?, contactId?, ...` | Create deal + "CREATED" activity |
| `updateDeal` | mutation | `id, title?, value?, probability?, ...` | Update deal + "VALUE_CHANGE" activity |
| `moveDeal` | mutation | `id, stageId, stageOrder` | Move to stage + "STAGE_CHANGE"/"CLOSED" activity |
| `reorderDeal` | mutation | `id, stageOrder` | Reorder within same stage (drag-drop) |
| `deleteDeal` | mutation | `id` | Delete deal and activities (cascade) |

**Activity & Stats:**
| Procedure | Type | Input | Description |
|-----------|------|-------|-------------|
| `getDealActivities` | query | `dealId, limit?, cursor?` | Paginated activity log |
| `addNote` | mutation | `dealId, content` | Add "NOTE" activity |
| `getStats` | query | `projectId` | Aggregated pipeline metrics |

### Contact Router Key Procedures

| Procedure | Type | Description |
|-----------|------|-------------|
| `getAll` | query | Paginated, searchable, filterable contacts |
| `getById` | query | Single contact with interactions |
| `create` | mutation | Create contact with encrypted PII |
| `update` | mutation | Update contact fields |
| `delete` | mutation | Delete contact |
| `addInteraction` | mutation | Log an interaction (email, call, meeting, note) |
| `getStats` | query | Dashboard stats (totals, recent activity) |
| `importFromGmail` | mutation | Import contacts from Google People API |
| `importFromCalendar` | mutation | Import contacts from Google Calendar attendees |

### Organization Router Key Procedures

| Procedure | Type | Description |
|-----------|------|-------------|
| `getAll` | query | Paginated, searchable, with optional contact includes |
| `getById` | query | Single org with contacts |
| `create` | mutation | Create organization |
| `update` | mutation | Update organization |
| `delete` | mutation | Delete organization |
| `getStats` | query | Dashboard stats (totals, top orgs) |

---

## Frontend Components

### Pipeline Components

Located in `src/app/_components/pipeline/`:

| Component | Purpose | Key patterns |
|-----------|---------|-------------|
| `DealKanbanBoard.tsx` | Main Kanban board with DnD | `@dnd-kit/core` + `@dnd-kit/sortable`, optimistic updates with rollback |
| `DealColumn.tsx` | Stage column (droppable) | `useDroppable`, stage header with count + value |
| `DealCard.tsx` | Deal card (sortable/draggable) | `useSortable`, shows value/contact/probability/assignee |
| `CreateDealModal.tsx` | Deal creation form | Contact/org selectors from CRM queries |
| `DealDetailDrawer.tsx` | Deal detail slide-out | Inline editing, activity timeline, notes, delete |
| `PipelineStats.tsx` | Stats bar above Kanban | 4-card grid: Pipeline Value, Weighted Value, Won Revenue, Conversion Rate |
| `PipelineSettingsModal.tsx` | Stage management | Inline rename, color/type selectors, add/remove stages |

### Drag-and-Drop Architecture

The Kanban board uses `@dnd-kit/core` and `@dnd-kit/sortable` (same libraries as the workspace project Kanban). Key implementation details:

- **Sensors**: `PointerSensor` (8px activation distance) + `KeyboardSensor`
- **Collision detection**: `closestCenter`
- **Optimistic updates**: Deal position updates optimistically in local state, with rollback on mutation failure
- **Two operations**: `moveDeal` (cross-column drag) and `reorderDeal` (within-column drag)

### Cache Invalidation

After mutations, components invalidate these query caches:

```typescript
// Stage changes → invalidate stages list + pipeline query + deals
void utils.pipeline.getStages.invalidate({ projectId });
void utils.pipeline.get.invalidate();
void utils.pipeline.getDeals.invalidate({ projectId });

// Deal changes → invalidate deals + stats
void utils.pipeline.getDeals.invalidate({ projectId });
void utils.pipeline.getStats.invalidate({ projectId });
```

---

## PII Encryption

Contact sensitive fields are **encrypted at rest** in the database:

```prisma
email       Bytes?   // Stored as encrypted binary
phone       Bytes?
linkedIn    Bytes?
telegram    Bytes?
twitter     Bytes?
github      Bytes?
```

**Implications:**
- Email search is NOT supported (encrypted data can't be queried with `LIKE`)
- Search works on `firstName`, `lastName` only (unencrypted fields)
- All read paths must call `decryptContactPII(contact)` to decrypt before returning to client
- The encryption utility lives in the contact router helpers

---

## Contact Import System

### Import Sources

| Source | Service | Method |
|--------|---------|--------|
| Gmail | `GoogleContactsService` | Google People API v1 |
| Calendar | `ContactSyncService` | Google Calendar API (attendees) |
| Manual | Direct UI form | N/A |

### Import Flow

```
1. User triggers import from ImportDialog component
2. crmContact.importFromGmail/importFromCalendar mutation called
3. ContactImportBatch record created (status: PENDING)
4. ContactSyncService orchestrates import (status: IN_PROGRESS)
5. GoogleContactsService fetches from Google APIs
6. Contacts deduplicated by emailHash (SHA-256)
7. New contacts created, existing contacts updated
8. ConnectionStrengthCalculator scores each contact (0-100)
9. Batch marked COMPLETED or PARTIAL_SUCCESS
```

### Connection Strength

Each contact has a `connectionScore` (0-100) calculated by `ConnectionStrengthCalculator` based on:
- Interaction frequency (how often)
- Interaction recency (how recently)
- Interaction type diversity (variety of channels)
- Contact data completeness (LinkedIn, phone, etc.)

---

## Deal Activity Audit Trail

Every significant deal change creates a `DealActivity` record:

| Activity Type | When Created | Metadata |
|---------------|-------------|----------|
| `CREATED` | Deal first created | `{ stageId, stageName }` |
| `STAGE_CHANGE` | Deal moved to a different active stage | `{ fromStageId, fromStageName, toStageId, toStageName }` |
| `CLOSED` | Deal moved to a won/lost stage | `{ fromStageId, fromStageName, toStageId, toStageName }` |
| `VALUE_CHANGE` | Deal value updated | `{ oldValue, newValue }` |
| `NOTE` | User adds a note | *(content in `content` field)* |

Activities are displayed in the `DealDetailDrawer` as a chronological timeline.

---

## Pipeline Stats

The `pipeline.getStats` query computes:

| Stat | Calculation |
|------|------------|
| `totalDeals` | Count of all deals in pipeline |
| `totalValue` | Sum of all `deal.value` |
| `weightedValue` | Sum of `deal.value × (deal.probability / 100)` |
| `openDeals` | Count where stage type = "active" |
| `wonDeals` | Count where stage type = "won" |
| `lostDeals` | Count where stage type = "lost" |
| `wonValue` | Sum of value for won deals |
| `conversionRate` | `wonDeals / (wonDeals + lostDeals)` — 0 if no closed deals |
| `byStage` | `Map<stageId, { count, value, name }>` |

---

## Access Control

CRM data is **workspace-scoped**. All queries filter by `workspaceId`, which comes from the `useWorkspace()` provider on the frontend. The `protectedProcedure` middleware ensures the user is authenticated.

**Current state**: The CRM routers use `protectedProcedure` (requires auth) but do not enforce workspace membership checks beyond the workspaceId filter. This means any authenticated user who knows a workspaceId could technically query CRM data. See `/docs/ACCESS_CONTROL.md` for the centralized access control system that should be applied.

**Recommended**: Add `requireWorkspaceMembership` middleware to CRM endpoints, similar to how the workspace router protects its endpoints.

---

## File Index

```
# Schema
prisma/schema.prisma                                          # CrmContact, CrmOrganization, CrmContactInteraction,
                                                              # CrmCommunication, CrmCommunicationTemplate,
                                                              # ContactImportBatch, Deal, DealActivity, PipelineStage

# API Routers
src/server/api/routers/crmContact.ts                          # Contact CRUD + import + interactions
src/server/api/routers/crmOrganization.ts                     # Organization CRUD
src/server/api/routers/pipeline.ts                            # Pipeline + Stage + Deal CRUD + Stats
src/server/api/root.ts                                        # Router registration

# Services
src/server/services/crm/ContactSyncService.ts                 # Gmail/Calendar import orchestration
src/server/services/crm/GoogleContactsService.ts              # Google People API integration
src/server/services/crm/ConnectionStrengthCalculator.ts        # Connection score calculation

# Pages
src/app/(sidemenu)/w/[workspaceSlug]/crm/layout.tsx           # CRM sidebar layout
src/app/(sidemenu)/w/[workspaceSlug]/crm/page.tsx             # Dashboard
src/app/(sidemenu)/w/[workspaceSlug]/crm/contacts/page.tsx    # Contact list
src/app/(sidemenu)/w/[workspaceSlug]/crm/contacts/[id]/page.tsx  # Contact detail
src/app/(sidemenu)/w/[workspaceSlug]/crm/organizations/page.tsx  # Organization list
src/app/(sidemenu)/w/[workspaceSlug]/crm/organizations/[id]/page.tsx  # Org detail
src/app/(sidemenu)/w/[workspaceSlug]/crm/pipeline/page.tsx    # Kanban board
src/app/(sidemenu)/w/[workspaceSlug]/crm/pipeline/settings/page.tsx  # Stage settings

# Pipeline Components
src/app/_components/pipeline/DealKanbanBoard.tsx               # Main Kanban board with DnD
src/app/_components/pipeline/DealColumn.tsx                    # Stage column (droppable)
src/app/_components/pipeline/DealCard.tsx                      # Deal card (sortable)
src/app/_components/pipeline/CreateDealModal.tsx               # Deal creation form
src/app/_components/pipeline/DealDetailDrawer.tsx              # Deal detail slide-out
src/app/_components/pipeline/PipelineStats.tsx                 # Stats bar
src/app/_components/pipeline/PipelineSettingsModal.tsx         # Stage management

# Contact Components
src/app/(sidemenu)/w/[workspaceSlug]/crm/contacts/_components/ImportDialog.tsx
src/app/(sidemenu)/w/[workspaceSlug]/crm/contacts/_components/ConnectionScoreGauge.tsx
```

---

## Feature Status

### Implemented

- Contact CRUD with PII encryption
- Organization CRUD with contact linking
- Contact interaction logging (email, call, meeting, note, etc.)
- Gmail and Calendar contact import with deduplication
- Connection strength scoring (0-100)
- Deal pipeline with configurable Kanban stages
- Deal CRUD with contact/org linking and user assignment
- Deal activity audit trail (stage changes, value changes, notes)
- Pipeline statistics (value, weighted value, conversion rate)
- CRM dashboard with aggregate stats
- Workspace-scoped data isolation

### Not Yet Implemented

- **Communications module**: Schema exists (`CrmCommunication`, `CrmCommunicationTemplate`) but no router or UI. Shown as "Coming Soon" in CRM nav.
- **Email delivery tracking**: Postmark integration fields exist in schema but not connected.
- **Contact tagging**: `tags String[]` field exists on CrmContact but no tag management UI.
- **Background import jobs**: Gmail/Calendar imports run synchronously. Should move to background job queue for large imports.
- **CSV/Excel import**: No file-based import yet.
- **Advanced contact deduplication/merge**: Email hash exists for basic dedup, but no merge UI.
- **Multiple pipelines per workspace**: Currently limited to one pipeline. The architecture supports multiple (via Project model) but the UI assumes one.
- **Stage drag-to-reorder in settings**: The `reorderStages` API exists but the settings UI doesn't have drag-to-reorder yet (grip icon is visual only).
- **Pipeline in dashboard stats**: The CRM dashboard doesn't show pipeline stats yet.
- **Workspace membership enforcement**: CRM routers should add `requireWorkspaceMembership` middleware.

---

## Common Developer Tasks

### Adding a new CRM entity type

1. Add model to `prisma/schema.prisma` with `workspaceId` field
2. Add relation to `Workspace` model
3. Ask user to run migration: `npx prisma migrate dev --name add_crm_<entity>`
4. Create tRPC router in `src/server/api/routers/crm<Entity>.ts`
5. Register in `src/server/api/root.ts`
6. Add pages under `src/app/(sidemenu)/w/[workspaceSlug]/crm/<entity>/`
7. Add nav item to `crmNavigation` array in `crm/layout.tsx`

### Linking a new entity to Deals

1. Add optional FK to `Deal` model: `myEntityId String?`
2. Add relation: `myEntity MyEntity? @relation(fields: [myEntityId], references: [id], onDelete: SetNull)`
3. Add reverse relation on the entity: `deals Deal[]`
4. Update `pipeline.getDeals` and `pipeline.getDeal` to include the new relation
5. Update `pipeline.createDeal` and `pipeline.updateDeal` input schemas
6. Update `DealCard.tsx` and `DealDetailDrawer.tsx` to display the link

### Adding a pipeline workflow trigger

When we implement workflow automations for deal stage transitions:

1. In `pipeline.moveDeal`, after the stage change activity is created, check if any workflow definitions are configured for this pipeline
2. Call `WorkflowEngine.execute(definitionId, { dealId, fromStage, toStage })`
3. Create a new step type (e.g., `DealStageChangeTriggerStep`) that provides deal context to subsequent steps

This bridges the deal pipeline (manual state machine) with the workflow system (automation engine).
