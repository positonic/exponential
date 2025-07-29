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