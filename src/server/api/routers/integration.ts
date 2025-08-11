import { z } from "zod";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";
import { MondayService } from "~/server/services/MondayService";
import { WhatsAppVerificationService } from "~/server/services/whatsapp/VerificationService";

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
    
    // Fetch properties for each database
    const databasesWithProperties = await Promise.all(
      data.results.map(async (db: any) => {
        try {
          // Fetch the database schema to get properties
          const dbResponse = await fetch(`https://api.notion.com/v1/databases/${db.id}`, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Notion-Version': '2022-06-28',
            },
          });
          
          if (!dbResponse.ok) {
            console.error(`Failed to fetch database ${db.id} properties`);
            return {
              id: db.id,
              title: db.title?.[0]?.plain_text || 'Untitled Database',
              url: db.url,
              properties: {},
            };
          }
          
          const dbData = await dbResponse.json();
          
          // Transform properties to a simpler format
          const properties: Record<string, any> = {};
          if (dbData.properties) {
            Object.entries(dbData.properties).forEach(([key, prop]: [string, any]) => {
              properties[key] = {
                id: prop.id,
                name: prop.name,
                type: prop.type,
              };
            });
          }
          
          return {
            id: db.id,
            title: db.title?.[0]?.plain_text || 'Untitled Database',
            url: db.url,
            properties,
          };
        } catch (error) {
          console.error(`Error fetching database ${db.id}:`, error);
          return {
            id: db.id,
            title: db.title?.[0]?.plain_text || 'Untitled Database',
            url: db.url,
            properties: {},
          };
        }
      })
    );
    
    return { 
      success: true, 
      databases: databasesWithProperties
    };
  } catch (error) {
    console.error('Notion databases fetch error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to fetch databases' };
  }
}

// Test Monday.com API connection
async function testMondayConnection(apiKey: string): Promise<{ success: boolean; error?: string; userInfo?: any }> {
  try {
    const mondayService = new MondayService(apiKey);
    const result = await mondayService.testConnection();
    
    if (!result.success) {
      return { success: false, error: result.error };
    }

    return {
      success: true,
      userInfo: result.user,
    };
  } catch (error) {
    console.error('Monday.com connection test error:', error);
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

// Test WhatsApp API connection
async function testWhatsAppConnection(
  accessToken: string, 
  phoneNumberId: string
): Promise<{ success: boolean; error?: string; phoneInfo?: any }> {
  try {
    // Test by fetching phone number details from Meta Graph API
    const response = await fetch(
      `https://graph.facebook.com/v18.0/${phoneNumberId}?fields=display_phone_number,verified_name,quality_rating`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      return { 
        success: false, 
        error: errorData.error?.message || `HTTP ${response.status}: ${response.statusText}` 
      };
    }

    const data = await response.json();
    
    return { 
      success: true, 
      phoneInfo: {
        display_phone_number: data.display_phone_number,
        verified_name: data.verified_name,
        quality_rating: data.quality_rating
      }
    };
  } catch (error) {
    console.error('WhatsApp connection test error:', error);
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
      provider: z.enum(['fireflies', 'exponential-plugin', 'github', 'slack', 'notion', 'webhook', 'monday']),
      description: z.string().optional(),
      apiKey: z.string().min(1),
      teamId: z.string().optional(),
      allowTeamMemberAccess: z.boolean().optional().default(false),
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

      // Test connection for Monday.com
      if (input.provider === 'monday') {
        const testResult = await testMondayConnection(input.apiKey);
        if (!testResult.success) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Monday.com connection failed: ${testResult.error}`,
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
            allowTeamMemberAccess: input.allowTeamMemberAccess,
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
      allowTeamMemberAccess: z.boolean().optional().default(false), // Allow team members to access this integration
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
            allowTeamMemberAccess: input.allowTeamMemberAccess,
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

  // Create WhatsApp integration
  createWhatsAppIntegration: protectedProcedure
    .input(z.object({
      name: z.string().min(1),
      description: z.string().optional(),
      accessToken: z.string().min(1),
      phoneNumberId: z.string().min(1),
      businessAccountId: z.string().min(1),
      webhookVerifyToken: z.string().min(1),
      appTeamId: z.string().optional(), // Optional team ID for the app (our internal teams)
      allowTeamMemberAccess: z.boolean().optional().default(false), // Allow team members to access this integration
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

      // Test the WhatsApp connection
      const testResult = await testWhatsAppConnection(input.accessToken, input.phoneNumberId);
      if (!testResult.success) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `WhatsApp connection failed: ${testResult.error}`,
        });
      }

      try {
        // Create the integration
        const integration = await ctx.db.integration.create({
          data: {
            name: input.name,
            type: 'OAUTH',
            provider: 'whatsapp',
            description: input.description || `WhatsApp Business integration`,
            userId: input.appTeamId ? null : ctx.session.user.id, // Personal if no app team
            teamId: input.appTeamId || null, // App team if provided
            allowTeamMemberAccess: input.allowTeamMemberAccess,
            status: 'ACTIVE',
          },
        });

        // Create the WhatsApp config
        const whatsappConfig = await ctx.db.whatsAppConfig.create({
          data: {
            phoneNumberId: input.phoneNumberId,
            businessAccountId: input.businessAccountId,
            webhookVerifyToken: input.webhookVerifyToken,
            displayPhoneNumber: testResult.phoneInfo?.display_phone_number || null,
            businessName: testResult.phoneInfo?.verified_name || 'WhatsApp Business',
            integrationId: integration.id,
          },
        });

        // Create the credentials
        const credentials = [
          {
            key: input.accessToken,
            keyType: 'ACCESS_TOKEN',
            isEncrypted: false,
            integrationId: integration.id,
          },
          {
            key: input.phoneNumberId,
            keyType: 'PHONE_NUMBER_ID',
            isEncrypted: false,
            integrationId: integration.id,
          },
          {
            key: input.businessAccountId,
            keyType: 'BUSINESS_ACCOUNT_ID',
            isEncrypted: false,
            integrationId: integration.id,
          },
          {
            key: input.webhookVerifyToken,
            keyType: 'WEBHOOK_VERIFY_TOKEN',
            isEncrypted: false,
            integrationId: integration.id,
          },
        ];

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
          },
          whatsappConfig: {
            id: whatsappConfig.id,
            phoneNumber: whatsappConfig.displayPhoneNumber || input.phoneNumberId,
            displayName: whatsappConfig.businessName,
            phoneNumberId: whatsappConfig.phoneNumberId,
            businessAccountId: whatsappConfig.businessAccountId,
          },
        };
      } catch (error) {
        console.error('Failed to create WhatsApp integration:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to create WhatsApp integration',
        });
      }
    }),

  // Get WhatsApp config by phone number ID (PUBLIC for webhook)
  getWhatsAppConfigByPhoneNumberId: publicProcedure
    .input(z.object({
      phoneNumberId: z.string(),
    }))
    .query(async ({ ctx, input }) => {
      const config = await ctx.db.whatsAppConfig.findFirst({
        where: {
          phoneNumberId: input.phoneNumberId,
          integration: {
            status: 'ACTIVE',
          },
        },
        include: {
          integration: {
            include: {
              credentials: true,
            },
          },
        },
      });

      if (!config) {
        return null;
      }

      // For webhook access, we don't check user permissions
      // The webhook is authenticated via signature verification

      return config;
    }),

  // Store WhatsApp message (PUBLIC for webhook)
  storeWhatsAppMessage: publicProcedure
    .input(z.object({
      configId: z.string(),
      messageId: z.string(),
      phoneNumber: z.string(),
      direction: z.enum(['INBOUND', 'OUTBOUND']),
      messageType: z.string(),
      content: z.any(),
      status: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      // For now, we'll just log the message
      // In a real implementation, you'd store this in a WhatsAppMessageHistory table
      console.log('Storing WhatsApp message:', input);
      
      // TODO: Implement actual message storage
      return { success: true };
    }),

  // Update WhatsApp message status (PUBLIC for webhook)
  updateWhatsAppMessageStatus: publicProcedure
    .input(z.object({
      messageId: z.string(),
      status: z.string(),
      statusDetails: z.object({
        timestamp: z.string(),
        recipient: z.string(),
        errors: z.any().optional(),
      }).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Log the status update
      console.log('Updating WhatsApp message status:', input);
      
      // TODO: Implement actual status update in database
      // In a real implementation, you'd update the message status in a WhatsAppMessageHistory table
      
      return { success: true };
    }),

  // Map WhatsApp phone number to user
  mapWhatsAppPhoneToUser: protectedProcedure
    .input(z.object({
      integrationId: z.string(),
      phoneNumber: z.string().regex(
        /^\+?[1-9]\d{1,14}$/,
        'Invalid phone number format. Use international format (e.g., +1234567890)'
      ),
      userId: z.string().optional(), // If not provided, uses current user
    }))
    .mutation(async ({ ctx, input }) => {
      // Verify user has access to this integration
      const integration = await ctx.db.integration.findFirst({
        where: {
          id: input.integrationId,
          OR: [
            { userId: ctx.session.user.id },
            {
              AND: [
                { teamId: { not: null } },
                {
                  team: {
                    users: {
                      some: {
                        userId: ctx.session.user.id,
                      },
                    },
                  },
                },
              ],
            },
          ],
        },
      });

      if (!integration) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Integration not found or access denied',
        });
      }

      const targetUserId = input.userId || ctx.session.user.id;

      // Verify the target user exists and has access
      if (input.userId) {
        const targetUser = await ctx.db.user.findUnique({
          where: { id: targetUserId },
        });
        
        if (!targetUser) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Target user not found',
          });
        }
        
        // If integration is team-based, verify target user is in the team
        if (integration.teamId) {
          const isTeamMember = await ctx.db.teamUser.findFirst({
            where: {
              teamId: integration.teamId,
              userId: targetUserId,
            },
          });
          
          if (!isTeamMember) {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message: 'Target user is not a member of the team',
            });
          }
        }
      }

      // Check if phone number is already mapped to a different user
      const existingMapping = await ctx.db.integrationUserMapping.findUnique({
        where: {
          integrationId_externalUserId: {
            integrationId: input.integrationId,
            externalUserId: input.phoneNumber,
          },
        },
      });

      if (existingMapping && existingMapping.userId !== targetUserId) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'This phone number is already mapped to another user',
        });
      }

      // Create or update the mapping
      const mapping = await ctx.db.integrationUserMapping.upsert({
        where: {
          integrationId_externalUserId: {
            integrationId: input.integrationId,
            externalUserId: input.phoneNumber,
          },
        },
        create: {
          integrationId: input.integrationId,
          externalUserId: input.phoneNumber,
          userId: targetUserId,
        },
        update: {
          userId: targetUserId,
        },
      });

      return mapping;
    }),

  // Get WhatsApp phone number mappings
  getWhatsAppPhoneMappings: protectedProcedure
    .input(z.object({
      integrationId: z.string(),
    }))
    .query(async ({ ctx, input }) => {
      // Verify user has access
      const integration = await ctx.db.integration.findFirst({
        where: {
          id: input.integrationId,
          OR: [
            { userId: ctx.session.user.id },
            {
              AND: [
                { teamId: { not: null } },
                {
                  team: {
                    users: {
                      some: {
                        userId: ctx.session.user.id,
                      },
                    },
                  },
                },
              ],
            },
          ],
        },
      });

      if (!integration) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Integration not found or access denied',
        });
      }

      const mappings = await ctx.db.integrationUserMapping.findMany({
        where: {
          integrationId: input.integrationId,
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
            },
          },
        },
      });

      // If this is a team integration, get role information
      if (integration.teamId) {
        const teamMembers = await ctx.db.teamUser.findMany({
          where: {
            teamId: integration.teamId,
            userId: {
              in: mappings.map(m => m.user.id),
            },
          },
          select: {
            userId: true,
            role: true,
          },
        });

        // Create a map for quick lookup
        const roleMap = new Map(teamMembers.map(m => [m.userId, m.role]));

        // Add role information to mappings
        return mappings.map(mapping => ({
          ...mapping,
          user: {
            ...mapping.user,
            role: roleMap.get(mapping.user.id),
          },
        }));
      }

      return mappings;
    }),

  // Remove WhatsApp phone number mapping
  removeWhatsAppPhoneMapping: protectedProcedure
    .input(z.object({
      integrationId: z.string(),
      phoneNumber: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Verify user has access to this integration
      const integration = await ctx.db.integration.findFirst({
        where: {
          id: input.integrationId,
          OR: [
            { userId: ctx.session.user.id },
            {
              AND: [
                { teamId: { not: null } },
                {
                  team: {
                    users: {
                      some: {
                        userId: ctx.session.user.id,
                      },
                    },
                  },
                },
              ],
            },
          ],
        },
      });

      if (!integration) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Integration not found or access denied',
        });
      }

      // Delete the mapping
      const deleted = await ctx.db.integrationUserMapping.delete({
        where: {
          integrationId_externalUserId: {
            integrationId: input.integrationId,
            externalUserId: input.phoneNumber,
          },
        },
      });

      return { success: true, deleted };
    }),

  // Get user's WhatsApp permissions for an integration
  getWhatsAppPermissions: protectedProcedure
    .input(z.object({
      integrationId: z.string(),
    }))
    .query(async ({ ctx, input }) => {
      const { WhatsAppPermissionService } = await import('~/server/services/whatsapp/PermissionService');
      
      const permissions = await WhatsAppPermissionService.getUserPermissions(
        ctx.session.user.id,
        input.integrationId
      );
      
      return permissions.map(p => p.toString());
    }),

  // Get team conversations (filtered by permissions)
  getWhatsAppTeamConversations: protectedProcedure
    .input(z.object({
      integrationId: z.string(),
    }))
    .query(async ({ ctx, input }) => {
      const { WhatsAppPermissionService } = await import('~/server/services/whatsapp/PermissionService');
      
      // Get WhatsApp config
      const config = await ctx.db.whatsAppConfig.findFirst({
        where: {
          integration: {
            id: input.integrationId,
            OR: [
              { userId: ctx.session.user.id },
              {
                AND: [
                  { teamId: { not: null } },
                  {
                    team: {
                      users: {
                        some: {
                          userId: ctx.session.user.id,
                        },
                      },
                    },
                  },
                ],
              },
            ],
          },
        },
      });

      if (!config) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'WhatsApp configuration not found or access denied',
        });
      }

      // Get all conversations for this config
      const allConversations = await ctx.db.whatsAppConversation.findMany({
        where: {
          whatsappConfigId: config.id,
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
            },
          },
        },
        orderBy: {
          lastMessageAt: 'desc',
        },
      });

      // Filter conversations based on permissions
      const filteredConversations = await WhatsAppPermissionService.filterConversations(
        ctx.session.user.id,
        input.integrationId,
        allConversations
      );

      // If team integration, add role information
      const integration = await ctx.db.integration.findUnique({
        where: { id: input.integrationId },
        select: { teamId: true },
      });

      if (integration?.teamId) {
        const userIds = filteredConversations
          .map(c => c.userId)
          .filter(Boolean) as string[];

        const teamMembers = await ctx.db.teamUser.findMany({
          where: {
            teamId: integration.teamId,
            userId: { in: userIds },
          },
          select: {
            userId: true,
            role: true,
          },
        });

        const roleMap = new Map(teamMembers.map(m => [m.userId, m.role]));

        return {
          conversations: filteredConversations.map(conv => ({
            ...conv,
            user: conv.user ? {
              ...conv.user,
              role: roleMap.get(conv.user.id),
            } : null,
          })),
        };
      }

      return { conversations: filteredConversations };
    }),

  // Get security events for an integration
  getWhatsAppSecurityEvents: protectedProcedure
    .input(z.object({
      integrationId: z.string(),
      eventType: z.string().optional(),
      severity: z.string().optional(),
      resolved: z.boolean().optional(),
      startDate: z.date().optional(),
      endDate: z.date().optional(),
      limit: z.number().min(1).max(100).default(50),
    }))
    .query(async ({ ctx, input }) => {
      // Verify user has access to this integration
      const hasAccess = await ctx.db.integration.findFirst({
        where: {
          id: input.integrationId,
          OR: [
            { userId: ctx.session.user.id },
            {
              AND: [
                { teamId: { not: null } },
                {
                  team: {
                    users: {
                      some: {
                        userId: ctx.session.user.id,
                        role: { in: ['owner', 'admin'] }, // Only admins can view security events
                      },
                    },
                  },
                },
              ],
            },
          ],
        },
      });

      if (!hasAccess) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to view security events',
        });
      }

      const { WhatsAppSecurityAuditService } = await import('~/server/services/whatsapp/SecurityAuditService');
      
      const events = await WhatsAppSecurityAuditService.getSecurityEvents(
        input.integrationId,
        {
          eventTypes: input.eventType ? [input.eventType as any] : undefined,
          severity: input.severity ? [input.severity] : undefined,
          resolved: input.resolved,
          startDate: input.startDate,
          endDate: input.endDate,
          limit: input.limit,
        }
      );

      return events;
    }),

  // Get security report for an integration
  getWhatsAppSecurityReport: protectedProcedure
    .input(z.object({
      integrationId: z.string(),
      startDate: z.date().optional(),
      endDate: z.date().optional(),
    }))
    .query(async ({ ctx, input }) => {
      // Verify user has admin access
      const hasAccess = await ctx.db.integration.findFirst({
        where: {
          id: input.integrationId,
          OR: [
            { userId: ctx.session.user.id },
            {
              AND: [
                { teamId: { not: null } },
                {
                  team: {
                    users: {
                      some: {
                        userId: ctx.session.user.id,
                        role: { in: ['owner', 'admin'] },
                      },
                    },
                  },
                },
              ],
            },
          ],
        },
      });

      if (!hasAccess) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to view security reports',
        });
      }

      const { WhatsAppSecurityAuditService } = await import('~/server/services/whatsapp/SecurityAuditService');
      
      const startDate = input.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // Default to last 30 days
      const endDate = input.endDate || new Date();
      
      const report = await WhatsAppSecurityAuditService.generateSecurityReport(
        input.integrationId,
        startDate,
        endDate
      );

      return report;
    }),

  // Request WhatsApp verification code
  requestWhatsAppVerification: protectedProcedure
    .input(z.object({
      integrationId: z.string(),
      phoneNumber: z.string().regex(
        /^\+?[1-9]\d{1,14}$/,
        'Invalid phone number format'
      ),
    }))
    .mutation(async ({ ctx, input }) => {
      // Verify integration access
      const integration = await ctx.db.integration.findFirst({
        where: {
          id: input.integrationId,
          OR: [
            { userId: ctx.session.user.id },
            {
              AND: [
                { teamId: { not: null } },
                {
                  team: {
                    users: {
                      some: {
                        userId: ctx.session.user.id,
                      },
                    },
                  },
                },
              ],
            },
          ],
        },
        include: {
          whatsappConfig: true,
        },
      });

      if (!integration || !integration.whatsappConfig) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'WhatsApp integration not found',
        });
      }

      // Generate verification code
      const code = await WhatsAppVerificationService.createVerificationCode(
        input.phoneNumber,
        ctx.session.user.id,
        input.integrationId
      );

      // Send code via WhatsApp
      try {
        const message = WhatsAppVerificationService.formatVerificationMessage(code);
        
        // TODO: Actually send the message via WhatsApp
        // For now, we'll return the code in development
        if (process.env.NODE_ENV === 'development') {
          console.log(`Verification code for ${input.phoneNumber}: ${code}`);
          return { 
            success: true, 
            message: 'Verification code sent',
            // Only include code in development
            debugCode: code 
          };
        }

        // In production, send via WhatsApp API
        // await sendWhatsAppMessage(integration.whatsappConfig.id, input.phoneNumber, message);
        
        return { success: true, message: 'Verification code sent to your WhatsApp' };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to send verification code',
        });
      }
    }),

  // Verify WhatsApp phone number
  verifyWhatsAppPhone: protectedProcedure
    .input(z.object({
      integrationId: z.string(),
      phoneNumber: z.string(),
      code: z.string().length(6),
    }))
    .mutation(async ({ ctx, input }) => {
      // Verify the code
      const result = await WhatsAppVerificationService.verifyCode(
        input.phoneNumber,
        input.integrationId,
        input.code
      );

      if (!result.valid) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: result.error || 'Invalid verification code',
        });
      }

      // Create the phone mapping
      const mapping = await ctx.db.integrationUserMapping.upsert({
        where: {
          integrationId_externalUserId: {
            integrationId: input.integrationId,
            externalUserId: input.phoneNumber,
          },
        },
        create: {
          integrationId: input.integrationId,
          externalUserId: input.phoneNumber,
          userId: result.userId!,
        },
        update: {
          userId: result.userId!,
        },
      });

      return { 
        success: true, 
        message: 'Phone number verified and linked successfully',
        mapping 
      };
    }),

  // Get verification status
  getVerificationStatus: protectedProcedure
    .input(z.object({
      integrationId: z.string(),
      phoneNumber: z.string(),
    }))
    .query(async ({ ctx, input }) => {
      return WhatsAppVerificationService.getVerificationStatus(
        input.phoneNumber,
        input.integrationId
      );
    }),

  // Get WhatsApp analytics
  getWhatsAppAnalytics: protectedProcedure
    .input(z.object({
      integrationId: z.string(),
      startDate: z.date().optional(),
      endDate: z.date().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const { analyticsService } = await import('~/server/services/whatsapp/AnalyticsService');
      
      // Get WhatsApp config
      const config = await ctx.db.whatsAppConfig.findFirst({
        where: {
          integrationId: input.integrationId,
          integration: {
            OR: [
              { userId: ctx.session.user.id },
              {
                team: {
                  members: {
                    some: {
                      userId: ctx.session.user.id,
                    },
                  },
                },
              },
            ],
          },
        },
      });

      if (!config) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'WhatsApp configuration not found',
        });
      }

      const startDate = input.startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const endDate = input.endDate || new Date();

      return analyticsService.getAnalyticsSummary(config.id, startDate, endDate);
    }),

  // Get WhatsApp health status
  getWhatsAppHealth: protectedProcedure
    .input(z.object({
      integrationId: z.string(),
    }))
    .query(async ({ _ctx, _input }) => {
      // Make internal API call to health endpoint
      const response = await fetch(`${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/webhooks/whatsapp/health`);
      return response.json();
    }),

  // Get WhatsApp worker status
  getWhatsAppWorkerStatus: protectedProcedure
    .input(z.object({
      integrationId: z.string(),
    }))
    .query(async ({ _ctx, _input }) => {
      // Make internal API call to worker status endpoint
      const response = await fetch(`${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/workers/whatsapp`);
      return response.json();
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

      if (integration.provider === 'monday') {
        const apiKeyCredential = integration.credentials.find(c => c.keyType === 'API_KEY');
        if (!apiKeyCredential) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'No API key found for this Monday.com integration',
          });
        }

        const result = await testMondayConnection(apiKeyCredential.key);
        if (!result.success) {
          return {
            success: result.success,
            error: result.error,
            provider: integration.provider,
          };
        }

        // Also fetch boards with columns for Monday.com
        const mondayService = new MondayService(apiKeyCredential.key);
        let boardsWithColumns: Array<any> = [];
        try {
          boardsWithColumns = await mondayService.getBoardsWithColumns();
        } catch (error) {
          console.error('Failed to fetch Monday.com boards:', error);
          boardsWithColumns = [];
        }

        return {
          success: result.success,
          error: result.error,
          provider: integration.provider,
          userInfo: result.userInfo,
          boards: boardsWithColumns,
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
        allowTeamMemberAccess: integration.allowTeamMemberAccess,
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
      // Team access control
      allowTeamMemberAccess: z.boolean().optional(),
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
      if (input.allowTeamMemberAccess !== undefined) updateData.allowTeamMemberAccess = input.allowTeamMemberAccess;

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

  // SLACK REGISTRATION ENDPOINTS

  // Validate a Slack registration token (public - no auth required)
  validateSlackRegistrationToken: publicProcedure
    .input(z.object({
      token: z.string(),
    }))
    .query(async ({ ctx, input }) => {
      if (!input.token || input.token.length < 10) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Invalid token format'
        });
      }

      const registrationToken = await ctx.db.slackRegistrationToken.findUnique({
        where: { token: input.token },
        include: {
          integration: {
            include: {
              team: true
            }
          }
        }
      });

      if (!registrationToken) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Registration token not found'
        });
      }

      // Check if token is expired
      if (registrationToken.expiresAt < new Date()) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Registration token has expired'
        });
      }

      // Check if token has already been used
      if (registrationToken.usedAt) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Registration token has already been used'
        });
      }

      return {
        slackUserId: registrationToken.slackUserId,
        integrationId: registrationToken.integrationId,
        teamName: registrationToken.integration.team?.name || null,
        teamId: registrationToken.teamId,
        expiresAt: registrationToken.expiresAt.toISOString(),
      };
    }),

  // Complete Slack registration (requires authentication)
  completeSlackRegistration: protectedProcedure
    .input(z.object({
      token: z.string(),
      userId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Verify the provided userId matches the session
      if (input.userId !== userId) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'User ID mismatch'
        });
      }

      const registrationToken = await ctx.db.slackRegistrationToken.findUnique({
        where: { token: input.token },
        include: {
          integration: {
            include: {
              team: {
                include: {
                  members: {
                    where: {
                      userId: userId
                    }
                  }
                }
              }
            }
          }
        }
      });

      if (!registrationToken) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Registration token not found'
        });
      }

      // Check if token is expired
      if (registrationToken.expiresAt < new Date()) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Registration token has expired'
        });
      }

      // Check if token has already been used
      if (registrationToken.usedAt) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Registration token has already been used'
        });
      }

      // Verify user is a team member (if integration has a team)
      if (registrationToken.integration.team) {
        const isTeamMember = registrationToken.integration.team.members.length > 0;
        if (!isTeamMember) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'You must be a team member to connect this Slack integration'
          });
        }
      }

      // Check if this Slack user is already mapped to someone else
      const existingMapping = await ctx.db.integrationUserMapping.findFirst({
        where: {
          integrationId: registrationToken.integrationId,
          externalUserId: registrationToken.slackUserId
        }
      });

      if (existingMapping) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'This Slack account is already connected to another user'
        });
      }

      // Perform the registration in a transaction
      const result = await ctx.db.$transaction(async (tx) => {
        // Mark the token as used
        await tx.slackRegistrationToken.update({
          where: { id: registrationToken.id },
          data: {
            usedAt: new Date(),
            usedByUserId: userId
          }
        });

        // Create the user mapping
        const mapping = await tx.integrationUserMapping.create({
          data: {
            integrationId: registrationToken.integrationId,
            externalUserId: registrationToken.slackUserId,
            userId: userId
          }
        });

        return mapping;
      });

      console.log(`✅ [Slack Registration] User ${ctx.session.user.email} connected Slack ${registrationToken.slackUserId}`);

      return {
        success: true,
        slackUserId: registrationToken.slackUserId,
        mappingId: result.id
      };
    }),

  // Get user's Slack connections (for settings page)
  getUserSlackConnections: protectedProcedure
    .query(async ({ ctx }) => {
      const connections = await ctx.db.integrationUserMapping.findMany({
        where: {
          userId: ctx.session.user.id,
          integration: {
            provider: 'slack'
          }
        },
        include: {
          integration: {
            include: {
              team: true
            }
          }
        }
      });

      return connections.map(conn => ({
        id: conn.id,
        slackUserId: conn.externalUserId,
        teamName: conn.integration.team?.name || 'Personal',
        connectedAt: conn.createdAt,
        integrationName: conn.integration.name
      }));
    }),

  // Disconnect Slack account
  disconnectSlack: protectedProcedure
    .input(z.object({
      mappingId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const mapping = await ctx.db.integrationUserMapping.findFirst({
        where: {
          id: input.mappingId,
          userId: ctx.session.user.id, // Ensure user owns this mapping
          integration: {
            provider: 'slack'
          }
        }
      });

      if (!mapping) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Slack connection not found'
        });
      }

      await ctx.db.integrationUserMapping.delete({
        where: { id: mapping.id }
      });

      console.log(`🔌 [Slack Disconnect] User ${ctx.session.user.email} disconnected Slack ${mapping.externalUserId}`);

      return { success: true };
    }),

  // Admin endpoints for managing all WhatsApp integrations
  getAllWhatsAppIntegrations: protectedProcedure
    .query(async ({ ctx }) => {
      // Only allow admin users (you might want to add proper role checking)
      const integrations = await ctx.db.integration.findMany({
        where: {
          provider: 'whatsapp',
        },
        include: {
          whatsapp: true,
          _count: {
            select: {
              userMappings: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      return integrations;
    }),

  getAllWhatsAppUserMappings: protectedProcedure
    .query(async ({ ctx }) => {
      const mappings = await ctx.db.integrationUserMapping.findMany({
        where: {
          integration: {
            provider: 'whatsapp',
          },
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          integration: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      return mappings;
    }),

  getSystemWhatsAppAnalytics: protectedProcedure
    .query(async ({ ctx }) => {
      // Get system-wide WhatsApp analytics
      const today = new Date();
      const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      
      // Count messages today across all integrations
      const todayMessages = await ctx.db.whatsAppMessage.count({
        where: {
          createdAt: {
            gte: startOfToday,
          },
        },
      });

      // Get system health status
      const systemHealth = 'healthy'; // This would come from your monitoring system

      // Count active integrations
      const activeIntegrations = await ctx.db.integration.count({
        where: {
          provider: 'whatsapp',
          status: 'ACTIVE',
        },
      });

      // Count total users
      const totalUsers = await ctx.db.integrationUserMapping.count({
        where: {
          integration: {
            provider: 'whatsapp',
          },
        },
      });

      return {
        todayMessages,
        systemHealth,
        activeIntegrations,
        totalUsers,
      };
    }),

  createWhatsAppIntegration: protectedProcedure
    .input(z.object({
      name: z.string(),
      businessAccountId: z.string(),
      phoneNumberId: z.string(),
      displayPhoneNumber: z.string().optional(),
      businessName: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      // Create new integration
      const integration = await ctx.db.integration.create({
        data: {
          name: input.name,
          provider: 'whatsapp',
          status: 'PENDING',
          userId: ctx.session.user.id,
          whatsapp: {
            create: {
              businessAccountId: input.businessAccountId,
              phoneNumberId: input.phoneNumberId,
              displayPhoneNumber: input.displayPhoneNumber,
              businessName: input.businessName,
              webhookVerifyToken: `whatsapp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            },
          },
        },
        include: {
          whatsapp: true,
        },
      });

      return integration;
    }),

  deleteWhatsAppIntegration: protectedProcedure
    .input(z.object({
      integrationId: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      // Delete integration and all related data
      const integration = await ctx.db.integration.findUnique({
        where: { id: input.integrationId },
        include: { whatsapp: true },
      });

      if (!integration) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Integration not found',
        });
      }

      // Delete in transaction to ensure consistency
      await ctx.db.$transaction(async (tx) => {
        // Delete user mappings
        await tx.integrationUserMapping.deleteMany({
          where: { integrationId: input.integrationId },
        });

        // Delete WhatsApp-specific data
        if (integration.whatsapp) {
          await tx.whatsAppMessage.deleteMany({
            where: { configId: integration.whatsapp.id },
          });

          await tx.whatsAppConversation.deleteMany({
            where: { whatsappConfigId: integration.whatsapp.id },
          });

          await tx.whatsAppConfig.delete({
            where: { id: integration.whatsapp.id },
          });
        }

        // Delete credentials
        await tx.integrationCredential.deleteMany({
          where: { integrationId: input.integrationId },
        });

        // Delete integration
        await tx.integration.delete({
          where: { id: input.integrationId },
        });
      });

      return { success: true };
    }),

  updateWhatsAppIntegrationStatus: protectedProcedure
    .input(z.object({
      integrationId: z.string(),
      status: z.enum(['ACTIVE', 'INACTIVE', 'PENDING', 'ERROR']),
    }))
    .mutation(async ({ input, ctx }) => {
      const integration = await ctx.db.integration.update({
        where: { id: input.integrationId },
        data: { status: input.status },
      });

      return integration;
    }),

});