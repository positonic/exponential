import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";

// Test Fireflies API connection
async function testFirefliesConnection(apiKey: string): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch('https://api.fireflies.ai/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query: "query { user { email } }",
        variables: {}
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Fireflies API error response:', errorText);
      return { success: false, error: `HTTP ${response.status}: ${errorText}` };
    }

    const data = await response.json();
    
    if (data.errors) {
      console.error('Fireflies GraphQL errors:', data.errors);
      return { success: false, error: data.errors[0]?.message || 'GraphQL error' };
    }

    if (!data.data?.user) {
      return { success: false, error: 'Invalid API key - no user data returned' };
    }

    return { success: true };
  } catch (error) {
    console.error('Fireflies connection test error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Connection failed' };
  }
}

// Test Notion access token connection
async function testNotionConnection(accessToken: string): Promise<{ success: boolean; error?: string; userInfo?: any }> {
  try {
    const response = await fetch('https://api.notion.com/v1/users/me', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Notion-Version': '2022-06-28',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, error: `HTTP ${response.status}: ${errorText}` };
    }

    const data = await response.json();
    
    return { 
      success: true, 
      userInfo: {
        id: data.id,
        name: data.name,
        avatar_url: data.avatar_url,
        type: data.type,
        person: data.person
      }
    };
  } catch (error) {
    console.error('Notion connection test error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Connection failed' };
  }
}

// Fetch Notion databases accessible to the integration
async function fetchNotionDatabases(accessToken: string): Promise<{ success: boolean; error?: string; databases?: any[] }> {
  try {
    const response = await fetch('https://api.notion.com/v1/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        filter: {
          value: 'database',
          property: 'object'
        }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, error: `HTTP ${response.status}: ${errorText}` };
    }

    const data = await response.json();
    
    const databases = data.results.map((db: any) => ({
      id: db.id,
      title: db.title?.[0]?.plain_text || 'Untitled Database',
      permissions: [
        db.is_inline ? 'inline' : 'full_page',
        ...(db.archived ? ['archived'] : []),
        'read',
        ...(db.parent?.type === 'workspace' ? ['workspace'] : ['page']),
      ]
    }));

    return { 
      success: true, 
      databases
    };
  } catch (error) {
    console.error('Notion databases fetch error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to fetch databases' };
  }
}

// Test Slack bot token connection
async function testSlackConnection(botToken: string): Promise<{ success: boolean; error?: string; teamInfo?: any }> {
  try {
    const response = await fetch('https://slack.com/api/auth.test', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${botToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}: ${response.statusText}` };
    }

    const data = await response.json();
    
    if (!data.ok) {
      return { success: false, error: data.error || 'Slack authentication failed' };
    }

    return { 
      success: true, 
      teamInfo: {
        team: data.team,
        team_id: data.team_id,
        user: data.user,
        user_id: data.user_id,
        bot_id: data.bot_id
      }
    };
  } catch (error) {
    console.error('Slack connection test error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Connection failed' };
  }
}

export const integrationRouter = createTRPCRouter({
  // List all integrations for the current user and their teams
  listIntegrations: protectedProcedure
    .input(z.object({
      teamId: z.string().optional(),
    }).optional())
    .output(z.array(z.object({
      id: z.string(),
      name: z.string(),
      type: z.string(),
      provider: z.string(),
      status: z.string(),
      description: z.string().nullable(),
      createdAt: z.string(),
      updatedAt: z.string(),
      credentialCount: z.number(),
      scope: z.enum(['personal', 'team']),
      teamName: z.string().nullable(),
    })))
    .query(async ({ ctx, input }) => {
      // Get user's team memberships to include team integrations
      const userTeams = await ctx.db.teamUser.findMany({
        where: {
          userId: ctx.session.user.id,
        },
        select: {
          teamId: true,
          team: {
            select: {
              name: true,
            },
          },
        },
      });

      const teamIds = userTeams.map(membership => membership.teamId);

      // Build where clause to include personal and team integrations
      const whereClause: any = {
        OR: [
          { userId: ctx.session.user.id }, // Personal integrations
          ...(teamIds.length > 0 ? [{ teamId: { in: teamIds } }] : []), // Team integrations
        ],
      };

      // If filtering by specific team, only show that team's integrations
      if (input?.teamId) {
        // Verify user is member of the requested team
        const isMember = teamIds.includes(input.teamId);
        if (!isMember) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'You are not a member of this team',
          });
        }
        whereClause.teamId = input.teamId;
        delete whereClause.OR;
      }

      const integrations = await ctx.db.integration.findMany({
        where: whereClause,
        include: {
          credentials: {
            select: {
              id: true,
            },
          },
          team: {
            select: {
              name: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      return integrations.map(integration => ({
        id: integration.id,
        name: integration.name,
        type: integration.type,
        provider: integration.provider,
        status: integration.status,
        description: integration.description,
        createdAt: integration.createdAt.toISOString(),
        updatedAt: integration.updatedAt.toISOString(),
        credentialCount: integration.credentials.length,
        scope: integration.teamId ? 'team' as const : 'personal' as const,
        teamName: integration.team?.name || null,
      }));
    }),

  // Create a new integration
  createIntegration: protectedProcedure
    .input(z.object({
      name: z.string().min(1),
      provider: z.enum(['fireflies', 'exponential-plugin', 'github', 'slack', 'notion', 'webhook']),
      description: z.string().optional(),
      apiKey: z.string().min(1),
      teamId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // If teamId is provided, verify user is a member of the team
      if (input.teamId) {
        const teamMember = await ctx.db.teamUser.findUnique({
          where: {
            userId_teamId: {
              userId: ctx.session.user.id,
              teamId: input.teamId,
            },
          },
        });

        if (!teamMember) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'You are not a member of this team',
          });
        }
      }

      // Test connection for Fireflies
      if (input.provider === 'fireflies') {
        const testResult = await testFirefliesConnection(input.apiKey);
        if (!testResult.success) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Fireflies connection failed: ${testResult.error}`,
          });
        }
      }

      try {
        // Create the integration
        const integration = await ctx.db.integration.create({
          data: {
            name: input.name,
            type: 'API_KEY',
            provider: input.provider,
            description: input.description,
            userId: input.teamId ? null : ctx.session.user.id, // Personal if no team
            teamId: input.teamId || null, // Team if provided
          },
        });

        // Create the credential
        await ctx.db.integrationCredential.create({
          data: {
            key: input.apiKey,
            keyType: 'API_KEY',
            isEncrypted: false, // We'll implement encryption later
            integrationId: integration.id,
          },
        });

        return {
          integration: {
            id: integration.id,
            name: integration.name,
            type: integration.type,
            provider: integration.provider,
            status: integration.status,
            description: integration.description,
            createdAt: integration.createdAt.toISOString(),
          },
        };
      } catch (error) {
        console.error('Integration creation failed:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to create integration',
        });
      }
    }),

  // Create Slack integration via OAuth
  createSlackIntegration: protectedProcedure
    .input(z.object({
      name: z.string().min(1),
      description: z.string().optional(),
      botToken: z.string().min(1),
      userToken: z.string().optional(),
      signingSecret: z.string().min(1),
      slackTeamId: z.string().optional(), // Make optional - we'll get it from the token
      teamName: z.string().optional(), // Make optional - we'll get it from the token
      appTeamId: z.string().optional(), // Optional team ID for the app (our internal teams)
      appId: z.string().optional(), // Slack app ID for distinguishing multiple apps
    }))
    .mutation(async ({ ctx, input }) => {
      // If appTeamId is provided, verify user is a member of the team
      if (input.appTeamId) {
        const teamMember = await ctx.db.teamUser.findUnique({
          where: {
            userId_teamId: {
              userId: ctx.session.user.id,
              teamId: input.appTeamId,
            },
          },
        });

        if (!teamMember) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'You are not a member of this team',
          });
        }
      }

      // Test the bot token
      const testResult = await testSlackConnection(input.botToken);
      if (!testResult.success) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Slack connection failed: ${testResult.error}`,
        });
      }

      // Get team info from the token test result
      const slackTeamId = testResult.teamInfo?.team_id;
      const teamName = testResult.teamInfo?.team || input.teamName || 'Unknown Team';
      
      if (!slackTeamId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Could not retrieve team ID from Slack token',
        });
      }

      try {
        // Create the integration
        const integration = await ctx.db.integration.create({
          data: {
            name: input.name,
            type: 'OAUTH',
            provider: 'slack',
            description: input.description || `Slack integration for ${teamName}`,
            userId: input.appTeamId ? null : ctx.session.user.id, // Personal if no app team
            teamId: input.appTeamId || null, // App team if provided
          },
        });

        // Create the credentials
        const credentials = [
          {
            key: input.botToken,
            keyType: 'BOT_TOKEN',
            isEncrypted: false,
            integrationId: integration.id,
          },
          {
            key: input.signingSecret,
            keyType: 'SIGNING_SECRET',
            isEncrypted: false,
            integrationId: integration.id,
          },
          {
            key: slackTeamId,
            keyType: 'TEAM_ID',
            isEncrypted: false,
            integrationId: integration.id,
          },
        ];

        // Add APP_ID if provided
        if (input.appId) {
          credentials.push({
            key: input.appId,
            keyType: 'APP_ID',
            isEncrypted: false,
            integrationId: integration.id,
          });
        }

        if (input.userToken) {
          credentials.push({
            key: input.userToken,
            keyType: 'USER_TOKEN',
            isEncrypted: false,
            integrationId: integration.id,
          });
        }

        await ctx.db.integrationCredential.createMany({
          data: credentials,
        });

        return {
          integration: {
            id: integration.id,
            name: integration.name,
            type: integration.type,
            provider: integration.provider,
            status: integration.status,
            description: integration.description,
            createdAt: integration.createdAt.toISOString(),
            teamInfo: testResult.teamInfo,
          },
        };
      } catch (error) {
        console.error('Slack integration creation failed:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to create Slack integration',
        });
      }
    }),

  // Delete an integration
  deleteIntegration: protectedProcedure
    .input(z.object({
      integrationId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Get user's team memberships
      const userTeams = await ctx.db.teamUser.findMany({
        where: {
          userId: ctx.session.user.id,
        },
        select: {
          teamId: true,
        },
      });

      const teamIds = userTeams.map(membership => membership.teamId);

      // Verify the integration belongs to the user or their teams
      const integration = await ctx.db.integration.findUnique({
        where: {
          id: input.integrationId,
          OR: [
            { userId: ctx.session.user.id }, // Personal integration
            ...(teamIds.length > 0 ? [{ teamId: { in: teamIds } }] : []), // Team integration
          ],
        },
        select: {
          id: true,
          teamId: true,
        },
      });

      if (!integration) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Integration not found or access denied',
        });
      }

      // If it's a team integration, verify user has permission to delete
      if (integration.teamId) {
        const teamMember = await ctx.db.teamUser.findUnique({
          where: {
            userId_teamId: {
              userId: ctx.session.user.id,
              teamId: integration.teamId,
            },
          },
        });

        if (!teamMember || (teamMember.role !== 'owner' && teamMember.role !== 'admin')) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Only team owners and admins can delete team integrations',
          });
        }
      }

      // Delete the integration (credentials will be deleted via cascade)
      await ctx.db.integration.delete({
        where: {
          id: input.integrationId,
        },
      });

      return { success: true };
    }),

  // Test connection for an existing integration
  testConnection: protectedProcedure
    .input(z.object({
      integrationId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Get user's team memberships
      const userTeams = await ctx.db.teamUser.findMany({
        where: {
          userId: ctx.session.user.id,
        },
        select: {
          teamId: true,
        },
      });

      const teamIds = userTeams.map(membership => membership.teamId);

      // Get the integration and its credentials
      const integration = await ctx.db.integration.findUnique({
        where: {
          id: input.integrationId,
          OR: [
            { userId: ctx.session.user.id }, // Personal integration
            ...(teamIds.length > 0 ? [{ teamId: { in: teamIds } }] : []), // Team integration
          ],
        },
        include: {
          credentials: true,
        },
      });

      if (!integration) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Integration not found or access denied',
        });
      }

      // Test based on provider
      if (integration.provider === 'fireflies') {
        const apiKeyCredential = integration.credentials.find(c => c.keyType === 'API_KEY');
        if (!apiKeyCredential) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'No API key found for this integration',
          });
        }

        const result = await testFirefliesConnection(apiKeyCredential.key);
        return {
          success: result.success,
          error: result.error,
          provider: integration.provider,
        };
      }

      if (integration.provider === 'slack') {
        const botTokenCredential = integration.credentials.find(c => c.keyType === 'BOT_TOKEN');
        if (!botTokenCredential) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'No bot token found for this Slack integration',
          });
        }

        const result = await testSlackConnection(botTokenCredential.key);
        return {
          success: result.success,
          error: result.error,
          provider: integration.provider,
          teamInfo: result.teamInfo,
        };
      }

      if (integration.provider === 'notion') {
        const accessTokenCredential = integration.credentials.find(c => c.keyType === 'ACCESS_TOKEN' || c.keyType === 'API_KEY');
        if (!accessTokenCredential) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'No access token found for this Notion integration',
          });
        }

        const result = await testNotionConnection(accessTokenCredential.key);
        if (!result.success) {
          return {
            success: result.success,
            error: result.error,
            provider: integration.provider,
          };
        }

        // Also fetch databases for Notion
        const databasesResult = await fetchNotionDatabases(accessTokenCredential.key);
        return {
          success: result.success,
          error: result.error,
          provider: integration.provider,
          userInfo: result.userInfo,
          databases: databasesResult.databases,
        };
      }

      return {
        success: false,
        error: 'Connection testing not implemented for this provider',
        provider: integration.provider,
      };
    }),

  // Refresh Slack integration (fetch latest team info and update database)
  refreshSlackIntegration: protectedProcedure
    .input(z.object({
      integrationId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Get user's team memberships
      const userTeams = await ctx.db.teamUser.findMany({
        where: {
          userId: ctx.session.user.id,
        },
        select: {
          teamId: true,
        },
      });

      const teamIds = userTeams.map(membership => membership.teamId);

      // Verify the integration belongs to the user and is Slack
      const integration = await ctx.db.integration.findUnique({
        where: {
          id: input.integrationId,
          provider: 'slack',
          OR: [
            { userId: ctx.session.user.id }, // Personal integration
            ...(teamIds.length > 0 ? [{ teamId: { in: teamIds } }] : []), // Team integration
          ],
        },
        include: {
          credentials: true,
        },
      });

      if (!integration) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Slack integration not found or access denied',
        });
      }

      // Get the bot token
      const botTokenCredential = integration.credentials.find(c => c.keyType === 'BOT_TOKEN');
      if (!botTokenCredential) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'No bot token found for this Slack integration',
        });
      }

      // Test the connection and get latest team info
      const testResult = await testSlackConnection(botTokenCredential.key);
      if (!testResult.success) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Slack connection failed: ${testResult.error}`,
        });
      }

      const teamId = testResult.teamInfo?.team_id;
      const teamName = testResult.teamInfo?.team;

      if (!teamId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Could not retrieve team ID from Slack',
        });
      }

      // Update the team ID and team name in the database
      const teamIdCredential = integration.credentials.find(c => c.keyType === 'TEAM_ID');
      
      if (teamIdCredential) {
        // Update existing team ID
        await ctx.db.integrationCredential.update({
          where: { id: teamIdCredential.id },
          data: { key: teamId },
        });
      } else {
        // Create new team ID credential if it doesn't exist
        await ctx.db.integrationCredential.create({
          data: {
            key: teamId,
            keyType: 'TEAM_ID',
            isEncrypted: false,
            integrationId: integration.id,
          },
        });
      }

      // Update integration description with new team name
      await ctx.db.integration.update({
        where: { id: integration.id },
        data: {
          description: `Slack integration for ${teamName}`,
        },
      });

      return {
        success: true,
        teamId,
        teamName,
        message: `Successfully updated Slack integration for team "${teamName}"`,
      };
    }),

  // Get Fireflies API key for a specific user (used by webhook handler)
  getFirefliesApiKey: protectedProcedure
    .input(z.object({
      userId: z.string(),
    }))
    .query(async ({ ctx, input }) => {
      // Verify the user is requesting their own API key or is authorized
      if (ctx.session.user.id !== input.userId) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Access denied',
        });
      }

      // Get user's team memberships
      const userTeams = await ctx.db.teamUser.findMany({
        where: {
          userId: input.userId,
        },
        select: {
          teamId: true,
        },
      });

      const teamIds = userTeams.map(membership => membership.teamId);

      // Look for personal or team Fireflies integrations
      const integration = await ctx.db.integration.findFirst({
        where: {
          provider: 'fireflies',
          status: 'ACTIVE',
          OR: [
            { userId: input.userId }, // Personal integration
            ...(teamIds.length > 0 ? [{ teamId: { in: teamIds } }] : []), // Team integration
          ],
        },
        include: {
          credentials: {
            where: {
              keyType: 'API_KEY',
            },
            take: 1,
          },
        },
      });

      if (!integration || integration.credentials.length === 0) {
        return null;
      }

      return integration.credentials[0]!.key;
    }),

  // Get Slack OAuth URL for integration setup
  getSlackOAuthUrl: protectedProcedure
    .query(({ ctx }) => {
      const clientId = process.env.SLACK_CLIENT_ID;
      const redirectUri = process.env.SLACK_REDIRECT_URI || 'http://localhost:3000/api/auth/slack/callback';
      
      if (!clientId) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Slack client ID not configured',
        });
      }

      const scopes = [
        'app_mentions:read',
        'channels:history',
        'chat:write',
        'commands',
        'im:history',
        'im:read',
        'im:write',
        'users:read',
        'channels:read',
        'groups:read',
        'mpim:read'
      ].join(',');

      const state = ctx.session.user.id; // Use user ID as state for security
      
      const authUrl = `https://slack.com/oauth/v2/authorize?` +
        `client_id=${clientId}&` +
        `scope=${encodeURIComponent(scopes)}&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `state=${state}`;

      return {
        authUrl,
        scopes: scopes.split(','),
      };
    }),

  // Handle Slack OAuth callback
  handleSlackCallback: protectedProcedure
    .input(z.object({
      code: z.string(),
      state: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Verify state matches user ID
      if (input.state !== ctx.session.user.id) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Invalid state parameter',
        });
      }

      const clientId = process.env.SLACK_CLIENT_ID;
      const clientSecret = process.env.SLACK_CLIENT_SECRET;
      const redirectUri = process.env.SLACK_REDIRECT_URI || 'http://localhost:3000/api/auth/slack/callback';

      if (!clientId || !clientSecret) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Slack OAuth credentials not configured',
        });
      }

      try {
        // Exchange code for tokens
        const response = await fetch('https://slack.com/api/oauth.v2.access', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            code: input.code,
            redirect_uri: redirectUri,
          }),
        });

        const data = await response.json();

        if (!data.ok) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: data.error || 'OAuth exchange failed',
          });
        }

        return {
          accessToken: data.access_token,
          botToken: data.bot_token,
          scope: data.scope,
          botUserId: data.bot_user_id,
          appId: data.app_id, // Add app ID from OAuth response
          team: {
            id: data.team.id,
            name: data.team.name,
          },
        };
      } catch (error) {
        console.error('Slack OAuth callback error:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to exchange OAuth code',
        });
      }
    }),

  // Get integration details for editing
  getIntegrationDetails: protectedProcedure
    .input(z.object({
      integrationId: z.string(),
    }))
    .query(async ({ ctx, input }) => {
      // Get user's team memberships
      const userTeams = await ctx.db.teamUser.findMany({
        where: {
          userId: ctx.session.user.id,
        },
        select: {
          teamId: true,
        },
      });

      const teamIds = userTeams.map(membership => membership.teamId);

      // Get the integration and its credentials
      const integration = await ctx.db.integration.findUnique({
        where: {
          id: input.integrationId,
          OR: [
            { userId: ctx.session.user.id }, // Personal integration
            ...(teamIds.length > 0 ? [{ teamId: { in: teamIds } }] : []), // Team integration
          ],
        },
        include: {
          credentials: true,
          team: {
            select: {
              name: true,
            },
          },
        },
      });

      if (!integration) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Integration not found or access denied',
        });
      }

      // Extract credentials for safe return (don't expose sensitive values)
      const credentials: Record<string, boolean> = {};
      integration.credentials.forEach(cred => {
        credentials[cred.keyType] = true; // Just indicate presence, not actual values
      });

      // For APP_ID, we can return the actual value since it's not sensitive
      const appIdCredential = integration.credentials.find(c => c.keyType === 'APP_ID');

      return {
        id: integration.id,
        name: integration.name,
        description: integration.description,
        provider: integration.provider,
        status: integration.status,
        scope: integration.teamId ? 'team' as const : 'personal' as const,
        teamName: integration.team?.name || null,
        credentials,
        appId: appIdCredential?.key || '', // Safe to return APP_ID
      };
    }),

  // Update integration details
  updateIntegration: protectedProcedure
    .input(z.object({
      integrationId: z.string(),
      name: z.string().min(1).optional(),
      description: z.string().optional(),
      // Slack-specific updates
      appId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Get user's team memberships
      const userTeams = await ctx.db.teamUser.findMany({
        where: {
          userId: ctx.session.user.id,
        },
        select: {
          teamId: true,
        },
      });

      const teamIds = userTeams.map(membership => membership.teamId);

      // Verify the integration belongs to the user or their teams
      const integration = await ctx.db.integration.findUnique({
        where: {
          id: input.integrationId,
          OR: [
            { userId: ctx.session.user.id }, // Personal integration
            ...(teamIds.length > 0 ? [{ teamId: { in: teamIds } }] : []), // Team integration
          ],
        },
        include: {
          credentials: true,
        },
      });

      if (!integration) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Integration not found or access denied',
        });
      }

      // If it's a team integration, verify user has permission to edit
      if (integration.teamId) {
        const teamMember = await ctx.db.teamUser.findUnique({
          where: {
            userId_teamId: {
              userId: ctx.session.user.id,
              teamId: integration.teamId,
            },
          },
        });

        if (!teamMember || (teamMember.role !== 'owner' && teamMember.role !== 'admin')) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Only team owners and admins can edit team integrations',
          });
        }
      }

      // Update integration basic info
      const updateData: any = {};
      if (input.name !== undefined) updateData.name = input.name;
      if (input.description !== undefined) updateData.description = input.description;

      if (Object.keys(updateData).length > 0) {
        await ctx.db.integration.update({
          where: { id: input.integrationId },
          data: updateData,
        });
      }

      // Handle Slack-specific updates
      if (input.appId !== undefined && integration.provider === 'slack') {
        const existingAppIdCredential = integration.credentials.find(c => c.keyType === 'APP_ID');
        
        if (input.appId.trim().length === 0) {
          // Remove APP_ID if empty string provided
          if (existingAppIdCredential) {
            await ctx.db.integrationCredential.delete({
              where: { id: existingAppIdCredential.id },
            });
          }
        } else {
          // Add or update APP_ID
          if (existingAppIdCredential) {
            await ctx.db.integrationCredential.update({
              where: { id: existingAppIdCredential.id },
              data: { key: input.appId },
            });
          } else {
            await ctx.db.integrationCredential.create({
              data: {
                key: input.appId,
                keyType: 'APP_ID',
                isEncrypted: false,
                integrationId: integration.id,
              },
            });
          }
        }
      }

      return { success: true };
    }),

});