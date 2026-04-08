/**
 * NotionIntegrationAdapter
 *
 * Adapts the existing NotionService to implement the IIntegrationService interface
 * for use with the SyncEngine.
 */

import { NotionService } from '../NotionService';
import type {
  IIntegrationService,
  ConnectionResult,
  ExternalDatabase,
  DatabaseSchema,
  ExternalItem,
  ExternalProperty,
  ItemData,
  ItemFilter,
  ParsedAction,
  PropertyMappings,
  StatusMappings,
  PriorityMappings,
  CreateItemOptions,
  ActionWithProject,
} from './types';

export class NotionIntegrationAdapter implements IIntegrationService {
  private notionService: NotionService;

  constructor(accessToken: string) {
    this.notionService = new NotionService(accessToken);
  }

  async testConnection(): Promise<ConnectionResult> {
    const result = await this.notionService.testConnection();
    return {
      success: result.success,
      error: result.error,
    };
  }

  async getDatabases(): Promise<ExternalDatabase[]> {
    const databases = await this.notionService.getDatabases();
    return databases.map(db => ({
      id: db.id,
      title: db.title,
      url: db.url,
      properties: this.convertProperties(db.properties),
    }));
  }

  async getDatabaseSchema(databaseId: string): Promise<DatabaseSchema> {
    const database = await this.notionService.getDatabaseById(databaseId);
    return {
      id: database.id,
      title: database.title,
      properties: this.convertProperties(database.properties),
      titleProperty: this.findTitleProperty(database.properties),
    };
  }

  async getItems(databaseId: string, filter?: ItemFilter): Promise<ExternalItem[]> {
    const pages = await this.notionService.getAllPagesFromDatabase(
      databaseId,
      filter?.projectId,
      filter?.projectColumn
    );

    return pages.map(page => this.convertPageToExternalItem(page));
  }

  async createItem(
    databaseId: string,
    data: ItemData,
    options?: CreateItemOptions
  ): Promise<ExternalItem> {
    // Build properties object for Notion
    const properties: Record<string, unknown> = {};

    // Map status
    if (data.status) {
      properties.Status = NotionService.formatPropertyValue('select', data.status);
    }

    // Map priority
    if (data.priority) {
      properties.Priority = NotionService.formatPropertyValue('select', data.priority);
    }

    // Map due date
    if (data.dueDate) {
      properties['Due Date'] = NotionService.formatPropertyValue('date', data.dueDate);
    }

    // Map description
    if (data.description) {
      properties.Description = NotionService.formatPropertyValue('rich_text', data.description);
    }

    const createdPage = await this.notionService.createPage({
      databaseId,
      title: data.title,
      properties,
      titleProperty: options?.titleProperty,
      projectId: data.projectId,
      projectColumn: options?.projectColumn,
    });

    return {
      id: createdPage.id,
      title: createdPage.title,
      url: createdPage.url,
      lastEditedTime: new Date(),
      createdTime: new Date(),
    };
  }

  async updateItem(itemId: string, data: Partial<ItemData>): Promise<ExternalItem> {
    const properties: Record<string, unknown> = {};

    if (data.title) {
      // Title updates need special handling - find the title property
      properties.Name = NotionService.formatPropertyValue('title', data.title);
    }

    if (data.status) {
      properties.Status = NotionService.formatPropertyValue('select', data.status);
    }

    if (data.priority) {
      properties.Priority = NotionService.formatPropertyValue('select', data.priority);
    }

    if (data.dueDate) {
      properties['Due Date'] = NotionService.formatPropertyValue('date', data.dueDate);
    }

    if (data.description) {
      properties.Description = NotionService.formatPropertyValue('rich_text', data.description);
    }

    await this.notionService.updatePage({
      pageId: itemId,
      properties,
    });

    return {
      id: itemId,
      title: data.title ?? '',
      lastEditedTime: new Date(),
      createdTime: new Date(),
    };
  }

  async archiveItem(itemId: string): Promise<void> {
    await this.notionService.archivePage(itemId);
  }

  parseToAction(item: ExternalItem, _mappings: PropertyMappings): ParsedAction {
    // The item already has parsed data from convertPageToExternalItem
    // Status is the raw Notion value - SyncEngine maps it to kanbanStatus
    return {
      externalId: item.id,
      name: item.title,
      description: item.description,
      status: item.status ?? 'Not Started',
      priority: item.priority,
      dueDate: item.dueDate,
      lastModified: item.lastEditedTime,
      url: item.url,
    };
  }

  formatFromAction(
    action: ActionWithProject,
    mappings: PropertyMappings,
    statusMappings?: StatusMappings,
    priorityMappings?: PriorityMappings
  ): ItemData {
    // Default status mappings
    const defaultStatusMapping: Record<string, string> = {
      ACTIVE: 'In Progress',
      COMPLETED: 'Done',
      DELETED: 'Done',
    };

    // Default priority mappings
    const defaultPriorityMapping: Record<string, string> = {
      Quick: 'High',
      '1st Priority': 'High',
      '2nd Priority': 'Medium',
      '3rd Priority': 'Low',
      'Someday Maybe': 'Low',
    };

    // Map status to external format - prefer kanbanStatus over legacy status
    const kanbanStatus = (action as any).kanbanStatus as string | null;
    const statusKey = kanbanStatus ?? action.status;
    const status =
      statusMappings?.toExternal[statusKey] ??
      defaultStatusMapping[statusKey] ??
      defaultStatusMapping[action.status] ??
      action.status;

    // Map priority to external format
    const priority =
      (action.priority && priorityMappings?.toExternal[action.priority]) ??
      (action.priority && defaultPriorityMapping[action.priority]) ??
      action.priority;

    return {
      title: action.name,
      description: action.description ?? undefined,
      status,
      priority,
      dueDate: action.dueDate ?? undefined,
      projectId: action.project?.notionProjectId ?? undefined,
    };
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private convertProperties(
    notionProps: Record<string, { id: string; name: string; type: string }>
  ): Record<string, ExternalProperty> {
    const result: Record<string, ExternalProperty> = {};

    for (const [key, value] of Object.entries(notionProps)) {
      const prop: ExternalProperty = {
        id: value.id,
        name: value.name,
        type: value.type,
      };

      // Include options for select, multi_select, and status property types
      const raw = value as any;
      if (raw.type === 'select' && raw.select?.options) {
        prop.options = raw.select.options.map((o: any) => ({
          id: o.id,
          name: o.name,
          color: o.color,
        }));
      } else if (raw.type === 'multi_select' && raw.multi_select?.options) {
        prop.options = raw.multi_select.options.map((o: any) => ({
          id: o.id,
          name: o.name,
          color: o.color,
        }));
      } else if (raw.type === 'status' && raw.status?.options) {
        prop.options = raw.status.options.map((o: any) => ({
          id: o.id,
          name: o.name,
          color: o.color,
        }));
      }

      result[key] = prop;
    }

    return result;
  }

  private findTitleProperty(
    properties: Record<string, { id: string; name: string; type: string }>
  ): string | undefined {
    for (const [key, value] of Object.entries(properties)) {
      if (value.type === 'title') {
        return key;
      }
    }
    return undefined;
  }

  private convertPageToExternalItem(page: any): ExternalItem {
    // Parse basic info
    let title = 'Untitled';
    let description: string | undefined;
    let status: string | undefined;
    let priority: string | undefined;
    let dueDate: Date | undefined;

    // Find title
    for (const [, prop] of Object.entries(page.properties)) {
      const propValue = prop as any;
      if (propValue.type === 'title' && propValue.title?.[0]?.plain_text) {
        title = propValue.title[0].plain_text;
        break;
      }
    }

    // Find description (rich_text type, commonly named Description)
    if (page.properties.Description?.rich_text?.[0]?.plain_text) {
      description = page.properties.Description.rich_text[0].plain_text;
    }

    // Find status - return raw Notion status value for mapping by SyncEngine
    const statusProperty = page.properties.Status;

    // Handle native Notion status type (different from select)
    if (statusProperty?.status?.name) {
      status = statusProperty.status.name;
    }
    // Handle select type status
    else if (statusProperty?.select?.name) {
      status = statusProperty.select.name;
    }
    // Handle checkbox type status
    else if (statusProperty?.checkbox !== undefined) {
      status = statusProperty.checkbox ? 'Done' : 'Not Started';
    }

    // Find priority
    if (page.properties.Priority?.select?.name) {
      const notionPriority = page.properties.Priority.select.name;
      // Map to our priority format
      const priorityMapping: Record<string, string> = {
        High: '1st Priority',
        Medium: '2nd Priority',
        Low: '3rd Priority',
        Urgent: 'Quick',
      };
      priority = priorityMapping[notionPriority] ?? notionPriority;
    }

    // Find due date
    if (page.properties['Due Date']?.date?.start) {
      dueDate = new Date(page.properties['Due Date'].date.start);
    }

    return {
      id: page.id,
      title,
      description,
      status,
      priority,
      dueDate,
      lastEditedTime: new Date(page.last_edited_time),
      createdTime: new Date(page.created_time),
      url: page.url,
      archived: page.archived,
      rawData: page,
    };
  }
}
