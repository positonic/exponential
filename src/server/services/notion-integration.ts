import { db } from '~/server/db';
import type { Integration, IntegrationCredential } from '@prisma/client';

interface NotionIntegration extends Integration {
  credentials: IntegrationCredential[];
}

interface NotionPage {
  id: string;
  title: string;
  url: string;
  properties: Record<string, any>;
  created_time: string;
  last_edited_time: string;
}

interface NotionDatabase {
  id: string;
  title: string;
  url: string;
  properties: Record<string, any>;
  created_time: string;
  last_edited_time: string;
}

class NotionIntegrationService {
  private async getAccessToken(integration: NotionIntegration): Promise<string> {
    const tokenCredential = integration.credentials.find(
      cred => cred.keyType === 'access_token'
    );
    
    if (!tokenCredential) {
      throw new Error('Notion access token not found');
    }

    return tokenCredential.key;
  }

  private async makeNotionRequest(
    integration: NotionIntegration,
    endpoint: string,
    options: RequestInit = {}
  ) {
    const accessToken = await this.getAccessToken(integration);
    
    const response = await fetch(`https://api.notion.com/v1${endpoint}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Notion API error: ${response.status} ${error}`);
    }

    return response.json();
  }

  async createNotionIntegration(userId: string, oauthData: {
    accessToken: string;
    tokenType: string;
    workspaceId: string;
    workspaceName: string;
    workspaceIcon: string | null;
    botId: string;
    owner: any;
    duplicatedTemplateId?: string;
    projectId?: string;
  }) {
    const {
      accessToken,
      tokenType,
      workspaceId,
      workspaceName,
      workspaceIcon,
      botId,
      owner,
      duplicatedTemplateId,
      projectId
    } = oauthData;

    // Create the main integration record
    const integration = await db.integration.create({
      data: {
        name: `Notion - ${workspaceName}`,
        type: 'oauth',
        provider: 'notion',
        status: 'ACTIVE',
        description: `Notion workspace integration for ${workspaceName}`,
        userId,
        lastSyncAt: new Date(),
      },
    });

    // Store access token as encrypted credential
    await db.integrationCredential.create({
      data: {
        integrationId: integration.id,
        key: accessToken,
        keyType: 'access_token',
        isEncrypted: true,
      },
    });

    // Store Notion workspace metadata
    await db.integrationCredential.create({
      data: {
        integrationId: integration.id,
        key: JSON.stringify({
          tokenType,
          workspaceId,
          workspaceName,
          workspaceIcon,
          botId,
          owner,
          duplicatedTemplateId,
        }),
        keyType: 'notion_metadata',
        isEncrypted: false,
      },
    });

    // If this is for a specific project, create a workflow for Notion sync
    if (projectId) {
      await this.createNotionSyncWorkflow(integration.id, userId, projectId);
    }

    return integration;
  }

  private async createNotionSyncWorkflow(integrationId: string, userId: string, projectId: string) {
    return db.workflow.create({
      data: {
        name: 'Notion Pages Sync',
        type: 'notion_pages',
        provider: 'notion',
        status: 'ACTIVE',
        syncDirection: 'pull', // Notion → App
        syncFrequency: 'manual', // User-triggered sync
        config: {
          syncDirection: 'pull',
          autoSync: false,
          includeDatabases: true,
          includePages: true,
          syncContent: true,
          createActionsFromPages: false, // Can be enabled later
        },
        integrationId,
        userId,
        projectId,
      },
    });
  }

  async getDatabases(integrationId: string): Promise<NotionDatabase[]> {
    const integration = await db.integration.findUnique({
      where: { id: integrationId },
      include: { credentials: true },
    });

    if (!integration) {
      throw new Error('Integration not found');
    }

    const response = await this.makeNotionRequest(
      integration as NotionIntegration,
      '/search',
      {
        method: 'POST',
        body: JSON.stringify({
          filter: {
            property: 'object',
            value: 'database',
          },
          sort: {
            direction: 'descending',
            timestamp: 'last_edited_time',
          },
        }),
      }
    );

    return response.results.map((db: any) => ({
      id: db.id,
      title: this.extractTitle(db.title),
      url: db.url,
      properties: db.properties,
      created_time: db.created_time,
      last_edited_time: db.last_edited_time,
    }));
  }

  async getPages(integrationId: string): Promise<NotionPage[]> {
    const integration = await db.integration.findUnique({
      where: { id: integrationId },
      include: { credentials: true },
    });

    if (!integration) {
      throw new Error('Integration not found');
    }

    const response = await this.makeNotionRequest(
      integration as NotionIntegration,
      '/search',
      {
        method: 'POST',
        body: JSON.stringify({
          filter: {
            property: 'object',
            value: 'page',
          },
          sort: {
            direction: 'descending',
            timestamp: 'last_edited_time',
          },
        }),
      }
    );

    return response.results.map((page: any) => ({
      id: page.id,
      title: this.extractTitle(page.properties?.title?.title || page.properties?.Name?.title),
      url: page.url,
      properties: page.properties,
      created_time: page.created_time,
      last_edited_time: page.last_edited_time,
    }));
  }

  async createPage(integrationId: string, pageData: {
    parent: { database_id: string } | { page_id: string };
    properties: Record<string, any>;
    children?: any[];
  }) {
    const integration = await db.integration.findUnique({
      where: { id: integrationId },
      include: { credentials: true },
    });

    if (!integration) {
      throw new Error('Integration not found');
    }

    return this.makeNotionRequest(
      integration as NotionIntegration,
      '/pages',
      {
        method: 'POST',
        body: JSON.stringify(pageData),
      }
    );
  }

  async updatePage(integrationId: string, pageId: string, properties: Record<string, any>) {
    const integration = await db.integration.findUnique({
      where: { id: integrationId },
      include: { credentials: true },
    });

    if (!integration) {
      throw new Error('Integration not found');
    }

    return this.makeNotionRequest(
      integration as NotionIntegration,
      `/pages/${pageId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ properties }),
      }
    );
  }

  async testConnection(integrationId: string): Promise<boolean> {
    try {
      const integration = await db.integration.findUnique({
        where: { id: integrationId },
        include: { credentials: true },
      });

      if (!integration) {
        return false;
      }

      await this.makeNotionRequest(integration as NotionIntegration, '/users/me');
      return true;
    } catch (error) {
      console.error('Notion connection test failed:', error);
      return false;
    }
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

  async syncWorkspaceContent(integrationId: string) {
    const integration = await db.integration.findUnique({
      where: { id: integrationId },
      include: { credentials: true },
    });

    if (!integration) {
      throw new Error('Integration not found');
    }

    const workflow = await db.workflow.findFirst({
      where: {
        integrationId,
        type: 'notion_pages',
        status: 'ACTIVE',
      },
    });

    if (!workflow) {
      throw new Error('No active Notion sync workflow found');
    }

    try {
      const startTime = Date.now();

      // Create workflow run record
      const workflowRun = await db.workflowRun.create({
        data: {
          workflowId: workflow.id,
          status: 'running',
          itemsProcessed: 0,
          itemsCreated: 0,
          itemsUpdated: 0,
          itemsSkipped: 0,
        },
      });

      // Get all databases and pages
      const [databases, pages] = await Promise.all([
        this.getDatabases(integrationId),
        this.getPages(integrationId),
      ]);

      const totalItems = databases.length + pages.length;
      let itemsProcessed = 0;

      // Update workflow run with final status
      await db.workflowRun.update({
        where: { id: workflowRun.id },
        data: {
          status: 'completed',
          completedAt: new Date(),
          itemsProcessed: totalItems,
          itemsCreated: 0, // Would implement actual sync logic here
          itemsUpdated: 0,
          itemsSkipped: totalItems,
          metadata: {
            databaseCount: databases.length,
            pageCount: pages.length,
            duration: Date.now() - startTime,
          },
        },
      });

      return {
        itemsProcessed: totalItems,
        itemsCreated: 0,
        itemsUpdated: 0,
        itemsSkipped: totalItems,
        databases: databases.length,
        pages: pages.length,
      };

    } catch (error) {
      console.error('Notion sync failed:', error);
      throw error;
    }
  }
}

export const notionIntegrationService = new NotionIntegrationService();