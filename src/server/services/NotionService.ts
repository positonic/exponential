import { Client } from '@notionhq/client';

export interface NotionDatabase {
  id: string;
  title: string;
  url: string;
  properties: Record<string, NotionProperty>;
}

export interface NotionUser {
  id: string;
  name: string;
  email?: string;
  avatarUrl?: string;
  type: 'person' | 'bot';
}

export interface NotionProperty {
  id: string;
  name: string;
  type: string;
}

export interface NotionPage {
  id: string;
  title: string;
  url: string;
  properties: Record<string, any>;
}

export interface CreatePageParams {
  databaseId: string;
  title: string;
  properties: Record<string, any>;
  titleProperty?: string; // Optional override for which property to use as title
  projectId?: string; // Optional Notion project ID to link the page to
  projectColumn?: string; // Dynamic column name for project relation (default: 'Project')
}

export class NotionService {
  private client: Client;

  constructor(accessToken: string) {
    this.client = new Client({
      auth: accessToken,
    });
  }

  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      await this.client.users.me({});
      return { success: true };
    } catch (error) {
      console.error('Notion connection test failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async getWorkspaceUsers(): Promise<NotionUser[]> {
    try {
      const users: NotionUser[] = [];
      let hasMore = true;
      let startCursor: string | undefined;

      while (hasMore) {
        const response = await this.client.users.list({
          page_size: 100,
          start_cursor: startCursor,
        });

        for (const user of response.results) {
          // Only include person type users (not bots)
          if (user.type === 'person') {
            users.push({
              id: user.id,
              name: user.name ?? 'Unknown User',
              email: user.type === 'person' ? user.person?.email : undefined,
              avatarUrl: user.avatar_url ?? undefined,
              type: 'person',
            });
          }
        }

        hasMore = response.has_more;
        startCursor = response.next_cursor ?? undefined;
      }

      return users;
    } catch (error) {
      console.error('Failed to fetch Notion workspace users:', error);
      throw new Error('Failed to fetch workspace users from Notion');
    }
  }

  async getDatabases(): Promise<NotionDatabase[]> {
    try {
      const response = await this.client.search({
        filter: {
          value: 'database',
          property: 'object',
        },
        sort: {
          direction: 'descending',
          timestamp: 'last_edited_time',
        },
      });

      return response.results.map((database: any) => ({
        id: database.id,
        title: database.title?.[0]?.plain_text || 'Untitled Database',
        url: database.url,
        properties: this.formatProperties(database.properties),
      }));
    } catch (error) {
      console.error('Failed to fetch Notion databases:', error);
      throw new Error('Failed to fetch databases from Notion');
    }
  }

  async getDatabaseById(databaseId: string): Promise<NotionDatabase> {
    try {
      const response = await this.client.databases.retrieve({
        database_id: databaseId,
      });

      return {
        id: response.id,
        title: (response as any).title?.[0]?.plain_text || 'Untitled Database',
        url: (response as any).url || '',
        properties: this.formatProperties((response as any).properties),
      };
    } catch (error) {
      console.error('Failed to fetch Notion database:', error);
      throw new Error('Failed to fetch database from Notion');
    }
  }

  private stripHtml(html: string): string {
    // Simple HTML tag removal - replace with plain text content
    return html.replace(/<[^>]*>/g, '').trim();
  }

  async archivePage(pageId: string): Promise<void> {
    try {
      await this.client.pages.update({
        page_id: pageId,
        archived: true,
      });
    } catch (error) {
      console.error('❌ Failed to archive Notion page:', error);
      throw new Error('Failed to archive page in Notion');
    }
  }

  async updatePage(params: { pageId: string; properties: Record<string, any> }): Promise<void> {
    try {
      await this.client.pages.update({
        page_id: params.pageId,
        properties: params.properties,
      });
    } catch (error) {
      console.error('❌ Failed to update Notion page:', error);
      throw new Error('Failed to update page in Notion');
    }
  }

  async createPage(params: CreatePageParams): Promise<NotionPage> {
    try {
      // Strip HTML from title for Notion
      const cleanTitle = this.stripHtml(params.title);
      

      // Use provided title property or find it automatically
      let titleProperty: string | null | undefined = params.titleProperty;
      if (!titleProperty) {
        const database = await this.getDatabaseById(params.databaseId);
        titleProperty = this.findTitleProperty(database.properties);
      }

      const pageData = {
        parent: {
          database_id: params.databaseId,
        },
        properties: {
          // Title property - this is the main title of the Notion page
          ...(titleProperty && {
            [titleProperty]: {
              title: [
                {
                  text: {
                    content: cleanTitle,
                  },
                },
              ],
            },
          }),
          // Skip Lead field for now - people fields require user ID which we don't have
          // Lead: {
          //   people: [
          //     {
          //       person: {
          //         email: 'james@fundingthecommons.io',
          //       },
          //     },
          //   ],
          // },
          // Link to project if provided (use dynamic column name, default to 'Project')
          ...(params.projectId && {
            [params.projectColumn ?? 'Project']: {
              relation: [
                {
                  id: params.projectId,
                },
              ],
            },
          }),
          // Other properties
          ...params.properties,
        },
      };


      const response = await this.client.pages.create(pageData);


      return {
        id: response.id,
        title: cleanTitle,
        url: (response as any).url || '',
        properties: (response as any).properties,
      };
    } catch (error) {
      console.error('❌ Failed to create Notion page:', error);
      console.error('❌ Error details:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw new Error('Failed to create page in Notion');
    }
  }

  private formatProperties(properties: Record<string, any>): Record<string, NotionProperty> {
    const formatted: Record<string, NotionProperty> = {};

    for (const [key, value] of Object.entries(properties)) {
      formatted[key] = {
        id: value.id,
        name: key,
        type: value.type,
      };
    }

    return formatted;
  }

  private findTitleProperty(databaseProperties?: Record<string, any>): string | null {
    // We need to find the title property from the database schema, not the data being sent
    // This should be called with the database properties, not the properties we're sending
    if (!databaseProperties) return 'Name'; // Default fallback
    
    // Look for title type properties in the database schema
    for (const [key, prop] of Object.entries(databaseProperties)) {
      if (prop && typeof prop === 'object' && 'type' in prop && prop.type === 'title') {
        return key;
      }
    }
    
    // Fallback to common names
    const titleNames = ['Name', 'Title', 'Task', 'name', 'title', 'task'];
    for (const name of titleNames) {
      if (databaseProperties[name]) {
        return name;
      }
    }

    return null;
  }

  async getAllPagesFromDatabase(
    databaseId: string,
    filterByProjectId?: string,
    projectColumn?: string // Dynamic column name for project relation (default: 'Project')
  ): Promise<any[]> {
    try {
      const queryOptions: any = {
        database_id: databaseId,
        page_size: 100,
      };

      // Add filter for project if provided (use dynamic column name)
      if (filterByProjectId) {
        queryOptions.filter = {
          property: projectColumn ?? 'Project',
          relation: {
            contains: filterByProjectId,
          },
        };
      }

      const response = await this.client.databases.query(queryOptions);

      return response.results;
    } catch (error) {
      console.error('Failed to fetch pages from Notion database:', error);
      throw new Error('Failed to fetch pages from Notion database');
    }
  }

  async getProjectsFromDatabase(databaseId: string): Promise<NotionPage[]> {
    try {
      
      const response = await this.client.databases.query({
        database_id: databaseId,
        page_size: 100,
      });

      const projects = response.results.map((page: any) => {
        // Find the title property
        let title = 'Untitled Project';
        const titleProperty = this.findTitleProperty(page.properties);
        if (titleProperty && page.properties[titleProperty]?.title?.[0]?.plain_text) {
          title = page.properties[titleProperty].title[0].plain_text;
        }

        return {
          id: page.id,
          title,
          url: page.url,
          properties: page.properties,
        };
      });

      return projects;
    } catch (error) {
      console.error('Failed to fetch projects from Notion Projects database:', error);
      throw new Error('Failed to fetch projects from Notion Projects database');
    }
  }

  parseNotionPageToAction(page: any, propertyMappings?: Record<string, string>): {
    notionId: string;
    name: string;
    description?: string;
    status: string;
    priority?: string;
    dueDate?: Date;
    lastModified: Date;
    assigneeNotionUserId?: string;
  } {
    try {
      // Get title from title property (could be Name, Title, Task, etc.)
      let name = 'Untitled Task';
      const titleProperty = this.findTitleProperty(page.properties);
      if (titleProperty && page.properties[titleProperty]?.title?.[0]?.plain_text) {
        name = page.properties[titleProperty].title[0].plain_text;
      }

      // Get description from mapped property or fallback
      let description: string | undefined;
      const descriptionProp = propertyMappings?.description || 'Description';
      if (page.properties[descriptionProp]?.rich_text?.[0]?.plain_text) {
        description = page.properties[descriptionProp].rich_text[0].plain_text;
      }

      // Get status - default to ACTIVE if not found
      let status = 'ACTIVE';
      const statusProp = propertyMappings?.status || 'Status';
      const statusProperty = page.properties[statusProp];

      // Map Notion status to our status
      const statusMapping: Record<string, string> = {
        'Done': 'COMPLETED',
        'Completed': 'COMPLETED',
        'Complete': 'COMPLETED',
        'Finished': 'COMPLETED',
        'Archived': 'COMPLETED',
        'In Progress': 'ACTIVE',
        'In progress': 'ACTIVE',
        'Active': 'ACTIVE',
        'Todo': 'ACTIVE',
        'To-do': 'ACTIVE',
        'Not Started': 'ACTIVE',
        'Not started': 'ACTIVE',
      };

      // Handle native Notion status type (different from select)
      if (statusProperty?.status?.name) {
        const notionStatus = statusProperty.status.name;
        status = statusMapping[notionStatus] ?? 'ACTIVE';
      }
      // Handle select type status
      else if (statusProperty?.select?.name) {
        const notionStatus = statusProperty.select.name;
        status = statusMapping[notionStatus] ?? 'ACTIVE';
      }
      // Handle checkbox type status
      else if (statusProperty?.checkbox !== undefined) {
        status = statusProperty.checkbox ? 'COMPLETED' : 'ACTIVE';
      }

      // Get priority
      let priority: string | undefined;
      const priorityProp = propertyMappings?.priority || 'Priority';
      if (page.properties[priorityProp]?.select?.name) {
        const notionPriority = page.properties[priorityProp].select.name;
        // Map Notion priority to our priority
        const priorityMapping: Record<string, string> = {
          'High': '1st Priority',
          'Medium': '2nd Priority',
          'Low': '3rd Priority',
          'Urgent': 'Quick',
        };
        priority = priorityMapping[notionPriority] || notionPriority;
      }

      // Get due date
      let dueDate: Date | undefined;
      const dueDateProp = propertyMappings?.dueDate || 'Due Date';
      if (page.properties[dueDateProp]?.date?.start) {
        dueDate = new Date(page.properties[dueDateProp].date.start);
      }

      // Get assignee (extract Notion user ID for mapping)
      // Check multiple common property names for assignee
      let assigneeNotionUserId: string | undefined;
      const assigneePropNames = [
        propertyMappings?.assignee,
        'Assignee',
        'DRI',
        'Lead',
        'Owner',
        'Assigned to',
        'Assigned To',
      ].filter(Boolean) as string[];

      // Find the first people property that matches one of our expected names
      let assigneeProperty: any = null;
      for (const propName of assigneePropNames) {
        if (page.properties[propName]?.people?.length > 0) {
          assigneeProperty = page.properties[propName];
          break;
        }
      }

      // If no match found by name, fall back to the first people-type property with data
      if (!assigneeProperty) {
        const firstPeopleProperty = Object.entries(page.properties).find(
          ([, prop]: [string, any]) => prop?.type === 'people' && prop?.people?.length > 0
        );
        if (firstPeopleProperty) {
          assigneeProperty = firstPeopleProperty[1];
        }
      }

      if (assigneeProperty?.people?.length > 0) {
        assigneeNotionUserId = assigneeProperty.people[0].id;
      }

      return {
        notionId: page.id,
        name,
        description,
        status,
        priority,
        dueDate,
        lastModified: new Date(page.last_edited_time),
        assigneeNotionUserId,
      };
    } catch (error) {
      console.error('Failed to parse Notion page:', error);
      throw new Error('Failed to parse Notion page data');
    }
  }

  static formatPropertyValue(type: string, value: any): any {
    switch (type) {
      case 'title':
        return {
          title: [
            {
              text: {
                content: String(value),
              },
            },
          ],
        };

      case 'rich_text':
        return {
          rich_text: [
            {
              text: {
                content: String(value),
              },
            },
          ],
        };

      case 'number':
        return {
          number: Number(value),
        };

      case 'select':
        return {
          select: {
            name: String(value),
          },
        };

      case 'multi_select':
        return {
          multi_select: Array.isArray(value)
            ? value.map(v => ({ name: String(v) }))
            : [{ name: String(value) }],
        };

      case 'date':
        return {
          date: {
            start: value instanceof Date ? value.toISOString().split('T')[0] : String(value),
          },
        };

      case 'people':
        return {
          people: Array.isArray(value)
            ? value.map(v => ({ id: String(v) }))
            : [{ id: String(value) }],
        };

      case 'checkbox':
        return {
          checkbox: Boolean(value),
        };

      case 'url':
        return {
          url: String(value),
        };

      case 'email':
        return {
          email: String(value),
        };

      case 'phone_number':
        return {
          phone_number: String(value),
        };

      default:
        // For unknown types, try rich_text as fallback
        return {
          rich_text: [
            {
              text: {
                content: String(value),
              },
            },
          ],
        };
    }
  }
}