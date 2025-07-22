import { ActionProcessor, ActionProcessorConfig } from './ActionProcessor';
import { InternalActionProcessor } from './InternalActionProcessor';
import { db } from '~/server/db';

export type ActionProcessorType = 'internal' | 'notion' | 'asana' | 'slack';

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
    projectId?: string
  ): Promise<ActionProcessor[]> {
    const processors: ActionProcessor[] = [];
    
    // Get user's processor preferences from integrations
    const userIntegrations = await db.integration.findMany({
      where: {
        userId,
        status: 'ACTIVE',
        provider: {
          in: ['internal', 'notion', 'asana', 'slack']
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
    };
    processors.push(new InternalActionProcessor(internalConfig));

    // Add external processors based on integrations
    for (const integration of userIntegrations) {
      const config: ActionProcessorConfig = {
        userId,
        projectId,
        integrationId: integration.id,
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
          // TODO: Implement SlackActionProcessor (for notifications, not actions)
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
    integrationId?: string
  ): Promise<ActionProcessor | null> {
    const config: ActionProcessorConfig = {
      userId,
      projectId,
      integrationId,
    };

    switch (type) {
      case 'internal':
        return new InternalActionProcessor(config);
      case 'notion':
        // TODO: return new NotionActionProcessor(config);
        return null;
      case 'asana':
        // TODO: return new AsanaActionProcessor(config);
        return null;
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
          in: ['notion', 'asana']
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
    ];
  }
}