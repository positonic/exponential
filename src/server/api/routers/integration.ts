import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";

const integrationSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  provider: z.string(),
  status: z.string(),
  description: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

const integrationCredentialSchema = z.object({
  id: z.string(),
  keyType: z.string(),
  expiresAt: z.date().nullable(),
  isEncrypted: z.boolean(),
  createdAt: z.date(),
});

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
        query: `query { 
          user { 
            id 
            name 
            email 
          } 
        }`,
      }),
    });

    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}` };
    }

    const data = await response.json();
    
    if (data.errors) {
      return { success: false, error: data.errors[0]?.message || 'GraphQL error' };
    }

    return { success: true };
  } catch (error) {
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
      provider: z.enum(['fireflies', 'github', 'slack', 'notion', 'webhook']),
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
      // Get the integration and its API key
      const integration = await ctx.db.integration.findUnique({
        where: {
          id: input.integrationId,
          userId: ctx.session.user.id,
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

      if (!integration) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Integration not found or access denied',
        });
      }

      if (integration.credentials.length === 0) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'No API key found for this integration',
        });
      }

      const apiKey = integration.credentials[0]!.key;

      // Test based on provider
      if (integration.provider === 'fireflies') {
        const result = await testFirefliesConnection(apiKey);
        return {
          success: result.success,
          error: result.error,
          provider: integration.provider,
        };
      }

      return {
        success: false,
        error: 'Connection testing not implemented for this provider',
        provider: integration.provider,
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
});