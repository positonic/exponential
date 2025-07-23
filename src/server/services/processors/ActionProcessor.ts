export interface ParsedActionItem {
  text: string;
  assignee?: string;
  dueDate?: Date;
  priority?: string;
  context?: string;
}

export interface ActionProcessorResult {
  success: boolean;
  processedCount: number;
  errors: string[];
  createdItems: Array<{
    id: string;
    externalId?: string;
    title: string;
    url?: string;
  }>;
}

export interface ActionProcessorConfig {
  userId: string;
  projectId?: string;
  integrationId?: string;
  transcriptionId?: string;
  additionalConfig?: Record<string, any>;
}

export abstract class ActionProcessor {
  abstract name: string;
  abstract type: 'internal' | 'external';

  constructor(protected config: ActionProcessorConfig) {}

  /**
   * Process an array of action items
   */
  abstract processActionItems(actionItems: ParsedActionItem[]): Promise<ActionProcessorResult>;

  /**
   * Validate the processor configuration
   */
  abstract validateConfig(): Promise<{ valid: boolean; errors: string[] }>;

  /**
   * Get the current status/health of the processor
   */
  abstract getStatus(): Promise<{ available: boolean; message?: string }>;

  /**
   * Test the connection to external service (for external processors)
   */
  async testConnection(): Promise<{ connected: boolean; error?: string }> {
    if (this.type === 'internal') {
      return { connected: true };
    }
    
    const status = await this.getStatus();
    return {
      connected: status.available,
      error: status.message
    };
  }
}