import { db } from '~/server/db';
import { notionIntegrationService } from './notion-integration';
import type { Integration, Workflow, Action } from '@prisma/client';

interface NotionTodo {
  id: string;
  title: string;
  status: string;
  priority?: string;
  assignee?: string;
  dueDate?: string;
  url: string;
  databaseId: string;
  databaseName: string;
  properties: Record<string, any>;
  created_time: string;
  last_edited_time: string;
}

interface NotionTodosConfig {
  databaseIds: string[];
  statusFieldMapping: Record<string, string>;
  priorityFieldMapping: Record<string, string>;
  assigneeSync: boolean;
  filterCompleted: boolean;
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

export class NotionSyncService {
  /**
   * Get todo-like pages from configured Notion databases
   */
  async getNotionTodos(integrationId: string, config: NotionTodosConfig): Promise<NotionTodo[]> {
    const integration = await db.integration.findUnique({
      where: { id: integrationId },
      include: { credentials: true },
    });

    if (!integration) {
      throw new Error('Integration not found');
    }

    const todos: NotionTodo[] = [];

    // Get all configured databases and their pages
    for (const databaseId of config.databaseIds) {
      try {
        const databasePages = await this.getDatabasePages(integration as any, databaseId);
        const databaseInfo = await this.getDatabaseInfo(integration as any, databaseId);
        
        // Convert pages to todos
        for (const page of databasePages) {
          const todo = await this.convertPageToTodo(page, databaseInfo, config);
          if (todo && (!config.filterCompleted || todo.status !== 'done')) {
            todos.push(todo);
          }
        }
      } catch (error) {
        console.error(`Failed to fetch pages from database ${databaseId}:`, error);
      }
    }

    return todos;
  }

  /**
   * Sync Notion todos to Actions
   */
  async syncNotionTodosToActions(workflow: Workflow): Promise<SyncResult> {
    const config = workflow.config as unknown as NotionTodosConfig;
    const result: SyncResult = {
      itemsProcessed: 0,
      itemsCreated: 0,
      itemsUpdated: 0,
      itemsSkipped: 0,
      errors: [],
    };

    try {
      // Get Notion todos
      const notionTodos = await this.getNotionTodos(workflow.integrationId, config);
      result.itemsProcessed = notionTodos.length;

      // Sync each todo
      for (const todo of notionTodos) {
        try {
          const existingSync = await db.actionSync.findFirst({
            where: {
              provider: 'notion',
              externalId: todo.id,
            },
            include: { action: true },
          });

          if (existingSync) {
            // Update existing action
            const updatedAction = await this.updateActionFromNotionTodo(existingSync.action, todo, config);
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
            const newAction = await this.createActionFromNotionTodo(todo, workflow.projectId!, workflow.userId, config);
            if (newAction) {
              result.itemsCreated++;

              // Create sync record
              await db.actionSync.create({
                data: {
                  actionId: newAction.id,
                  provider: 'notion',
                  externalId: todo.id,
                  status: 'synced',
                },
              });
            } else {
              result.itemsSkipped++;
            }
          }
        } catch (error) {
          console.error(`Failed to sync todo ${todo.id}:`, error);
          result.errors.push(`Failed to sync "${todo.title}": ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      return result;
    } catch (error) {
      console.error('Notion sync failed:', error);
      result.errors.push(`Sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return result;
    }
  }

  /**
   * Convert Notion page to Action
   */
  private async createActionFromNotionTodo(
    todo: NotionTodo, 
    projectId: string, 
    userId: string, 
    config: NotionTodosConfig
  ): Promise<Action | null> {
    try {
      // Map status from Notion to Action status
      const actionStatus = this.mapNotionStatusToActionStatus(todo.status, config.statusFieldMapping);
      
      // Map priority
      const actionPriority = this.mapNotionPriorityToActionPriority(todo.priority, config.priorityFieldMapping);

      // Parse due date
      const dueDate = todo.dueDate ? new Date(todo.dueDate) : null;

      // Create action description with Notion context (following GitHub pattern)
      const description = [
        `Synced from Notion: ${todo.databaseName}`,
        "",
        `**Notion Page**: [${todo.title}](${todo.url})`,
        `**Database**: ${todo.databaseName}`,
        `**Status**: ${todo.status}`,
        todo.priority ? `**Priority**: ${todo.priority}` : null,
        todo.dueDate ? `**Due Date**: ${todo.dueDate}` : null,
      ]
        .filter(Boolean)
        .join('\n');

      const action = await db.action.create({
        data: {
          name: `[${todo.databaseName}] ${todo.title || 'Untitled'}`,
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
      console.error('Failed to create action from Notion todo:', error);
      return null;
    }
  }

  /**
   * Update existing Action from Notion todo changes
   */
  private async updateActionFromNotionTodo(
    action: Action, 
    todo: NotionTodo, 
    config: NotionTodosConfig
  ): Promise<Action | null> {
    try {
      const actionStatus = this.mapNotionStatusToActionStatus(todo.status, config.statusFieldMapping);
      const actionPriority = this.mapNotionPriorityToActionPriority(todo.priority, config.priorityFieldMapping);
      const dueDate = todo.dueDate ? new Date(todo.dueDate) : null;

      // Only update if there are changes
      const needsUpdate = (
        action.name !== todo.title ||
        action.status !== actionStatus ||
        action.priority !== actionPriority ||
        (action.dueDate?.getTime() !== dueDate?.getTime())
      );

      if (!needsUpdate) {
        return null; // No changes needed
      }

      // Update action description with Notion context (following GitHub pattern)
      const description = [
        `Synced from Notion: ${todo.databaseName}`,
        "",
        `**Notion Page**: [${todo.title}](${todo.url})`,
        `**Database**: ${todo.databaseName}`,
        `**Status**: ${todo.status}`,
        todo.priority ? `**Priority**: ${todo.priority}` : null,
        todo.dueDate ? `**Due Date**: ${todo.dueDate}` : null,
      ]
        .filter(Boolean)
        .join('\n');

      const updatedAction = await db.action.update({
        where: { id: action.id },
        data: {
          name: `[${todo.databaseName}] ${todo.title || action.name}`,
          status: actionStatus,
          priority: actionPriority,
          dueDate,
          description,
        },
      });

      return updatedAction;
    } catch (error) {
      console.error('Failed to update action from Notion todo:', error);
      return null;
    }
  }

  /**
   * Push Action changes back to Notion (for bidirectional sync)
   */
  async updateNotionTodoFromAction(action: Action, notionPageId: string, integrationId: string): Promise<void> {
    try {
      // This would implement pushing changes back to Notion
      // For now, we'll focus on pull sync only
      console.log('Bidirectional sync not yet implemented');
    } catch (error) {
      console.error('Failed to update Notion todo from action:', error);
    }
  }

  /**
   * Get pages from a specific Notion database
   */
  private async getDatabasePages(integration: any, databaseId: string) {
    const accessToken = integration.credentials.find((c: any) => c.keyType === 'access_token')?.key;
    
    if (!accessToken) {
      throw new Error('Notion access token not found');
    }

    const response = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sorts: [
          {
            property: 'last_edited_time',
            direction: 'descending',
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`Notion API error: ${response.status} ${await response.text()}`);
    }

    const data = await response.json();
    return data.results;
  }

  /**
   * Get database information
   */
  private async getDatabaseInfo(integration: any, databaseId: string) {
    const accessToken = integration.credentials.find((c: any) => c.keyType === 'access_token')?.key;
    
    if (!accessToken) {
      throw new Error('Notion access token not found');
    }

    const response = await fetch(`https://api.notion.com/v1/databases/${databaseId}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Notion-Version': '2022-06-28',
      },
    });

    if (!response.ok) {
      throw new Error(`Notion API error: ${response.status} ${await response.text()}`);
    }

    return response.json();
  }

  /**
   * Convert Notion page to todo structure
   */
  private async convertPageToTodo(page: any, database: any, config: NotionTodosConfig): Promise<NotionTodo | null> {
    try {
      const properties = page.properties;
      
      // Extract title (usually from "Name" or "Title" property)
      const titleProperty = properties.Name || properties.Title || Object.values(properties).find((p: any) => p.type === 'title');
      const title = this.extractTextFromProperty(titleProperty);

      // Extract status
      const statusProperty = Object.values(properties).find((p: any) => p.type === 'status' || p.type === 'select');
      const status = statusProperty ? this.extractSelectValue(statusProperty) : 'pending';

      // Extract priority
      const priorityProperty = Object.values(properties).find((p: any) => 
        (p.type === 'select' || p.type === 'multi_select') && 
        ['priority', 'Priority'].includes(Object.keys(properties).find(k => properties[k] === p) || '')
      );
      const priority = priorityProperty ? this.extractSelectValue(priorityProperty) : undefined;

      // Extract due date
      const dueDateProperty = Object.values(properties).find((p: any) => p.type === 'date');
      const dueDate = dueDateProperty ? this.extractDateValue(dueDateProperty) : undefined;

      // Extract assignee
      const assigneeProperty = Object.values(properties).find((p: any) => p.type === 'people');
      const assignee = assigneeProperty ? this.extractPeopleValue(assigneeProperty) : undefined;

      return {
        id: page.id,
        title: title || 'Untitled',
        status,
        priority,
        assignee,
        dueDate,
        url: page.url,
        databaseId: database.id,
        databaseName: this.extractTitle(database.title) || 'Untitled Database',
        properties: page.properties,
        created_time: page.created_time,
        last_edited_time: page.last_edited_time,
      };
    } catch (error) {
      console.error('Failed to convert page to todo:', error);
      return null;
    }
  }

  /**
   * Helper methods for property extraction
   */
  private extractTextFromProperty(property: any): string {
    if (!property) return '';
    
    if (property.type === 'title' && property.title) {
      return property.title.map((t: any) => t.plain_text || '').join('');
    }
    
    if (property.type === 'rich_text' && property.rich_text) {
      return property.rich_text.map((t: any) => t.plain_text || '').join('');
    }
    
    return '';
  }

  private extractSelectValue(property: any): string {
    if (property?.select?.name) return property.select.name;
    if (property?.status?.name) return property.status.name;
    return '';
  }

  private extractDateValue(property: any): string | undefined {
    if (property?.date?.start) return property.date.start;
    return undefined;
  }

  private extractPeopleValue(property: any): string | undefined {
    if (property?.people?.length > 0) {
      return property.people[0].name || property.people[0].id;
    }
    return undefined;
  }

  private extractTitle(titleArray: any[]): string {
    if (!Array.isArray(titleArray) || titleArray.length === 0) {
      return 'Untitled';
    }
    
    return titleArray
      .map((item) => item.plain_text || item.text?.content || '')
      .join('')
      .trim() || 'Untitled';
  }

  /**
   * Status and priority mapping methods
   */
  private mapNotionStatusToActionStatus(notionStatus: string, mapping: Record<string, string>): string {
    // Use custom mapping if provided
    if (mapping[notionStatus]) {
      return mapping[notionStatus];
    }

    // Default mapping
    const lowerStatus = notionStatus.toLowerCase();
    if (['done', 'complete', 'completed', 'finished'].includes(lowerStatus)) {
      return 'COMPLETED';
    }
    if (['in progress', 'in-progress', 'doing', 'active'].includes(lowerStatus)) {
      return 'IN_PROGRESS';
    }
    if (['blocked', 'waiting', 'on hold'].includes(lowerStatus)) {
      return 'BLOCKED';
    }
    
    return 'ACTIVE'; // Default to active
  }

  private mapNotionPriorityToActionPriority(notionPriority: string | undefined, mapping: Record<string, string>): string {
    if (!notionPriority) return 'Quick';

    // Use custom mapping if provided
    if (mapping[notionPriority]) {
      return mapping[notionPriority];
    }

    // Default mapping
    const lowerPriority = notionPriority.toLowerCase();
    if (['high', 'urgent', 'critical', '🔥'].includes(lowerPriority)) {
      return 'Immediate';
    }
    if (['medium', 'normal', 'standard'].includes(lowerPriority)) {
      return 'Soon';
    }
    if (['low', 'minor', 'someday'].includes(lowerPriority)) {
      return 'Later';
    }
    
    return 'Quick'; // Default
  }
}

export const notionSyncService = new NotionSyncService();