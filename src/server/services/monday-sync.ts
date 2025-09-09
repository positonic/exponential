import { db } from '~/server/db';
import { MondayService } from './MondayService';
import type { Workflow, Action } from '@prisma/client';

interface MondayTodo {
  id: string;
  name: string;
  status: string;
  priority?: string;
  assignee?: string;
  dueDate?: string;
  boardId: string;
  boardName: string;
  url: string;
  columnValues: Record<string, any>;
  created_at: string;
  updated_at: string;
}

interface MondayItemsConfig {
  boardIds: string[];
  columnMappings: {
    statusColumn: string;
    priorityColumn: string;
    assigneeColumn: string;
    dueDateColumn: string;
  };
  statusMapping: Record<string, string>;
  filterGroups: string[];
  syncDirection: 'pull' | 'push' | 'bidirectional';
  autoSync: boolean;
  syncFrequency: 'hourly' | 'daily';
}

interface SyncResult {
  itemsProcessed: number;
  itemsCreated: number;
  itemsUpdated: number;
  itemsSkipped: number;
  errors: string[];
}

export class MondaySyncService {
  /**
   * Get items from Monday boards
   */
  async getMondayItems(integrationId: string, config: MondayItemsConfig): Promise<MondayTodo[]> {
    const integration = await db.integration.findUnique({
      where: { id: integrationId },
      include: { credentials: true },
    });

    if (!integration) {
      throw new Error('Integration not found');
    }

    const apiKeyCredential = integration.credentials.find(c => c.keyType === 'api_key');
    if (!apiKeyCredential) {
      throw new Error('Monday.com API key not found');
    }

    const mondayService = new MondayService(apiKeyCredential.key);
    const todos: MondayTodo[] = [];

    // Get items from all configured boards
    for (const boardId of config.boardIds) {
      try {
        const boardItems = await this.getBoardItems(mondayService, boardId);
        const boardInfo = await this.getBoardInfo(mondayService, boardId);
        
        // Convert items to todos
        for (const item of boardItems) {
          const todo = this.convertItemToTodo(item, boardInfo, config);
          if (todo) {
            todos.push(todo);
          }
        }
      } catch (error) {
        console.error(`Failed to fetch items from board ${boardId}:`, error);
      }
    }

    return todos;
  }

  /**
   * Sync Monday items to Actions
   */
  async syncMondayItemsToActions(workflow: Workflow): Promise<SyncResult> {
    const config = workflow.config as unknown as MondayItemsConfig;
    const result: SyncResult = {
      itemsProcessed: 0,
      itemsCreated: 0,
      itemsUpdated: 0,
      itemsSkipped: 0,
      errors: [],
    };

    try {
      // Get Monday items
      const mondayTodos = await this.getMondayItems(workflow.integrationId, config);
      result.itemsProcessed = mondayTodos.length;

      // Sync each todo
      for (const todo of mondayTodos) {
        try {
          const existingSync = await db.actionSync.findFirst({
            where: {
              provider: 'monday',
              externalId: `${todo.boardName}#${todo.id}`,
            },
            include: { action: true },
          });

          if (existingSync) {
            // Update existing action
            const updatedAction = await this.updateActionFromMondayTodo(existingSync.action, todo, config);
            if (updatedAction) {
              result.itemsUpdated++;
              
              // Update sync record
              await db.actionSync.update({
                where: { id: existingSync.id },
                data: {
                  status: 'synced',
                },
              });
            } else {
              result.itemsSkipped++;
            }
          } else {
            // Create new action
            const newAction = await this.createActionFromMondayTodo(todo, workflow.projectId!, workflow.userId, config);
            if (newAction) {
              result.itemsCreated++;

              // Create sync record
              await db.actionSync.create({
                data: {
                  actionId: newAction.id,
                  provider: 'monday',
                  externalId: `${todo.boardName}#${todo.id}`,
                  status: 'synced',
                },
              });
            } else {
              result.itemsSkipped++;
            }
          }
        } catch (error) {
          console.error(`Failed to sync todo ${todo.id}:`, error);
          result.errors.push(`Failed to sync "${todo.name}": ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      return result;
    } catch (error) {
      console.error('Monday sync failed:', error);
      result.errors.push(`Sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return result;
    }
  }

  /**
   * Convert Monday item to Action
   */
  private async createActionFromMondayTodo(
    todo: MondayTodo, 
    projectId: string, 
    userId: string, 
    config: MondayItemsConfig
  ): Promise<Action | null> {
    try {
      // Map status from Monday to Action status
      const actionStatus = this.mapMondayStatusToActionStatus(todo.status, config.statusMapping);
      
      // Map priority
      const actionPriority = this.mapMondayPriorityToActionPriority(todo.priority);

      // Parse due date
      const dueDate = todo.dueDate ? new Date(todo.dueDate) : null;

      // Create action description with Monday context (following GitHub pattern)
      const description = [
        `Synced from Monday.com: ${todo.boardName}`,
        "",
        `**Monday Item**: [${todo.name}](${todo.url})`,
        `**Board**: ${todo.boardName}`,
        `**Status**: ${todo.status}`,
        todo.priority ? `**Priority**: ${todo.priority}` : null,
        todo.assignee ? `**Assignee**: ${todo.assignee}` : null,
        todo.dueDate ? `**Due Date**: ${todo.dueDate}` : null,
      ]
        .filter(Boolean)
        .join('\n');

      const action = await db.action.create({
        data: {
          name: `[${todo.boardName}] ${todo.name || 'Untitled'}`,
          description,
          status: actionStatus,
          priority: actionPriority,
          dueDate,
          projectId,
          createdById: userId,
          // assignedToId: assigneeId, // Would implement assignee mapping if needed
        },
      });

      return action;
    } catch (error) {
      console.error('Failed to create action from Monday todo:', error);
      return null;
    }
  }

  /**
   * Update existing Action from Monday todo changes
   */
  private async updateActionFromMondayTodo(
    action: Action, 
    todo: MondayTodo, 
    config: MondayItemsConfig
  ): Promise<Action | null> {
    try {
      const actionStatus = this.mapMondayStatusToActionStatus(todo.status, config.statusMapping);
      const actionPriority = this.mapMondayPriorityToActionPriority(todo.priority);
      const dueDate = todo.dueDate ? new Date(todo.dueDate) : null;

      // Only update if there are changes
      const needsUpdate = (
        action.name !== todo.name ||
        action.status !== actionStatus ||
        action.priority !== actionPriority ||
        (action.dueDate?.getTime() !== dueDate?.getTime())
      );

      if (!needsUpdate) {
        return null; // No changes needed
      }

      // Update action description with Monday context (following GitHub pattern)
      const description = [
        `Synced from Monday.com: ${todo.boardName}`,
        "",
        `**Monday Item**: [${todo.name}](${todo.url})`,
        `**Board**: ${todo.boardName}`,
        `**Status**: ${todo.status}`,
        todo.priority ? `**Priority**: ${todo.priority}` : null,
        todo.assignee ? `**Assignee**: ${todo.assignee}` : null,
        todo.dueDate ? `**Due Date**: ${todo.dueDate}` : null,
      ]
        .filter(Boolean)
        .join('\n');

      const updatedAction = await db.action.update({
        where: { id: action.id },
        data: {
          name: `[${todo.boardName}] ${todo.name || action.name}`,
          status: actionStatus,
          priority: actionPriority,
          dueDate,
          description,
        },
      });

      return updatedAction;
    } catch (error) {
      console.error('Failed to update action from Monday todo:', error);
      return null;
    }
  }

  /**
   * Get items from a specific Monday board
   */
  private async getBoardItems(mondayService: MondayService, boardId: string) {
    const query = `
      query ($boardId: ID!) {
        boards(ids: [$boardId]) {
          items {
            id
            name
            created_at
            updated_at
            column_values {
              id
              text
              value
              type
            }
          }
        }
      }
    `;

    const data = await (mondayService as any).makeRequest(query, { boardId });
    return data.boards?.[0]?.items || [];
  }

  /**
   * Get board information
   */
  private async getBoardInfo(mondayService: MondayService, boardId: string) {
    const query = `
      query ($boardId: ID!) {
        boards(ids: [$boardId]) {
          id
          name
          columns {
            id
            title
            type
          }
        }
      }
    `;

    const data = await (mondayService as any).makeRequest(query, { boardId });
    return data.boards?.[0];
  }

  /**
   * Convert Monday item to todo structure
   */
  private convertItemToTodo(item: any, board: any, config: MondayItemsConfig): MondayTodo | null {
    try {
      const columnValues: Record<string, any> = {};
      
      // Map column values by ID and type
      for (const columnValue of item.column_values) {
        columnValues[columnValue.id] = {
          text: columnValue.text,
          value: columnValue.value,
          type: columnValue.type,
        };
      }

      // Extract status from configured status column
      const statusColumn = columnValues[config.columnMappings.statusColumn];
      const status = statusColumn?.text || 'pending';

      // Extract priority from configured priority column
      const priorityColumn = columnValues[config.columnMappings.priorityColumn];
      const priority = priorityColumn?.text;

      // Extract due date from configured date column
      const dueDateColumn = columnValues[config.columnMappings.dueDateColumn];
      let dueDate: string | undefined;
      if (dueDateColumn?.value) {
        try {
          const dateValue = JSON.parse(dueDateColumn.value);
          dueDate = dateValue.date;
        } catch {
          // If parsing fails, try using text directly
          dueDate = dueDateColumn.text;
        }
      }

      // Extract assignee from configured assignee column
      const assigneeColumn = columnValues[config.columnMappings.assigneeColumn];
      let assignee: string | undefined;
      if (assigneeColumn?.value) {
        try {
          const assigneeValue = JSON.parse(assigneeColumn.value);
          if (assigneeValue.personsAndTeams?.length > 0) {
            assignee = assigneeValue.personsAndTeams[0].name;
          }
        } catch {
          assignee = assigneeColumn.text;
        }
      }

      return {
        id: item.id,
        name: item.name || 'Untitled',
        status,
        priority,
        assignee,
        dueDate,
        boardId: board.id,
        boardName: board.name,
        url: `https://${process.env.MONDAY_ACCOUNT_SLUG || 'your-account'}.monday.com/boards/${board.id}/pulses/${item.id}`,
        columnValues,
        created_at: item.created_at,
        updated_at: item.updated_at,
      };
    } catch (error) {
      console.error('Failed to convert item to todo:', error);
      return null;
    }
  }

  /**
   * Map Monday columns to Action fields
   */
  private mapMondayColumnsToActionFields(item: any): Record<string, any> {
    const fields: Record<string, any> = {};
    
    // This would implement intelligent mapping based on column types and names
    // For now, we'll handle it in the convertItemToTodo method
    
    return fields;
  }

  /**
   * Status and priority mapping methods
   */
  private mapMondayStatusToActionStatus(mondayStatus: string, mapping: Record<string, string>): string {
    // Use custom mapping if provided
    if (mapping[mondayStatus]) {
      return mapping[mondayStatus];
    }

    // Default mapping
    const lowerStatus = mondayStatus.toLowerCase();
    if (['done', 'complete', 'completed', 'finished'].includes(lowerStatus)) {
      return 'COMPLETED';
    }
    if (['working on it', 'in progress', 'doing', 'active'].includes(lowerStatus)) {
      return 'IN_PROGRESS';
    }
    if (['stuck', 'blocked', 'waiting for review'].includes(lowerStatus)) {
      return 'BLOCKED';
    }
    
    return 'ACTIVE'; // Default to active
  }

  private mapMondayPriorityToActionPriority(mondayPriority: string | undefined): string {
    if (!mondayPriority) return 'Quick';

    // Default mapping for common Monday priority values
    const lowerPriority = mondayPriority.toLowerCase();
    if (['critical', 'urgent', 'high'].includes(lowerPriority)) {
      return 'Immediate';
    }
    if (['medium', 'normal'].includes(lowerPriority)) {
      return 'Soon';
    }
    if (['low', 'minor'].includes(lowerPriority)) {
      return 'Later';
    }
    
    return 'Quick'; // Default
  }
}

export const mondaySyncService = new MondaySyncService();