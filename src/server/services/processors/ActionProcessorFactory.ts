import { type ActionProcessor, type ActionProcessorConfig } from './ActionProcessor';
import { InternalActionProcessor } from './InternalActionProcessor';
import { SlackActionProcessor } from './SlackActionProcessor';
import { MondayActionProcessor, type MondayProcessorConfig } from './MondayActionProcessor';
import { db } from '~/server/db';

export type ActionProcessorType = 'internal' | 'notion' | 'asana' | 'slack' | 'monday';

export interface ProcessorPreferences {
  processors: ActionProcessorType[];
  defaultPriority?: string;
  autoProcess?: boolean;
}

export class ActionProcessorFactory {
  /**
   * Create processors based on user configuration
   */
  static async createProcessors(
    userId: string, 
    projectId?: string,
    transcriptionId?: string
  ): Promise<ActionProcessor[]> {
    const processors: ActionProcessor[] = [];
    
    // Get user's processor preferences from integrations
    const userIntegrations = await db.integration.findMany({
      where: {
        userId,
        status: 'ACTIVE',
        provider: {
          in: ['internal', 'notion', 'asana', 'slack', 'monday']
        }
      },
      include: {
        credentials: true
      }
    });

    // Always include internal processor as fallback
    const internalConfig: ActionProcessorConfig = {
      userId,
      projectId,
      transcriptionId,
    };
    processors.push(new InternalActionProcessor(internalConfig));

    // Add external processors based on integrations
    for (const integration of userIntegrations) {
      const config: ActionProcessorConfig = {
        userId,
        projectId,
        integrationId: integration.id,
        transcriptionId,
        additionalConfig: {
          name: integration.name,
          description: integration.description,
          credentials: integration.credentials
        }
      };

      switch (integration.provider) {
        case 'notion':
          // TODO: Implement NotionActionProcessor
          // processors.push(new NotionActionProcessor(config));
          break;
        case 'asana':
          // TODO: Implement AsanaActionProcessor  
          // processors.push(new AsanaActionProcessor(config));
          break;
        case 'slack':
          processors.push(new SlackActionProcessor(config));
          break;
        case 'monday':
          // For Monday.com, we need basic board configuration
          // This would typically come from workflow configuration
          const mondayConfig: MondayProcessorConfig = {
            boardId: config.additionalConfig?.boardId || 'default-board-id',
            columnMappings: config.additionalConfig?.columnMappings || {},
          };
          processors.push(new MondayActionProcessor(config, mondayConfig));
          break;
      }
    }

    return processors;
  }

  /**
   * Create a specific processor by type
   */
  static async createProcessor(
    type: ActionProcessorType,
    userId: string,
    projectId?: string,
    integrationId?: string,
    transcriptionId?: string
  ): Promise<ActionProcessor | null> {
    const config: ActionProcessorConfig = {
      userId,
      projectId,
      integrationId,
      transcriptionId,
    };

    switch (type) {
      case 'internal':
        return new InternalActionProcessor(config);
      case 'slack':
        return new SlackActionProcessor(config);
      case 'notion':
        // TODO: return new NotionActionProcessor(config);
        return null;
      case 'asana':
        // TODO: return new AsanaActionProcessor(config);
        return null;
      case 'monday':
        // For Monday.com, we need board configuration
        const mondayConfig: MondayProcessorConfig = {
          boardId: config.additionalConfig?.boardId || 'default-board-id',
          columnMappings: config.additionalConfig?.columnMappings || {},
        };
        return new MondayActionProcessor(config, mondayConfig);
      default:
        return null;
    }
  }

  /**
   * Get available processor types for a user
   */
  static async getAvailableProcessors(userId: string): Promise<{
    type: ActionProcessorType;
    name: string;
    available: boolean;
    requiresIntegration: boolean;
  }[]> {
    const integrations = await db.integration.findMany({
      where: {
        userId,
        status: 'ACTIVE',
        provider: {
          in: ['notion', 'asana', 'slack', 'monday']
        }
      }
    });

    const availableIntegrations = integrations.map(i => i.provider);

    return [
      {
        type: 'internal',
        name: 'Internal Actions',
        available: true,
        requiresIntegration: false,
      },
      {
        type: 'notion',
        name: 'Notion',
        available: availableIntegrations.includes('notion'),
        requiresIntegration: true,
      },
      {
        type: 'asana',
        name: 'Asana',
        available: availableIntegrations.includes('asana'),
        requiresIntegration: true,
      },
      {
        type: 'slack',
        name: 'Slack Notifications',
        available: availableIntegrations.includes('slack'),
        requiresIntegration: true,
      },
      {
        type: 'monday',
        name: 'Monday.com',
        available: availableIntegrations.includes('monday'),
        requiresIntegration: true,
      },
    ];
  }
}