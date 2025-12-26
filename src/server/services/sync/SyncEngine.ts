/**
 * SyncEngine - Provider-Agnostic Sync Orchestration
 *
 * Handles pull, push, and bidirectional sync operations for any integration
 * that implements the IIntegrationService interface.
 */

import type { PrismaClient } from '@prisma/client';
import type {
  IIntegrationService,
  SyncResult,
  PullConfig,
  PushConfig,
  BiSyncConfig,
  ConflictRecord,
  SyncError,
  ExternalItem,
  ActionWithSyncAndProject,
  ItemFilter,
} from './types';

interface SyncContext {
  userId: string;
  db: PrismaClient;
}

export class SyncEngine {
  constructor(
    private ctx: SyncContext,
    private service: IIntegrationService,
    private provider: string
  ) {}

  /**
   * Pull sync: Fetch items from external service and create/update local actions
   */
  async pull(config: PullConfig): Promise<SyncResult> {
    const result: SyncResult = {
      success: true,
      itemsProcessed: 0,
      itemsCreated: 0,
      itemsUpdated: 0,
      itemsSkipped: 0,
      itemsDeleted: 0,
      conflicts: [],
      errors: [],
    };

    try {
      // Build filter for fetching external items
      const filter: ItemFilter = {};
      if (config.notionProjectId && config.projectColumn) {
        filter.projectId = config.notionProjectId;
        filter.projectColumn = config.projectColumn;
      }

      // Fetch items from external service
      const externalItems = await this.service.getItems(config.databaseId, filter);
      result.itemsProcessed = externalItems.length;

      // Process each external item
      for (const item of externalItems) {
        try {
          await this.processIncomingItem(item, config, result);
        } catch (error) {
          result.errors.push({
            externalId: item.id,
            operation: 'update',
            message: error instanceof Error ? error.message : 'Unknown error',
            details: error,
          });
          result.itemsSkipped++;
        }
      }

      // Handle deletions if project context is provided
      if (config.deletionBehavior !== 'ignore' && config.projectId) {
        await this.handlePullDeletions(externalItems, config, result);
      }
    } catch (error) {
      result.success = false;
      result.errors.push({
        operation: 'fetch',
        message: error instanceof Error ? error.message : 'Failed to fetch external items',
        details: error,
      });
    }

    return result;
  }

  /**
   * Push sync: Send local actions to external service
   */
  async push(config: PushConfig): Promise<SyncResult> {
    const result: SyncResult = {
      success: true,
      itemsProcessed: 0,
      itemsCreated: 0,
      itemsUpdated: 0,
      itemsSkipped: 0,
      itemsDeleted: 0,
      conflicts: [],
      errors: [],
    };

    try {
      // Get local actions to sync
      const actions = await this.getActionsToSync(config);
      result.itemsProcessed = actions.length;

      // Handle overwrite mode - archive external items not in local
      if (config.overwriteMode) {
        await this.handleOverwriteDeletions(config, actions, result);
      }

      // Push each action to external service
      for (const action of actions) {
        try {
          await this.pushAction(action, config, result);
        } catch (error) {
          result.errors.push({
            itemId: action.id,
            operation: 'create',
            message: error instanceof Error ? error.message : 'Unknown error',
            details: error,
          });
          result.itemsSkipped++;
        }
      }
    } catch (error) {
      result.success = false;
      result.errors.push({
        operation: 'fetch',
        message: error instanceof Error ? error.message : 'Failed to fetch local actions',
        details: error,
      });
    }

    return result;
  }

  /**
   * Bidirectional sync with conflict resolution
   */
  async bidirectional(config: BiSyncConfig): Promise<SyncResult> {
    const result: SyncResult = {
      success: true,
      itemsProcessed: 0,
      itemsCreated: 0,
      itemsUpdated: 0,
      itemsSkipped: 0,
      itemsDeleted: 0,
      conflicts: [],
      errors: [],
    };

    try {
      // Build filter for fetching external items
      const filter: ItemFilter = {};
      if (config.notionProjectId && config.projectColumn) {
        filter.projectId = config.notionProjectId;
        filter.projectColumn = config.projectColumn;
      }

      // Step 1: Get both local and remote items
      const [externalItems, localActions] = await Promise.all([
        this.service.getItems(config.databaseId, filter),
        this.getActionsWithSync(config),
      ]);

      result.itemsProcessed = externalItems.length + localActions.length;

      // Step 2: Build maps for comparison
      const localByExternalId = new Map<string, ActionWithSyncAndProject>();
      const syncedExternalIds = new Set<string>();

      for (const action of localActions) {
        const sync = action.syncs.find(s => s.provider === this.provider);
        if (sync) {
          localByExternalId.set(sync.externalId, action);
          syncedExternalIds.add(sync.externalId);
        }
      }

      const externalById = new Map(externalItems.map(item => [item.id, item]));

      // Step 3: Process external items (create new or update existing)
      for (const external of externalItems) {
        try {
          const local = localByExternalId.get(external.id);

          if (!local) {
            // New in external → create locally
            await this.createLocalAction(external, config, result);
          } else {
            // Exists in both → compare timestamps
            const localSync = local.syncs.find(s => s.provider === this.provider);
            if (!localSync) continue;

            // Use sync record's updatedAt as proxy for local changes (Action doesn't have updatedAt)
            const localUpdated = localSync.updatedAt;
            const externalUpdated = external.lastEditedTime;

            // Use sync record's updatedAt as last sync time
            const lastSyncTime = localSync.updatedAt ?? new Date(0);

            const localChangedSinceSync = localUpdated > lastSyncTime;
            const externalChangedSinceSync = externalUpdated > lastSyncTime;

            if (localChangedSinceSync && externalChangedSinceSync) {
              // Conflict - both changed since last sync
              const conflict = await this.resolveConflict(
                local,
                external,
                localUpdated,
                externalUpdated,
                config,
                result
              );
              result.conflicts.push(conflict);
            } else if (externalChangedSinceSync && !localChangedSinceSync) {
              // External is newer → update local
              await this.updateLocalAction(local.id, external, config, result);
            } else if (localChangedSinceSync && !externalChangedSinceSync) {
              // Local is newer → push to external
              await this.updateExternal(local, external.id, config, result);
            }
            // Same time or no changes = no action needed
          }
        } catch (error) {
          result.errors.push({
            externalId: external.id,
            operation: 'update',
            message: error instanceof Error ? error.message : 'Unknown error',
            details: error,
          });
        }
      }

      // Step 4: Handle items only in local (not in external)
      for (const local of localActions) {
        const sync = local.syncs.find(s => s.provider === this.provider);

        if (sync && !externalById.has(sync.externalId)) {
          // Was synced before but not in external anymore → deleted externally
          if (config.deletionBehavior === 'mark_deleted') {
            await this.markDeletedLocally(local.id, sync.id, result);
          }
        } else if (!sync) {
          // New local action, not yet synced → push to external
          try {
            await this.pushAction(local, config, result);
          } catch (error) {
            result.errors.push({
              itemId: local.id,
              operation: 'create',
              message: error instanceof Error ? error.message : 'Unknown error',
              details: error,
            });
          }
        }
      }
    } catch (error) {
      result.success = false;
      result.errors.push({
        operation: 'fetch',
        message: error instanceof Error ? error.message : 'Bidirectional sync failed',
        details: error,
      });
    }

    return result;
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  /**
   * Process an incoming item from external service
   */
  private async processIncomingItem(
    item: ExternalItem,
    config: PullConfig,
    result: SyncResult
  ): Promise<void> {
    const parsed = this.service.parseToAction(item, config.propertyMappings);

    // Check for existing sync record
    const existingSync = await this.ctx.db.actionSync.findFirst({
      where: {
        provider: this.provider,
        externalId: item.id,
      },
      include: {
        action: true,
      },
    });

    if (existingSync) {
      if (existingSync.action) {
        // Update existing action if changed
        const needsUpdate = this.actionNeedsUpdate(existingSync.action, parsed);

        if (needsUpdate) {
          await this.ctx.db.action.update({
            where: { id: existingSync.action.id },
            data: {
              name: parsed.name,
              description: parsed.description,
              status: parsed.status,
              priority: parsed.priority,
              dueDate: parsed.dueDate,
            },
          });

          await this.ctx.db.actionSync.update({
            where: { id: existingSync.id },
            data: {
              status: 'synced',
              updatedAt: new Date(),
            },
          });

          result.itemsUpdated++;
        } else {
          result.itemsSkipped++;
        }
      } else {
        // Sync record exists but action was deleted - recreate
        await this.ctx.db.actionSync.delete({
          where: { id: existingSync.id },
        });
        await this.createLocalAction(item, config, result);
      }
    } else {
      // New item - create action
      await this.createLocalAction(item, config, result);
    }
  }

  /**
   * Create a new local action from external item
   */
  private async createLocalAction(
    item: ExternalItem,
    config: PullConfig | BiSyncConfig,
    result: SyncResult
  ): Promise<void> {
    const parsed = this.service.parseToAction(item, config.propertyMappings);

    const newAction = await this.ctx.db.action.create({
      data: {
        name: parsed.name,
        description: parsed.description,
        status: parsed.status,
        priority: parsed.priority ?? 'Quick',
        dueDate: parsed.dueDate,
        createdById: this.ctx.userId,
        projectId: config.projectId,
      },
    });

    await this.ctx.db.actionSync.create({
      data: {
        actionId: newAction.id,
        provider: this.provider,
        externalId: item.id,
        status: 'synced',
      },
    });

    result.itemsCreated++;
  }

  /**
   * Update a local action from external item
   */
  private async updateLocalAction(
    actionId: string,
    item: ExternalItem,
    config: BiSyncConfig,
    result: SyncResult
  ): Promise<void> {
    const parsed = this.service.parseToAction(item, config.propertyMappings);

    await this.ctx.db.action.update({
      where: { id: actionId },
      data: {
        name: parsed.name,
        description: parsed.description,
        status: parsed.status,
        priority: parsed.priority,
        dueDate: parsed.dueDate,
      },
    });

    // Update sync timestamp
    await this.ctx.db.actionSync.updateMany({
      where: {
        actionId,
        provider: this.provider,
      },
      data: {
        status: 'synced',
        updatedAt: new Date(),
      },
    });

    result.itemsUpdated++;
  }

  /**
   * Update external item from local action
   */
  private async updateExternal(
    action: ActionWithSyncAndProject,
    externalId: string,
    config: BiSyncConfig,
    result: SyncResult
  ): Promise<void> {
    const data = this.service.formatFromAction(
      action,
      config.propertyMappings,
      config.statusMappings,
      config.priorityMappings
    );

    await this.service.updateItem(externalId, data);

    // Update sync timestamp
    await this.ctx.db.actionSync.updateMany({
      where: {
        actionId: action.id,
        provider: this.provider,
      },
      data: {
        status: 'synced',
        updatedAt: new Date(),
      },
    });

    result.itemsUpdated++;
  }

  /**
   * Handle pull deletions - mark local actions as deleted if not in external
   */
  private async handlePullDeletions(
    externalItems: ExternalItem[],
    config: PullConfig,
    result: SyncResult
  ): Promise<void> {
    const localActionSyncs = await this.ctx.db.actionSync.findMany({
      where: {
        provider: this.provider,
        action: {
          createdById: this.ctx.userId,
          projectId: config.projectId,
          status: { not: 'DELETED' },
        },
      },
      include: { action: true },
    });

    const externalIds = new Set(externalItems.map(item => item.id));

    for (const syncRecord of localActionSyncs) {
      if (!externalIds.has(syncRecord.externalId)) {
        await this.markDeletedLocally(syncRecord.actionId, syncRecord.id, result);
      }
    }
  }

  /**
   * Mark a local action as deleted
   */
  private async markDeletedLocally(
    actionId: string,
    syncId: string,
    result: SyncResult
  ): Promise<void> {
    await this.ctx.db.action.update({
      where: { id: actionId },
      data: { status: 'DELETED' },
    });

    await this.ctx.db.actionSync.update({
      where: { id: syncId },
      data: { status: 'deleted_remotely' },
    });

    result.itemsDeleted++;
  }

  /**
   * Get actions to sync for push operation
   */
  private async getActionsToSync(config: PushConfig): Promise<ActionWithSyncAndProject[]> {
    const where: any = {
      createdById: this.ctx.userId,
      status: { not: 'COMPLETED' },
    };

    // Filter by specific action IDs if provided
    if (config.actionIds && config.actionIds.length > 0) {
      where.id = { in: config.actionIds };
    } else {
      // Filter by source if specified
      if (config.source === 'notion') {
        // Only actions originally from Notion
        where.actionSyncs = {
          some: { provider: 'notion' },
        };
      } else if (config.source === 'internal') {
        // Only internal actions (not from any sync)
        where.actionSyncs = {
          none: {},
        };
      }

      // Filter by project if configured
      if (config.projectId) {
        where.projectId = config.projectId;
      }
    }

    return this.ctx.db.action.findMany({
      where,
      include: {
        syncs: true,
        project: {
          select: {
            id: true,
            name: true,
            notionProjectId: true,
          },
        },
      },
      orderBy: { dueDate: 'asc' },
    });
  }

  /**
   * Get actions with sync records for bidirectional sync
   */
  private async getActionsWithSync(config: BiSyncConfig): Promise<ActionWithSyncAndProject[]> {
    const where: any = {
      createdById: this.ctx.userId,
      status: { not: 'DELETED' },
    };

    if (config.projectId) {
      where.projectId = config.projectId;
    }

    return this.ctx.db.action.findMany({
      where,
      include: {
        syncs: {
          where: { provider: this.provider },
        },
        project: {
          select: {
            id: true,
            name: true,
            notionProjectId: true,
          },
        },
      },
    });
  }

  /**
   * Push a single action to external service
   */
  private async pushAction(
    action: ActionWithSyncAndProject,
    config: PushConfig | BiSyncConfig,
    result: SyncResult
  ): Promise<void> {
    // Check for existing sync
    const existingSync = await this.ctx.db.actionSync.findFirst({
      where: {
        actionId: action.id,
        provider: this.provider,
      },
    });

    if (existingSync) {
      if (existingSync.status === 'deleted_remotely') {
        result.itemsSkipped++;
        return;
      }

      if (existingSync.status === 'synced' && !config.overwriteMode) {
        result.itemsSkipped++;
        return;
      }

      // Update existing external item
      const data = this.service.formatFromAction(
        action,
        config.propertyMappings,
        config.statusMappings,
        config.priorityMappings
      );

      await this.service.updateItem(existingSync.externalId, data);

      await this.ctx.db.actionSync.update({
        where: { id: existingSync.id },
        data: {
          status: 'synced',
          updatedAt: new Date(),
        },
      });

      result.itemsUpdated++;
    } else {
      // Create new external item
      const data = this.service.formatFromAction(
        action,
        config.propertyMappings,
        config.statusMappings,
        config.priorityMappings
      );

      // Add project relation if available
      if (action.project?.notionProjectId) {
        data.projectId = action.project.notionProjectId;
      }

      const createdItem = await this.service.createItem(config.databaseId, data, {
        titleProperty: config.propertyMappings.title,
        projectColumn: config.projectColumn,
      });

      await this.ctx.db.actionSync.create({
        data: {
          actionId: action.id,
          provider: this.provider,
          externalId: createdItem.id,
          status: 'synced',
        },
      });

      result.itemsCreated++;
    }
  }

  /**
   * Handle overwrite mode deletions - archive external items not in local
   */
  private async handleOverwriteDeletions(
    config: PushConfig,
    localActions: ActionWithSyncAndProject[],
    result: SyncResult
  ): Promise<void> {
    // Build filter for fetching external items
    const filter: ItemFilter = {};
    if (config.notionProjectId && config.projectColumn) {
      filter.projectId = config.notionProjectId;
      filter.projectColumn = config.projectColumn;
    }

    const externalItems = await this.service.getItems(config.databaseId, filter);

    // Get set of external IDs that have corresponding local actions
    const localExternalIds = new Set<string>();
    for (const action of localActions) {
      const sync = action.syncs.find(s => s.provider === this.provider);
      if (sync) {
        localExternalIds.add(sync.externalId);
      }
    }

    // Archive external items not in local
    for (const item of externalItems) {
      if (!localExternalIds.has(item.id)) {
        try {
          await this.service.archiveItem(item.id);
          result.itemsDeleted++;
        } catch (error) {
          result.errors.push({
            externalId: item.id,
            operation: 'delete',
            message: error instanceof Error ? error.message : 'Failed to archive',
            details: error,
          });
        }
      }
    }
  }

  /**
   * Resolve conflict between local and external versions
   */
  private async resolveConflict(
    local: ActionWithSyncAndProject,
    external: ExternalItem,
    localUpdated: Date,
    externalUpdated: Date,
    config: BiSyncConfig,
    result: SyncResult
  ): Promise<ConflictRecord> {
    const conflict: ConflictRecord = {
      localActionId: local.id,
      externalId: external.id,
      localUpdatedAt: localUpdated,
      externalUpdatedAt: externalUpdated,
      resolution: 'pending',
    };

    switch (config.conflictResolution) {
      case 'local_wins':
        await this.updateExternal(local, external.id, config, result);
        conflict.resolution = 'local_wins';
        break;

      case 'remote_wins':
        await this.updateLocalAction(local.id, external, config, result);
        conflict.resolution = 'remote_wins';
        break;

      case 'manual':
      default:
        // Leave as pending for manual resolution
        conflict.resolution = 'pending';
        break;
    }

    return conflict;
  }

  /**
   * Check if local action needs update from parsed external data
   */
  private actionNeedsUpdate(
    action: { name: string; status: string; description?: string | null; priority?: string | null; dueDate?: Date | null },
    parsed: { name: string; status: string; description?: string; priority?: string; dueDate?: Date }
  ): boolean {
    return (
      action.name !== parsed.name ||
      action.status !== parsed.status ||
      action.description !== parsed.description ||
      action.priority !== parsed.priority ||
      action.dueDate?.getTime() !== parsed.dueDate?.getTime()
    );
  }
}
