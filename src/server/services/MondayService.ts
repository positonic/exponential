export interface MondayBoard {
  id: string;
  name: string;
  description?: string;
  board_folder_id?: number;
  board_kind: string;
  state: string;
}

export interface MondayColumn {
  id: string;
  title: string;
  type: string;
  settings_str?: string;
}

export interface MondayUser {
  id: string;
  name: string;
  email: string;
}

export interface MondayItem {
  id: string;
  name: string;
  board?: {
    id: string;
    name: string;
  };
  column_values?: Array<{
    id: string;
    text?: string;
    value?: string;
    type?: string;
  }>;
}

export interface CreateItemParams {
  boardId: string;
  itemName: string;
  columnValues?: Record<string, any>;
}

export class MondayService {
  private apiUrl = 'https://api.monday.com/v2';
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async makeRequest(query: string, variables: Record<string, any> = {}): Promise<any> {
    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': this.apiKey,
      },
      body: JSON.stringify({
        query,
        variables,
      }),
    });

    if (!response.ok) {
      throw new Error(`Monday.com API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    if (data.errors) {
      throw new Error(`Monday.com GraphQL error: ${data.errors[0]?.message || 'Unknown error'}`);
    }

    return data.data;
  }

  async testConnection(): Promise<{ success: boolean; error?: string; user?: MondayUser }> {
    try {
      const query = `
        query {
          me {
            id
            name
            email
          }
        }
      `;

      const data = await this.makeRequest(query);
      
      if (!data.me) {
        return { success: false, error: 'Invalid API key - no user data returned' };
      }

      return {
        success: true,
        user: {
          id: data.me.id,
          name: data.me.name,
          email: data.me.email,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Connection failed',
      };
    }
  }

  async getBoards(): Promise<MondayBoard[]> {
    const query = `
      query {
        boards {
          id
          name
          description
          board_folder_id
          board_kind
          state
        }
      }
    `;

    const data = await this.makeRequest(query);
    return data.boards || [];
  }

  async getBoardItems(boardId: string): Promise<MondayItem[]> {
    const items: MondayItem[] = [];
    let cursor: string | null = null;

    // Monday.com uses cursor-based pagination for items_page
    do {
      const query = cursor
        ? `query ($boardId: ID!, $cursor: String!) {
            boards(ids: [$boardId]) {
              items_page(limit: 100, cursor: $cursor) {
                cursor
                items {
                  id
                  name
                  group { id title }
                  column_values {
                    id
                    text
                    value
                    type
                  }
                }
              }
            }
          }`
        : `query ($boardId: ID!) {
            boards(ids: [$boardId]) {
              items_page(limit: 100) {
                cursor
                items {
                  id
                  name
                  group { id title }
                  column_values {
                    id
                    text
                    value
                    type
                  }
                }
              }
            }
          }`;

      const variables: Record<string, any> = { boardId };
      if (cursor) variables.cursor = cursor;

      const data = await this.makeRequest(query, variables);
      const page = data.boards?.[0]?.items_page;
      if (!page) break;

      items.push(...(page.items || []));
      cursor = page.cursor;
    } while (cursor);

    return items;
  }

  /**
   * Parse a Monday.com item into a local action-compatible format.
   * Extracts status, priority, due date, and description from column values.
   */
  static parseItemToAction(item: MondayItem): {
    name: string;
    mondayId: string;
    status: string;
    priority: string;
    dueDate: Date | null;
    description: string;
    group: string | null;
  } {
    const columnValues = item.column_values || [];
    const getCol = (type: string) => columnValues.find(c => c.type === type);
    const _getColById = (id: string) => columnValues.find(c => c.id === id);

    // Status mapping: Monday status → Exponential status
    const statusCol = getCol('color') || getCol('status'); // Monday status columns have type 'color'
    const statusText = statusCol?.text || '';
    let status = 'ACTIVE';
    const lower = statusText.toLowerCase();
    if (lower.includes('done') || lower.includes('complete')) {
      status = 'COMPLETED';
    } else if (lower.includes('stuck') || lower.includes('blocked')) {
      status = 'ACTIVE'; // keep active, could add BLOCKED later
    }

    // Priority mapping
    const priorityCol = columnValues.find(c => c.id === 'priority' || (c.type === 'color' && c.id !== statusCol?.id));
    let priority = 'Quick';
    if (priorityCol?.text) {
      const p = priorityCol.text.toLowerCase();
      if (p.includes('critical') || p.includes('high')) priority = '1st Priority';
      else if (p.includes('medium')) priority = '2nd Priority';
      else if (p.includes('low')) priority = '3rd Priority';
    }

    // Due date
    const dateCol = getCol('date');
    let dueDate: Date | null = null;
    if (dateCol?.text) {
      const parsed = new Date(dateCol.text);
      if (!isNaN(parsed.getTime())) dueDate = parsed;
    }

    // Description / long text
    const longTextCol = getCol('long-text') || getCol('text');
    const description = longTextCol?.text || '';

    // Group (used as context, not mapped to a field directly)
    const group = (item as any).group?.title || null;

    return {
      name: item.name,
      mondayId: item.id,
      status,
      priority,
      dueDate,
      description,
      group,
    };
  }

  async getBoardColumns(boardId: string): Promise<MondayColumn[]> {
    const query = `
      query ($boardId: ID!) {
        boards(ids: [$boardId]) {
          columns {
            id
            title
            type
            settings_str
          }
        }
      }
    `;

    const data = await this.makeRequest(query, { boardId });
    return data.boards?.[0]?.columns || [];
  }

  async createItem(params: CreateItemParams): Promise<MondayItem> {
    const { boardId, itemName, columnValues = {} } = params;

    // Convert column values to Monday.com format
    const formattedColumnValues = JSON.stringify(columnValues);

    const mutation = `
      mutation ($boardId: ID!, $itemName: String!, $columnValues: JSON) {
        create_item (
          board_id: $boardId,
          item_name: $itemName,
          column_values: $columnValues
        ) {
          id
          name
          board {
            id
            name
          }
          column_values {
            id
            text
            value
          }
        }
      }
    `;

    const data = await this.makeRequest(mutation, {
      boardId,
      itemName,
      columnValues: formattedColumnValues,
    });

    return data.create_item;
  }

  async updateItem(itemId: string, columnValues: Record<string, any>): Promise<MondayItem> {
    const formattedColumnValues = JSON.stringify(columnValues);

    const mutation = `
      mutation ($itemId: ID!, $columnValues: JSON) {
        change_multiple_column_values (
          item_id: $itemId,
          board_id: null,
          column_values: $columnValues
        ) {
          id
          name
          board {
            id
            name
          }
          column_values {
            id
            text
            value
          }
        }
      }
    `;

    const data = await this.makeRequest(mutation, {
      itemId,
      columnValues: formattedColumnValues,
    });

    return data.change_multiple_column_values;
  }

  async getUsersByBoard(boardId: string): Promise<MondayUser[]> {
    const query = `
      query ($boardId: ID!) {
        boards(ids: [$boardId]) {
          subscribers {
            id
            name
            email
          }
        }
      }
    `;

    const data = await this.makeRequest(query, { boardId });
    return data.boards?.[0]?.subscribers || [];
  }

  // Helper method to format column values for common field types
  async getBoardsWithColumns(): Promise<Array<MondayBoard & { columns: MondayColumn[] }>> {
    const query = `
      query {
        boards {
          id
          name
          description
          board_folder_id
          board_kind
          state
          columns {
            id
            title
            type
            settings_str
          }
        }
      }
    `;

    const data = await this.makeRequest(query);
    return (data.boards || []).map((board: any) => ({
      id: board.id,
      name: board.name,
      description: board.description,
      board_folder_id: board.board_folder_id,
      board_kind: board.board_kind,
      state: board.state,
      columns: board.columns || [],
    }));
  }

  static formatColumnValue(columnType: string, value: any): any {
    switch (columnType) {
      case 'text':
        return { text: String(value || '') };
      
      case 'person':
        // Value should be an array of user IDs
        return { personsAndTeams: Array.isArray(value) ? value.map(id => ({ id: String(id), kind: 'person' })) : [] };
      
      case 'date': 
        // Value should be a date string in YYYY-MM-DD format
        return { date: value ? new Date(value).toISOString().split('T')[0] : null };
      
      case 'status':
        // Value should be the status label
        return { label: String(value || '') };
      
      case 'priority':
        // Value should be the priority label
        return { label: String(value || '') };
      
      case 'numbers':
        return { number: Number(value) || 0 };
      
      case 'long-text':
        return { text: String(value || '') };
      
      default:
        return value;
    }
  }
}