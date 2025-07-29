import { ActionProcessor, type ParsedActionItem, type ActionProcessorResult, type ActionProcessorConfig } from './ActionProcessor';
import { MondayService, type CreateItemParams } from '../MondayService';
import { db } from '~/server/db';

export interface MondayProcessorConfig {
  boardId: string;
  columnMappings?: {
    assignee?: string;    // Person column ID
    dueDate?: string;     // Date column ID  
    priority?: string;    // Status/Priority column ID
    description?: string; // Long text column ID
  };
}

export class MondayActionProcessor extends ActionProcessor {
  name = 'Monday.com Action Processor';
  type = 'external' as const;
  
  private mondayService: MondayService | null = null;
  private mondayConfig: MondayProcessorConfig;

  constructor(config: ActionProcessorConfig, mondayConfig: MondayProcessorConfig) {
    super(config);
    this.mondayConfig = mondayConfig;
  }

  async validateConfig(): Promise<{ valid: boolean; errors: string[] }> {
    try {
      // Validate that boardId is provided
      if (!this.mondayConfig.boardId) {
        return { valid: false, errors: ['Board ID is required for Monday.com integration'] };
      }

      // Get the integration and its API key
      const integration = await db.integration.findUnique({
        where: { id: this.config.integrationId },
        include: {
          credentials: {
            where: { keyType: 'API_KEY' },
            take: 1,
          },
        },
      });

      if (!integration || integration.credentials.length === 0) {
        return { valid: false, errors: ['Monday.com integration or API key not found'] };
      }

      // Initialize Monday service
      this.mondayService = new MondayService(integration.credentials[0]!.key);

      // Test connection
      const connectionTest = await this.mondayService.testConnection();
      if (!connectionTest.success) {
        return { valid: false, errors: [`Monday.com connection failed: ${connectionTest.error}`] };
      }

      // Validate that the board exists and we can access it
      const boards = await this.mondayService.getBoards();
      const board = boards.find(b => b.id === this.mondayConfig.boardId);
      
      if (!board) {
        return { valid: false, errors: [`Board with ID ${this.mondayConfig.boardId} not found or not accessible`] };
      }

      return { valid: true, errors: [] };
    } catch (error) {
      return { 
        valid: false, 
        errors: [`Monday.com configuration validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`]
      };
    }
  }

  async getStatus(): Promise<{ available: boolean; message?: string }> {
    try {
      if (!this.mondayService) {
        return { available: false, message: 'Monday.com service not initialized' };
      }

      const result = await this.mondayService.testConnection();
      return {
        available: result.success,
        message: result.success ? 'Connected to Monday.com' : `Connection failed: ${result.error}`,
      };
    } catch (error) {
      return {
        available: false,
        message: `Status check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  async processActionItems(items: ParsedActionItem[]): Promise<ActionProcessorResult> {
    const result: ActionProcessorResult = {
      success: true,
      processedCount: 0,
      errors: [],
      createdItems: [],
    };

    if (!this.mondayService) {
      result.success = false;
      result.errors.push('Monday.com service not initialized');
      return result;
    }

    // Get board columns for mapping
    let boardColumns;
    try {
      boardColumns = await this.mondayService.getBoardColumns(this.mondayConfig.boardId);
    } catch (error) {
      result.success = false;
      result.errors.push(`Failed to fetch board columns: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return result;
    }

    for (const item of items) {
      try {
        result.processedCount++;

        // Prepare column values based on configuration
        const columnValues: Record<string, any> = {};

        // Map assignee if configured and available
        if (this.mondayConfig.columnMappings?.assignee && item.assignee) {
          // For person columns, we'd need to resolve the assignee name to a Monday.com user ID
          // This is a simplified implementation - in practice, you'd want to maintain a mapping
          // or search Monday.com users by email/name
          const assigneeColumn = boardColumns.find(c => c.id === this.mondayConfig.columnMappings!.assignee);
          if (assigneeColumn && assigneeColumn.type === 'person') {
            // TODO: Implement user lookup - for now, we'll skip this
            // columnValues[this.mondayConfig.columnMappings.assignee] = MondayService.formatColumnValue('person', [userId]);
          }
        }

        // Map due date if configured and available
        if (this.mondayConfig.columnMappings?.dueDate && item.dueDate) {
          const dueDateColumn = boardColumns.find(c => c.id === this.mondayConfig.columnMappings!.dueDate);
          if (dueDateColumn && dueDateColumn.type === 'date') {
            columnValues[this.mondayConfig.columnMappings.dueDate] = MondayService.formatColumnValue('date', item.dueDate);
          }
        }

        // Map priority if configured and available
        if (this.mondayConfig.columnMappings?.priority && item.priority) {
          const priorityColumn = boardColumns.find(c => c.id === this.mondayConfig.columnMappings!.priority);
          if (priorityColumn && (priorityColumn.type === 'status' || priorityColumn.type === 'priority')) {
            // Map internal priorities to Monday.com status labels
            const priorityMapping: Record<string, string> = {
              'urgent': 'High',
              'high': 'High', 
              'medium': 'Medium',
              'low': 'Low',
            };
            const mondayPriority = priorityMapping[item.priority.toLowerCase()] || item.priority;
            columnValues[this.mondayConfig.columnMappings.priority] = MondayService.formatColumnValue('status', mondayPriority);
          }
        }

        // Map description/context if configured and available
        if (this.mondayConfig.columnMappings?.description && item.context) {
          const descriptionColumn = boardColumns.find(c => c.id === this.mondayConfig.columnMappings!.description);
          if (descriptionColumn && descriptionColumn.type === 'long-text') {
            columnValues[this.mondayConfig.columnMappings.description] = MondayService.formatColumnValue('long-text', item.context);
          }
        }

        // Create the item on Monday.com
        const createParams: CreateItemParams = {
          boardId: this.mondayConfig.boardId,
          itemName: this.cleanActionText(item.text),
          columnValues,
        };

        const createdItem = await this.mondayService.createItem(createParams);
        
        result.createdItems.push({
          id: createdItem.id,
          externalId: createdItem.id,
          title: createdItem.name,
          url: `https://your-workspace.monday.com/boards/${this.mondayConfig.boardId}/pulses/${createdItem.id}`,
        });

      } catch (error) {
        result.errors.push(`Failed to create Monday.com item for "${item.text}": ${error instanceof Error ? error.message : 'Unknown error'}`);
        // Continue processing other items
      }
    }

    // If we had some successes but also some errors, still consider it a partial success
    if (result.createdItems.length > 0 && result.errors.length > 0) {
      result.success = true; // Partial success
    } else if (result.createdItems.length === 0 && items.length > 0) {
      result.success = false; // Complete failure
    }

    return result;
  }

  private cleanActionText(text: string): string {
    // Remove common prefixes that might come from action item parsing
    const prefixes = [
      /^action item:?\s*/i,
      /^todo:?\s*/i,
      /^task:?\s*/i,
      /^action:?\s*/i,
      /^item:?\s*/i,
      /^-\s*/,
      /^\*\s*/,
      /^\d+\.\s*/,
    ];

    let cleanText = text.trim();
    
    for (const prefix of prefixes) {
      cleanText = cleanText.replace(prefix, '');
    }

    return cleanText.trim() || text; // Fallback to original if cleaning resulted in empty string
  }
}