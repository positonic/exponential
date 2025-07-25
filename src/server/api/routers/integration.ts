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
  // List all integrations for the current user
  listIntegrations: protectedProcedure
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
    })))
    .query(async ({ ctx }) => {
      const integrations = await ctx.db.integration.findMany({
        where: {
          userId: ctx.session.user.id,
        },
        include: {
          credentials: {
            select: {
              id: true,
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
      }));
    }),

  // Create a new integration
  createIntegration: protectedProcedure
    .input(z.object({
      name: z.string().min(1),
      provider: z.enum(['fireflies', 'exponential-plugin', 'github', 'slack', 'notion', 'webhook']),
      description: z.string().optional(),
      apiKey: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
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
            userId: ctx.session.user.id,
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
      teamId: z.string().optional(), // Make optional - we'll get it from the token
      teamName: z.string().optional(), // Make optional - we'll get it from the token
    }))
    .mutation(async ({ ctx, input }) => {
      // Test the bot token
      const testResult = await testSlackConnection(input.botToken);
      if (!testResult.success) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Slack connection failed: ${testResult.error}`,
        });
      }

      // Get team info from the token test result
      const teamId = testResult.teamInfo?.team_id;
      const teamName = testResult.teamInfo?.team || input.teamName || 'Unknown Team';
      
      if (!teamId) {
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
            userId: ctx.session.user.id,
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
            key: teamId,
            keyType: 'TEAM_ID',
            isEncrypted: false,
            integrationId: integration.id,
          },
        ];

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
      // Verify the integration belongs to the user
      const integration = await ctx.db.integration.findUnique({
        where: {
          id: input.integrationId,
          userId: ctx.session.user.id,
        },
      });

      if (!integration) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Integration not found or access denied',
        });
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
      // Get the integration and its credentials
      const integration = await ctx.db.integration.findUnique({
        where: {
          id: input.integrationId,
          userId: ctx.session.user.id,
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
      // Verify the integration belongs to the user and is Slack
      const integration = await ctx.db.integration.findUnique({
        where: {
          id: input.integrationId,
          userId: ctx.session.user.id,
          provider: 'slack',
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

      const integration = await ctx.db.integration.findFirst({
        where: {
          userId: input.userId,
          provider: 'fireflies',
          status: 'ACTIVE',
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
});