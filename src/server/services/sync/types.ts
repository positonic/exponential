/**
 * Sync Engine Types
 *
 * Core types and interfaces for the provider-agnostic sync system.
 * Supports bidirectional sync with conflict resolution.
 */

import type { Action, ActionSync, Prisma } from '@prisma/client';

// ============================================================================
// Sync Results & Stats
// ============================================================================

export interface SyncResult {
  success: boolean;
  itemsProcessed: number;
  itemsCreated: number;
  itemsUpdated: number;
  itemsSkipped: number;
  itemsDeleted: number;
  conflicts: ConflictRecord[];
  errors: SyncError[];
}

export interface ConflictRecord {
  localActionId: string;
  externalId: string;
  localUpdatedAt: Date;
  externalUpdatedAt: Date;
  resolution: ConflictResolution;
  field?: string; // Which field conflicted, if applicable
}

export interface SyncError {
  itemId?: string;
  externalId?: string;
  operation: 'create' | 'update' | 'delete' | 'fetch';
  message: string;
  details?: unknown;
}

// ============================================================================
// Sync Configuration
// ============================================================================

export type ConflictResolution = 'local_wins' | 'remote_wins' | 'manual' | 'pending';
export type DeletionBehavior = 'mark_deleted' | 'archive' | 'ignore';
export type SyncDirection = 'pull' | 'push' | 'bidirectional';

export interface SyncConfig {
  workflowId: string;
  userId: string;
  databaseId: string;

  // Filtering
  projectId?: string; // Local project ID for scoping
  notionProjectId?: string; // External project ID for relation
  projectColumn?: string; // Dynamic column name for project relation (e.g., "Project", "Category")
  actionIds?: string[]; // Specific actions to sync (for push)

  // Mappings
  propertyMappings: PropertyMappings;
  statusMappings?: StatusMappings;
  priorityMappings?: PriorityMappings;

  // Sync behavior
  conflictResolution: ConflictResolution;
  deletionBehavior: DeletionBehavior;
  overwriteMode?: boolean; // For push: archive items not in local
}

export interface PullConfig extends SyncConfig {
  direction: 'pull';
}

export interface PushConfig extends SyncConfig {
  direction: 'push';
  source?: 'notion' | 'internal' | 'github' | 'monday'; // Filter by source
}

export interface BiSyncConfig extends SyncConfig {
  direction: 'bidirectional';
}

// ============================================================================
// Property Mappings
// ============================================================================

export interface PropertyMappings {
  title?: string; // Property name for title (default: auto-detect)
  description?: string;
  status?: string;
  priority?: string;
  dueDate?: string;
  assignee?: string;
  // Allow additional custom mappings
  [key: string]: string | undefined;
}

export interface StatusMappings {
  // External status name -> Local status
  toLocal: Record<string, string>;
  // Local status -> External status name
  toExternal: Record<string, string>;
}

export interface PriorityMappings {
  toLocal: Record<string, string>;
  toExternal: Record<string, string>;
}

// ============================================================================
// External Items (Provider-Agnostic)
// ============================================================================

export interface ExternalItem {
  id: string;
  title: string;
  description?: string;
  status?: string;
  priority?: string;
  dueDate?: Date;
  assignee?: string;
  lastEditedTime: Date;
  createdTime: Date;
  url?: string;
  archived?: boolean;
  rawData?: unknown; // Original provider data for advanced use cases
}

export interface ItemData {
  title: string;
  description?: string;
  status?: string;
  priority?: string;
  dueDate?: Date;
  assignee?: string;
  projectId?: string; // External project ID for relation
  // Allow additional custom fields
  [key: string]: unknown;
}

export interface ItemFilter {
  projectId?: string; // Filter by project relation
  projectColumn?: string; // Column name for project relation
  status?: string[];
  modifiedAfter?: Date;
}

// ============================================================================
// Parsed Action (from external items)
// ============================================================================

export interface ParsedAction {
  externalId: string;
  name: string;
  description?: string;
  status: string;
  priority?: string;
  dueDate?: Date;
  lastModified: Date;
  url?: string;
}

// ============================================================================
// Integration Service Interface
// ============================================================================

export interface ConnectionResult {
  success: boolean;
  error?: string;
  user?: {
    id: string;
    name?: string;
    email?: string;
  };
}

export interface ExternalDatabase {
  id: string;
  title: string;
  url?: string;
  properties: Record<string, ExternalProperty>;
}

export interface ExternalProperty {
  id: string;
  name: string;
  type: string;
  options?: Array<{ id: string; name: string; color?: string }>;
}

export interface DatabaseSchema {
  id: string;
  title: string;
  properties: Record<string, ExternalProperty>;
  titleProperty?: string; // Auto-detected title property name
}

/**
 * Integration Service Interface
 *
 * All external integrations must implement this interface.
 * This allows the SyncEngine to work with any provider.
 */
export interface IIntegrationService {
  // Connection
  testConnection(): Promise<ConnectionResult>;

  // Resource Discovery
  getDatabases(): Promise<ExternalDatabase[]>;
  getDatabaseSchema(databaseId: string): Promise<DatabaseSchema>;

  // CRUD Operations
  getItems(databaseId: string, filter?: ItemFilter): Promise<ExternalItem[]>;
  createItem(databaseId: string, data: ItemData, options?: CreateItemOptions): Promise<ExternalItem>;
  updateItem(itemId: string, data: Partial<ItemData>): Promise<ExternalItem>;
  archiveItem(itemId: string): Promise<void>;

  // Data Transformation
  parseToAction(item: ExternalItem, mappings: PropertyMappings): ParsedAction;
  formatFromAction(
    action: ActionWithProject,
    mappings: PropertyMappings,
    statusMappings?: StatusMappings,
    priorityMappings?: PriorityMappings
  ): ItemData;
}

export interface CreateItemOptions {
  titleProperty?: string;
  projectColumn?: string;
}

// ============================================================================
// Action Types (with sync relations)
// ============================================================================

export type ActionWithSync = Action & {
  syncs: ActionSync[];
};

export type ActionWithProject = Action & {
  project?: {
    id: string;
    name: string;
    notionProjectId?: string | null;
  } | null;
};

export type ActionWithSyncAndProject = ActionWithSync & ActionWithProject;

// ============================================================================
// Workflow Types
// ============================================================================

export interface WorkflowConfig {
  syncDirection?: SyncDirection;
  syncFrequency?: 'manual' | 'hourly' | 'daily' | 'weekly';
  databaseId?: string;
  propertyMappings?: PropertyMappings;
  statusMappings?: StatusMappings;
  priorityMappings?: PriorityMappings;
  projectColumn?: string;
  notionProjectId?: string;
  deletionHandling?: DeletionBehavior;
  overwriteMode?: boolean;
  useNewSyncEngine?: boolean; // Feature flag for incremental migration
  source?: string; // Source filter for push operations (e.g., 'fireflies', 'internal', 'all')
}

export interface WorkflowWithCredentials {
  id: string;
  name: string;
  provider: string;
  syncDirection?: string;
  config: WorkflowConfig | Prisma.JsonValue;
  integration: {
    id: string;
    provider: string;
    credentials: Array<{
      id: string;
      keyType: string;
      key: string;
    }>;
  };
}

// ============================================================================
// Sync Engine Interface
// ============================================================================

export interface ISyncEngine {
  pull(config: PullConfig): Promise<SyncResult>;
  push(config: PushConfig): Promise<SyncResult>;
  bidirectional(config: BiSyncConfig): Promise<SyncResult>;
}
