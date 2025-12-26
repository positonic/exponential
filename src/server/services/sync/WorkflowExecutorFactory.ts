/**
 * WorkflowExecutorFactory
 *
 * Creates SyncEngine instances configured for specific workflows.
 * Handles provider-specific service instantiation.
 */

import type { PrismaClient } from '@prisma/client';
import { SyncEngine } from './SyncEngine';
import { NotionIntegrationAdapter } from './NotionIntegrationAdapter';
import type {
  IIntegrationService,
  WorkflowWithCredentials,
  WorkflowConfig,
  SyncConfig,
  PullConfig,
  PushConfig,
  BiSyncConfig,
} from './types';

interface FactoryContext {
  userId: string;
  db: PrismaClient;
}

export class WorkflowExecutorFactory {
  /**
   * Create a SyncEngine instance for the given workflow
   */
  static create(
    workflow: WorkflowWithCredentials,
    ctx: FactoryContext
  ): SyncEngine {
    const service = this.getService(workflow);
    return new SyncEngine(ctx, service, workflow.provider);
  }

  /**
   * Build sync configuration from workflow and input params
   */
  static buildSyncConfig(
    workflow: WorkflowWithCredentials,
    input: {
      projectId?: string;
      notionProjectId?: string;
      actionIds?: string[];
      overwriteMode?: boolean;
      deletionBehavior?: 'mark_deleted' | 'archive' | 'ignore';
    },
    userId: string
  ): SyncConfig {
    const config = this.parseWorkflowConfig(workflow.config);

    return {
      workflowId: workflow.id,
      userId,
      databaseId: config.databaseId ?? '',
      projectId: input.projectId,
      notionProjectId: input.notionProjectId ?? config.notionProjectId,
      projectColumn: config.projectColumn,
      actionIds: input.actionIds,
      propertyMappings: config.propertyMappings ?? {},
      statusMappings: config.statusMappings,
      priorityMappings: config.priorityMappings,
      conflictResolution: 'local_wins', // Default, can be overridden
      deletionBehavior: input.deletionBehavior ?? config.deletionHandling ?? 'mark_deleted',
      overwriteMode: input.overwriteMode ?? config.overwriteMode,
    };
  }

  /**
   * Build pull-specific configuration
   */
  static buildPullConfig(
    workflow: WorkflowWithCredentials,
    input: {
      projectId?: string;
      notionProjectId?: string;
      deletionBehavior?: 'mark_deleted' | 'archive' | 'ignore';
    },
    userId: string
  ): PullConfig {
    const base = this.buildSyncConfig(workflow, input, userId);
    return {
      ...base,
      direction: 'pull',
    };
  }

  /**
   * Build push-specific configuration
   */
  static buildPushConfig(
    workflow: WorkflowWithCredentials,
    input: {
      projectId?: string;
      notionProjectId?: string;
      actionIds?: string[];
      overwriteMode?: boolean;
      source?: 'notion' | 'internal' | 'github' | 'monday';
    },
    userId: string
  ): PushConfig {
    const config = this.parseWorkflowConfig(workflow.config);
    const base = this.buildSyncConfig(workflow, input, userId);

    return {
      ...base,
      direction: 'push',
      source: input.source ?? (config.source as PushConfig['source']),
    };
  }

  /**
   * Build bidirectional sync configuration
   */
  static buildBiSyncConfig(
    workflow: WorkflowWithCredentials,
    input: {
      projectId?: string;
      notionProjectId?: string;
      conflictResolution?: 'local_wins' | 'remote_wins' | 'manual';
      deletionBehavior?: 'mark_deleted' | 'archive' | 'ignore';
    },
    userId: string
  ): BiSyncConfig {
    const base = this.buildSyncConfig(workflow, input, userId);
    return {
      ...base,
      direction: 'bidirectional',
      conflictResolution: input.conflictResolution ?? 'local_wins',
    };
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  /**
   * Get the appropriate integration service for the workflow's provider
   */
  private static getService(workflow: WorkflowWithCredentials): IIntegrationService {
    const accessToken = workflow.integration.credentials.find(
      c => c.keyType === 'ACCESS_TOKEN' || c.keyType === 'API_KEY'
    )?.key;

    if (!accessToken) {
      throw new Error(`No access token found for ${workflow.provider} integration`);
    }

    switch (workflow.provider) {
      case 'notion':
        return new NotionIntegrationAdapter(accessToken);

      // Future providers can be added here:
      // case 'monday':
      //   return new MondayIntegrationAdapter(accessToken);
      // case 'github':
      //   return new GitHubIntegrationAdapter(accessToken);

      default:
        throw new Error(`Unknown provider: ${workflow.provider}`);
    }
  }

  /**
   * Parse workflow config from JSON to typed config
   */
  private static parseWorkflowConfig(config: unknown): WorkflowConfig {
    if (!config || typeof config !== 'object') {
      return {};
    }

    const c = config as Record<string, unknown>;

    return {
      syncDirection: c.syncDirection as WorkflowConfig['syncDirection'],
      syncFrequency: c.syncFrequency as WorkflowConfig['syncFrequency'],
      databaseId: c.databaseId as string | undefined,
      propertyMappings: c.propertyMappings as WorkflowConfig['propertyMappings'],
      statusMappings: c.statusMappings as WorkflowConfig['statusMappings'],
      priorityMappings: c.priorityMappings as WorkflowConfig['priorityMappings'],
      projectColumn: c.projectColumn as string | undefined,
      notionProjectId: c.notionProjectId as string | undefined,
      deletionHandling: c.deletionHandling as WorkflowConfig['deletionHandling'],
      overwriteMode: c.overwriteMode as boolean | undefined,
      useNewSyncEngine: c.useNewSyncEngine as boolean | undefined,
      source: c.source as string | undefined,
    };
  }
}
