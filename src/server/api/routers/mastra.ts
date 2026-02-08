import { z } from "zod";
import { createTRPCRouter, publicProcedure, protectedProcedure } from "~/server/api/trpc";
import OpenAI from "openai";
import { TRPCError } from "@trpc/server";
// import { mastraClient } from "~/lib/mastra";
import { PRIORITY_VALUES } from "~/types/priority";
import { getKnowledgeService } from "~/server/services/KnowledgeService";
import { generateAgentJWT, generateJWT } from "~/server/utils/jwt";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { testFirefliesConnection } from "./integration";
import { GoogleCalendarService } from "~/server/services/GoogleCalendarService";
import { decryptBuffer, encryptString } from "~/server/utils/encryption";
import { decryptCredential } from "~/server/utils/credentialHelper";
import type { PrismaClient } from "@prisma/client";
import { addDays, startOfDay, endOfDay } from "date-fns";
import { getCalendarService, getEventsMultiCalendar, checkProviderConnection } from "~/server/services";

// OpenAI client for embeddings
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Get Mastra API URL from environment variable
const MASTRA_API_URL = process.env.MASTRA_API_URL;

if (!MASTRA_API_URL) {
  throw new Error("MASTRA_API_URL environment variable is not set");
}

/** Fetch the user's decrypted Notion OAuth token, or null if not connected. */
async function getUserNotionToken(db: PrismaClient, userId: string): Promise<string | null> {
  const integration = await db.integration.findFirst({
    where: { userId, provider: "notion", status: "ACTIVE" },
    include: { credentials: { where: { keyType: "access_token" } } },
    orderBy: { createdAt: "desc" },
  });

  const cred = integration?.credentials[0];
  if (!cred) return null;

  return decryptCredential(cred.key, cred.isEncrypted);
}

// Utility to cache agent instruction embeddings
let agentEmbeddingsCache: { id: string; vector: number[] }[] | null = null;
/**
 * Load and cache embeddings for each agent's instructions.
 * Always returns an array (never null).
 */
async function loadAgentEmbeddings(): Promise<{ id: string; vector: number[] }[]> {
  if (agentEmbeddingsCache) return agentEmbeddingsCache;

  // Use direct fetch instead of mastraClient
  let data: Record<string, { instructions: string; [key: string]: any }>;
  try {
    const response = await fetch(`${MASTRA_API_URL}/api/agents`);
    if (!response.ok) {
      throw new Error(`Mastra API returned status ${response.status}`);
    }
    data = await response.json();
  } catch (error) {
    console.error("Failed to fetch Mastra agents using direct fetch:", error);
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Unable to fetch Mastra agents for embedding",
    });
  }

  if (!data || Object.keys(data).length === 0) {
    // Handle case where no agents are returned
    console.warn("No agents returned from Mastra API");
    agentEmbeddingsCache = [];
    return agentEmbeddingsCache;
  }

  const agentIds = Object.keys(data);
  // Extract instructions 
  const instructions = agentIds.map(id => data[id]!.instructions);
  const embedRes = await openai.embeddings.create({ model: 'text-embedding-ada-002', input: instructions });
  // Build embeddings array, asserting agentIds[i] is defined
  agentEmbeddingsCache = embedRes.data.map((e, i) => ({ id: agentIds[i]!, vector: e.embedding }));
  return agentEmbeddingsCache;
}

// Define the expected structure of an agent from the Mastra API
// Adjust properties if the actual API response differs
const MastraAgentSchema = z.object({
  id: z.string(), // Assuming agent ID is a string
  name: z.string(),
  instructions: z.string(),
  // Add other relevant properties if needed, e.g.:
  // description: z.string().optional(),
  // capabilities: z.array(z.string()).optional(),
});

// Define the expected response array
const MastraAgentsResponseSchema = z.array(MastraAgentSchema);

// Helper function to parse expiration strings (e.g., "24h", "7d", "30d")
function parseExpiration(expiresIn: string): number {
  const timeValue = parseInt(expiresIn.slice(0, -1));
  const timeUnit = expiresIn.slice(-1);
  
  switch (timeUnit) {
    case 'h': return timeValue * 60 * 60 * 1000;      // hours
    case 'd': return timeValue * 24 * 60 * 60 * 1000; // days
    case 'w': return timeValue * 7 * 24 * 60 * 60 * 1000; // weeks
    case 'm': return timeValue * 30 * 24 * 60 * 60 * 1000; // months (approx)
    default: return 24 * 60 * 60 * 1000; // default to 24 hours
  }
}


export const mastraRouter = createTRPCRouter({
  getMastraAgents: publicProcedure
    .output(MastraAgentsResponseSchema) // Output is still the validated array
    .query(async () => {
      const mastraApiUrl = `${MASTRA_API_URL}/api/agents`; // Use environment variable
      try {
        // Use mastraClient to fetch agents
        // const agentsData = await mastraClient.getAgents();
        // // console.log("Mastra API data from client:", agentsData);

        // console.log("Mastra API data from client:", agentsData);
        // Use direct fetch instead of mastraClient
        const response = await fetch(mastraApiUrl);
        
        if (!response.ok) {
          console.error(`Mastra API returned status ${response.status}`);
          return [];
        }

        const agentsData = await response.json();
        
        // Check if the response is an object and not empty
        if (typeof agentsData !== 'object' || agentsData === null || Object.keys(agentsData).length === 0) {
            console.error("Mastra API response structure unexpected or empty. Expected a non-empty object.", agentsData);
            return [];
        }
        
        // Transform the object into an array of { id, name, instructions }
        // The structure from the API is Record<string, AgentResponse>
        const transformedAgents = Object.entries(agentsData).map(([agentId, agentDetails]: [string, any]) => {
          return {
            id: agentId,
            name: agentDetails.name,
            instructions: agentDetails.instructions,
          };
        });

        const selectedAgents = ["zoeagent", "projectmanageragent", "ashagent"];
        const filteredAgents = transformedAgents.filter((a) => {
          if(selectedAgents.includes(a.id.toLowerCase())) {
            return a
          }
        })

        // Validate the TRANSFORMED array against the Zod schema
        const validationResult = MastraAgentsResponseSchema.safeParse(filteredAgents);
        if (!validationResult.success) {
            console.error("Transformed Mastra agent data validation failed:", validationResult.error);
            return []; // Return empty on validation failure
        }

        return validationResult.data; // Return the validated transformed array
      } catch (error) {
        console.error("Failed to fetch or parse from Mastra API:", error);
        // Return empty array if fetch itself fails (e.g., server not running)
        return [];
      }
    }),

  chooseAgent: publicProcedure
    .input(z.object({ message: z.string() }))
    .mutation(async ({ input }) => {
      // 1. load agent embeddings and ensure non-empty
      const embeddings = await loadAgentEmbeddings();
      if (embeddings.length === 0) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'No agent embeddings available' });
      }
      const first = embeddings[0]!;
      // 2. embed the user message
      const msgEmbRes = await openai.embeddings.create({ model: 'text-embedding-ada-002', input: [input.message] });
      if (!msgEmbRes.data || msgEmbRes.data.length === 0) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to embed user message' });
      }
      const msgVec: number[] = msgEmbRes.data[0]!.embedding;
      // 3. cosine similarity
      let best = { id: first.id, score: -Infinity };
      const magMsg = Math.sqrt(msgVec.reduce((sum, v) => sum + v * v, 0));
      for (const agentVec of embeddings) {
        const vec = agentVec.vector;
        // Compute dot product with safe indexing
        const dot = vec.reduce((sum, v, idx) => sum + v * (msgVec[idx] ?? 0), 0);
        const magA = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
        const score = magA > 0 && magMsg > 0 ? dot / (magA * magMsg) : 0;
        if (score > best.score) {
          best = { id: agentVec.id, score };
        }
      }
      return { agentId: best.id };
    }),

  callAgent: protectedProcedure
    .input(
      z.object({
        agentId: z.string(),
        messages: z
          .array(
            z.object({
              role: z.string(),        // e.g. 'user' or 'assistant'
              content: z.string(),
            })
          )
          .nonempty(),
        threadId: z.string().optional(),
        resourceId: z.string().optional(),
        runId: z.string().optional(),
        output: z.record(z.any()).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { agentId, messages } = input;

      // Generate JWT token for agent authentication
      const agentJWT = generateAgentJWT(ctx.session.user, 30);

      // Fetch per-user Notion OAuth token (null if not connected)
      const notionAccessToken = await getUserNotionToken(ctx.db, ctx.session.user.id);

      const res = await fetch(
        `${MASTRA_API_URL}/api/agents/${agentId}/generate`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            messages,
            requestContext: {
              authToken: agentJWT,
              userId: ctx.session.user.id,
              userEmail: ctx.session.user.email,
              todoAppBaseUrl: process.env.TODO_APP_BASE_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000',
              ...(notionAccessToken && { notionAccessToken }),
            }
          }),
        }
      );
      const text = await res.text();
      
      if (!res.ok) {
        console.error(`[mastraRouter] Mastra generate failed with status ${res.status}: ${text}`);
        throw new TRPCError({ code: 'BAD_REQUEST', message: `Mastra generate failed (${res.status}): ${text}` });
      }

      try {
        const responseData = JSON.parse(text);

        // Handle different response structures from Mastra
        let finalResponse = '';
        
        if (responseData.text) {
          finalResponse = responseData.text;
        } else if (responseData.content) {
          finalResponse = responseData.content;
        } else if (typeof responseData === 'string') {
          finalResponse = responseData;
        } else {
          // If response contains tool results, format them nicely
          if (responseData.toolResults && Array.isArray(responseData.toolResults)) {
            finalResponse = responseData.toolResults
              .map((result: any) => result.content || result.text || JSON.stringify(result))
              .join('\n\n');
          } else {
            finalResponse = JSON.stringify(responseData);
          }
        }

        return { 
          response: finalResponse, 
          agentName: agentId,
          toolCalls: responseData.toolCalls || [],
          toolResults: responseData.toolResults || []
        };
      } catch (parseError) {
        console.error(`[mastraRouter] Failed to parse JSON response:`, parseError);
        // Return raw text if JSON parsing fails
        return { response: text, agentName: agentId };
      }
    }),

  // API Key Generation for Mastra Agents and Webhooks (32 characters)
  generateApiToken: protectedProcedure
    .input(z.object({
      name: z.string().optional().default('Mastra Agent Key'),
      expiresIn: z.string().optional().default('24h'), // 24h, 7d, 30d, etc.
      type: z.enum(['hex', 'jwt']).optional().default('hex'), // Token type
    }))
    .mutation(async ({ ctx, input }) => {
      // Calculate expiration based on input
      const now = new Date();
      const expirationMs = parseExpiration(input.expiresIn);
      const expiresAt = new Date(now.getTime() + expirationMs);

      try {
        let apiKey: string;
        let tokenId: string;

        if (input.type === 'jwt') {
          // Generate JWT token for API authentication using unified function
          apiKey = generateJWT(ctx.session.user, {
            tokenType: "api-token",
            expiryMinutes: Math.floor(expirationMs / 60000),
            tokenName: input.name,
          });

          // Extract the jti from the generated JWT for database storage and tracking
          const decoded = jwt.decode(apiKey) as { jti?: string } | null;
          tokenId = decoded?.jti ?? crypto.randomUUID();

          // For JWT tokens, store the jti in the database for revocation
          await ctx.db.verificationToken.create({
            data: {
              identifier: `jwt-token:${input.name}`,
              token: tokenId, // Store the JWT ID for revocation
              expires: expiresAt,
              userId: ctx.session.user.id,
            }
          });
        } else {
          // Generate a secure 32-character hex key (perfect for webhooks like Fireflies)
          apiKey = crypto.randomBytes(16).toString('hex'); // 32 characters
          tokenId = crypto.randomUUID(); // For UI tracking

          // Store hex API key and metadata in VerificationToken table
          await ctx.db.verificationToken.create({
            data: {
              identifier: `api-key:${input.name}`,
              token: apiKey, // Store the actual API key for validation
              expires: expiresAt,
              userId: ctx.session.user.id,
            }
          });
        }

        return {
          token: apiKey, // Return either hex key or JWT
          tokenId: tokenId, // For UI tracking
          expiresAt: expiresAt.toISOString(),
          expiresIn: input.expiresIn,
          name: input.name,
          userId: ctx.session.user.id,
          type: input.type, // Return the token type
        };
      } catch (error) {
        console.error('API token generation failed:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to generate API token'
        });
      }
    }),

  // List API keys for the current user
  listApiTokens: protectedProcedure
    .output(z.array(z.object({
      tokenId: z.string(),
      name: z.string(),
      expiresAt: z.string(),
      expiresIn: z.string(),
      userId: z.string(),
      type: z.enum(['hex', 'jwt']).optional(),
    })))
    .query(async ({ ctx }) => {
      // Query VerificationToken table for API keys and JWT tokens
      const tokens = await ctx.db.verificationToken.findMany({
        where: {
          userId: ctx.session.user.id,
          OR: [
            { identifier: { startsWith: 'api-key:' } },
            { identifier: { startsWith: 'jwt-token:' } }
          ]
        },
        orderBy: {
          expires: 'desc'
        }
      });

      // Transform the data to match the expected output format
      return tokens.map(token => {
        const isJWT = token.identifier.startsWith('jwt-token:');
        const name = token.identifier.replace(/^(api-key:|jwt-token:)/, '');
        const now = new Date();
        const expiresAt = token.expires;
        const timeUntilExpiry = expiresAt.getTime() - now.getTime();
        
        // Calculate approximate expiresIn value
        let expiresIn: string;
        if (timeUntilExpiry <= 0) {
          expiresIn = 'expired';
        } else if (timeUntilExpiry < 24 * 60 * 60 * 1000) {
          expiresIn = `${Math.ceil(timeUntilExpiry / (60 * 60 * 1000))}h`;
        } else if (timeUntilExpiry < 7 * 24 * 60 * 60 * 1000) {
          expiresIn = `${Math.ceil(timeUntilExpiry / (24 * 60 * 60 * 1000))}d`;
        } else {
          expiresIn = `${Math.ceil(timeUntilExpiry / (7 * 24 * 60 * 60 * 1000))}w`;
        }

        return {
          tokenId: token.token, // For hex: actual key, for JWT: the jti
          name: name,
          expiresAt: token.expires.toISOString(),
          expiresIn: expiresIn,
          userId: token.userId ?? ctx.session.user.id, // Use session userId as fallback (tokens are filtered by userId)
          type: isJWT ? 'jwt' : 'hex', // Add token type
        };
      });
    }),

  // Revoke API key
  revokeApiToken: protectedProcedure
    .input(z.object({
      tokenId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Delete the API key from VerificationToken table
      const deleted = await ctx.db.verificationToken.deleteMany({
        where: {
          token: input.tokenId,
          userId: ctx.session.user.id, // Ensure user can only delete their own keys
          OR: [
            { identifier: { startsWith: 'api-key:' } },
            { identifier: { startsWith: 'jwt-token:' } }
          ]
        }
      });

      if (deleted.count === 0) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'API key not found or access denied'
        });
      }

      return { success: true };
    }),


  // Debug endpoint to inspect JWT tokens (including agent JWTs)
  debugToken: publicProcedure
    .input(z.object({
      token: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      console.log('🔍 [DEBUG TOKEN] debugToken endpoint called');
      
      
      // Get token from input or authorization header
      let token = input.token;
      if (!token) {
        const authHeader = ctx.headers.get('authorization');
        if (authHeader?.startsWith('Bearer ')) {
          token = authHeader.substring(7);
        }
      }
      
      if (!token) {
        return {
          error: 'No token provided',
          hint: 'Pass token in input or Authorization header',
        };
      }
      
      try {
        // Try to decode without verification first
        const decoded = jwt.decode(token) as any;
        const now = Math.floor(Date.now() / 1000);
        
        // Try to verify
        let verificationResult = 'NOT_VERIFIED';
        let verificationError = null;
        try {
          jwt.verify(token, process.env.AUTH_SECRET ?? '');
          verificationResult = 'VALID';
        } catch (err) {
          verificationError = err instanceof Error ? err.message : 'Unknown error';
          verificationResult = 'INVALID';
        }
        
        return {
          tokenInfo: {
            length: token.length,
            preview: token.substring(0, 50) + '...',
            lastChars: '...' + token.slice(-20),
          },
          decoded: decoded ? {
            header: jwt.decode(token, { complete: true })?.header,
            payload: decoded,
            userId: decoded.userId || decoded.sub,
            email: decoded.email,
            exp: decoded.exp ? new Date(decoded.exp * 1000).toISOString() : null,
            iat: decoded.iat ? new Date(decoded.iat * 1000).toISOString() : null,
            isExpired: decoded.exp ? decoded.exp < now : null,
            secondsUntilExpiry: decoded.exp ? decoded.exp - now : null,
          } : null,
          verification: {
            result: verificationResult,
            error: verificationError,
            authSecretPresent: !!process.env.AUTH_SECRET,
          },
          serverTime: {
            iso: new Date().toISOString(),
            timestamp: now,
          },
        };
      } catch (error) {
        return {
          error: 'Failed to decode token',
          details: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }),

  // Get all user goals across all projects
  getAllGoals: protectedProcedure
    .query(async ({ ctx }) => {
      console.log('🎯 [MASTRA DEBUG] getAllGoals called');
      
      const userId = ctx.session.user.id;
      
      const goals = await ctx.db.goal.findMany({
        where: { userId },
        include: {
          lifeDomain: true,
          projects: {
            select: {
              id: true,
              name: true,
              status: true,
            }
          },
          outcomes: {
            select: {
              id: true,
              description: true,
              type: true,
              dueDate: true,
            }
          }
        },
        orderBy: [
          { lifeDomainId: 'asc' },
          { title: 'asc' }
        ]
      });

      return {
        goals: goals.map(goal => ({
          id: goal.id,
          title: goal.title,
          description: goal.description,
          dueDate: goal.dueDate?.toISOString(),
          lifeDomain: goal.lifeDomain ? {
            id: goal.lifeDomain.id,
            title: goal.lifeDomain.title,
            description: goal.lifeDomain.description,
          } : null,
          projects: goal.projects.map(project => ({
            id: project.id,
            name: project.name,
            status: project.status,
          })),
          outcomes: goal.outcomes.map(outcome => ({
            id: outcome.id,
            description: outcome.description,
            type: outcome.type ?? 'daily',
            dueDate: outcome.dueDate?.toISOString(),
          })),
        })),
        total: goals.length,
      };
    }),

  // Project Manager Agent API Endpoints
  projectContext: protectedProcedure
    .input(z.object({
      projectId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      console.log('🎯 [MASTRA DEBUG] projectContext called');
      console.log('🎯 [MASTRA DEBUG] Session user:', {
        id: ctx.session.user.id,
        email: ctx.session.user.email,
        sessionExpires: ctx.session.expires,
      });
      
      // Use authenticated user's ID from session
      const userId = ctx.session.user.id;
      
      // Verify user has access to this project
      const project = await ctx.db.project.findUnique({
        where: { 
          id: input.projectId,
          createdById: userId 
        },
        include: {
          actions: {
            where: { status: 'ACTIVE' },
            orderBy: [
              { priority: 'asc' },
              { dueDate: 'asc' }
            ]
          },
          goals: {
            include: {
              lifeDomain: true
            }
          },
          outcomes: true,
          projectMembers: true, // Project members relation
        }
      });

      if (!project) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Project not found or access denied'
        });
      }

      return {
        project: {
          id: project.id,
          name: project.name,
          description: project.description,
          status: project.status,
          priority: project.priority,
          progress: project.progress ?? 0,
          createdAt: project.createdAt.toISOString(),
          reviewDate: project.reviewDate?.toISOString(),
          nextActionDate: project.nextActionDate?.toISOString(),
        },
        actions: project.actions.map(action => ({
          id: action.id,
          name: action.name,
          description: action.description,
          status: action.status,
          priority: action.priority,
          dueDate: action.dueDate?.toISOString(),
        })),
        goals: project.goals.map(goal => ({
          id: goal.id,
          title: goal.title,
          description: goal.description,
          dueDate: goal.dueDate?.toISOString(),
          lifeDomain: goal.lifeDomain ? {
            title: goal.lifeDomain.title,
            description: goal.lifeDomain.description,
          } : null,
        })),
        outcomes: project.outcomes.map(outcome => ({
          id: outcome.id,
          description: outcome.description,
          type: outcome.type ?? 'daily',
          dueDate: outcome.dueDate?.toISOString(),
        })),
        teamMembers: project.projectMembers.map((member: any) => ({
          id: member.id,
          name: member.name,
          role: member.role,
          responsibilities: member.responsibilities,
        })),
      };
    }),

  projectActions: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      status: z.enum(['ACTIVE', 'COMPLETED', 'CANCELLED']).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      console.log('🎯 [MASTRA DEBUG] projectActions called');
      console.log('🎯 [MASTRA DEBUG] Session user:', {
        id: ctx.session.user.id,
        email: ctx.session.user.email,
        sessionExpires: ctx.session.expires,
      });
      
      // Use authenticated user's ID from session
      const userId = ctx.session.user.id;
      
      // Verify user has access to this project
      const project = await ctx.db.project.findUnique({
        where: { 
          id: input.projectId,
          createdById: userId 
        },
      });

      if (!project) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Project not found or access denied'
        });
      }

      const actions = await ctx.db.action.findMany({
        where: {
          projectId: input.projectId,
          createdById: userId,
          ...(input.status && { status: input.status }),
        },
        include: {
          project: {
            select: {
              id: true,
              name: true,
              priority: true,
            }
          }
        },
        orderBy: [
          { priority: 'asc' },
          { dueDate: 'asc' }
        ],
      });

      return {
        actions: actions.map(action => ({
          id: action.id,
          name: action.name,
          description: action.description,
          status: action.status,
          priority: action.priority,
          dueDate: action.dueDate?.toISOString(),
          project: action.project,
        })),
      };
    }),

  createAction: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      name: z.string().min(1),
      description: z.string().optional(),
      priority: z.enum(PRIORITY_VALUES),
      dueDate: z.string().optional(), // ISO string
    }))
    .mutation(async ({ ctx, input }) => {
      // Use authenticated user's ID from session
      const userId = ctx.session.user.id;
      
      // Verify user has access to this project
      const project = await ctx.db.project.findUnique({
        where: { 
          id: input.projectId,
          createdById: userId 
        },
      });

      if (!project) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Project not found or access denied'
        });
      }

      const action = await ctx.db.action.create({
        data: {
          name: input.name,
          description: input.description,
          priority: input.priority,
          dueDate: input.dueDate ? new Date(input.dueDate) : null,
          projectId: input.projectId,
          createdById: userId,
        },
      });

      return { 
        action: {
          id: action.id,
          name: action.name,
          description: action.description,
          status: action.status,
          priority: action.priority,
          dueDate: action.dueDate?.toISOString(),
          projectId: action.projectId,
        }
      };
    }),

  // Natural language action creation - parses dates and matches project names
  quickCreateAction: protectedProcedure
    .input(z.object({
      text: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Use the same parsing logic as action.quickCreate
      const { parseActionInput } = await import("~/server/services/parsing/parseActionInput");
      const parsed = await parseActionInput(input.text, userId, ctx.db);

      // Get kanban order if project specified
      let kanbanOrder: number | null = null;
      if (parsed.projectId) {
        const highestOrder = await ctx.db.action.findFirst({
          where: { projectId: parsed.projectId, kanbanOrder: { not: null } },
          orderBy: { kanbanOrder: 'desc' },
          select: { kanbanOrder: true },
        });
        kanbanOrder = (highestOrder?.kanbanOrder ?? 0) + 1;
      }

      const action = await ctx.db.action.create({
        data: {
          name: parsed.name,
          projectId: parsed.projectId,
          priority: "Quick",
          status: "ACTIVE",
          createdById: userId,
          dueDate: parsed.dueDate,
          source: "whatsapp",
          kanbanStatus: parsed.projectId ? "TODO" : null,
          kanbanOrder,
        },
        include: {
          project: { select: { id: true, name: true } },
        },
      });

      return {
        success: true,
        action: {
          id: action.id,
          name: action.name,
          priority: action.priority,
          dueDate: action.dueDate?.toISOString(),
          project: action.project,
        },
        parsing: parsed.parsingMetadata,
      };
    }),

  updateProjectStatus: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      status: z.enum(['ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED']).optional(),
      priority: z.enum(['HIGH', 'MEDIUM', 'LOW', 'NONE']).optional(),
      progress: z.number().min(0).max(100).optional(),
      reviewDate: z.string().optional(), // ISO string
      nextActionDate: z.string().optional(), // ISO string
    }))
    .mutation(async ({ ctx, input }) => {
      // Use authenticated user's ID from session
      const userId = ctx.session.user.id;
      
      // Verify user has access to this project
      const project = await ctx.db.project.findUnique({
        where: { 
          id: input.projectId,
          createdById: userId 
        },
      });

      if (!project) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Project not found or access denied'
        });
      }

      const { projectId, ...updateData } = input;
      
      const updatedProject = await ctx.db.project.update({
        where: { 
          id: projectId,
          createdById: userId 
        },
        data: {
          ...(updateData.status && { status: updateData.status }),
          ...(updateData.priority && { priority: updateData.priority }),
          ...(updateData.progress !== undefined && { progress: updateData.progress }),
          ...(updateData.reviewDate && { reviewDate: new Date(updateData.reviewDate) }),
          ...(updateData.nextActionDate && { nextActionDate: new Date(updateData.nextActionDate) }),
        },
      });

      return {
        project: {
          id: updatedProject.id,
          name: updatedProject.name,
          status: updatedProject.status,
          priority: updatedProject.priority,
          progress: updatedProject.progress ?? 0,
          reviewDate: updatedProject.reviewDate?.toISOString(),
          nextActionDate: updatedProject.nextActionDate?.toISOString(),
        }
      };
    }),

  // Meeting Transcription Endpoints
  getMeetingTranscriptions: protectedProcedure
    .input(z.object({
      projectId: z.string().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      participants: z.array(z.string()).optional(),
      meetingType: z.string().optional(),
      limit: z.number().optional().default(10),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      // Build where clause for TranscriptionSession query
      const whereClause: any = {
        userId: userId, // Ensure user can only access their own transcriptions
      };

      if (input.projectId) {
        whereClause.projectId = input.projectId;
        // Verify user has access to this project
        const project = await ctx.db.project.findUnique({
          where: { id: input.projectId, createdById: userId }
        });
        if (!project) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Project not found or access denied'
          });
        }
      }

      if (input.startDate || input.endDate) {
        whereClause.createdAt = {}; // Use createdAt instead of meetingDate
        if (input.startDate) whereClause.createdAt.gte = new Date(input.startDate);
        if (input.endDate) whereClause.createdAt.lte = new Date(input.endDate);
      }

      // Get transcriptions first, then filter by participants if needed
      let transcriptions = await ctx.db.transcriptionSession.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' }, // Use createdAt instead of meetingDate
        take: input.participants ? 50 : input.limit, // Get more if we need to filter by participants
        select: {
          id: true,
          title: true,
          transcription: true, // Use transcription instead of transcript
          createdAt: true,
          projectId: true,
          summary: true,
        }
      });

      // Filter by participants if specified
      if (input.participants && input.participants.length > 0) {
        transcriptions = transcriptions.filter(t => {
          const title = (t.title || "").toLowerCase();
          const transcription = (t.transcription || "").toLowerCase();
          const summary = (t.summary || "").toLowerCase();
          
          // Check if any of the specified participants appear in title, transcription, or summary
          return input.participants!.some(participant => {
            const participantLower = participant.toLowerCase();
            return title.includes(participantLower) || 
                   transcription.includes(participantLower) ||
                   summary.includes(participantLower);
          });
        });
        
        // Limit after filtering
        transcriptions = transcriptions.slice(0, input.limit);
      }

      return {
        transcriptions: transcriptions.map(t => ({
          id: t.id,
          title: t.title || "",
          transcript: t.transcription || "", // Map transcription to transcript for consistency
          participants: [], // Empty array - field doesn't exist in schema
          meetingDate: t.createdAt.toISOString(), // Map createdAt to meetingDate
          meetingType: "", // Empty string - field doesn't exist in schema
          projectId: t.projectId,
          duration: null, // Null - field doesn't exist in schema
          summary: t.summary,
        })),
        total: transcriptions.length,
      };
    }),

  queryMeetingContext: protectedProcedure
    .input(z.object({
      query: z.string(),
      projectId: z.string().optional(),
      dateRange: z.object({
        start: z.string(),
        end: z.string(),
      }).optional(),
      topK: z.number().optional().default(5),
      sourceTypes: z.array(z.enum(['transcription', 'resource'])).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Verify project access if specified
      if (input.projectId) {
        const project = await ctx.db.project.findUnique({
          where: { id: input.projectId, createdById: userId }
        });
        if (!project) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Project not found or access denied'
          });
        }
      }

      try {
        // Use KnowledgeService for vector search
        const knowledgeService = getKnowledgeService(ctx.db);

        const searchResults = await knowledgeService.search(input.query, {
          userId,
          projectId: input.projectId,
          sourceTypes: input.sourceTypes,
          limit: input.topK,
        });

        // Transform results to expected format
        const results = searchResults.map(result => ({
          content: result.content,
          sourceType: result.sourceType,
          sourceId: result.sourceId,
          sourceTitle: result.sourceTitle ?? "",
          meetingTitle: result.sourceType === 'transcription' ? result.sourceTitle ?? "" : undefined,
          meetingDate: result.sourceMeta?.meetingDate?.toISOString(),
          url: result.sourceMeta?.url,
          contentType: result.sourceMeta?.contentType,
          relevanceScore: result.similarity,
          contextType: determineContextType(result.content),
          chunkIndex: result.chunkIndex,
        }));

        return { results };
      } catch (error) {
        console.error('Error in queryMeetingContext:', error);

        // Fallback to keyword search if vector search fails (e.g., no embeddings yet)
        console.log('[queryMeetingContext] Falling back to keyword search');

        const whereClause: Record<string, unknown> = {
          userId: userId,
        };

        if (input.projectId) {
          whereClause.projectId = input.projectId;
        }

        if (input.dateRange) {
          whereClause.createdAt = {
            gte: new Date(input.dateRange.start),
            lte: new Date(input.dateRange.end),
          };
        }

        const transcriptions = await ctx.db.transcriptionSession.findMany({
          where: whereClause,
          orderBy: { createdAt: 'desc' },
          take: 20,
        });

        const results = transcriptions
          .map(t => {
            const transcript = (t.transcription ?? "").toLowerCase();
            const query = input.query.toLowerCase();
            const queryWords = query.split(' ');

            let relevanceScore = 0;
            queryWords.forEach(word => {
              const matches = (transcript.match(new RegExp(word, 'g')) ?? []).length;
              relevanceScore += matches;
            });

            if (relevanceScore === 0) return null;

            const sentences = (t.transcription ?? "").split(/[.!?]+/);
            const relevantSentences = sentences.filter(sentence =>
              queryWords.some(word => sentence.toLowerCase().includes(word))
            );

            return {
              content: relevantSentences.slice(0, 3).join('. '),
              sourceType: 'transcription' as const,
              sourceId: t.id,
              sourceTitle: t.title ?? "",
              meetingTitle: t.title ?? "",
              meetingDate: t.createdAt.toISOString(),
              relevanceScore: relevanceScore / queryWords.length,
              contextType: determineContextType(relevantSentences.join(' ')),
            };
          })
          .filter(Boolean)
          .sort((a, b) => (b?.relevanceScore ?? 0) - (a?.relevanceScore ?? 0))
          .slice(0, input.topK);

        return { results };
      }
    }),

  getMeetingInsights: protectedProcedure
    .input(z.object({
      projectId: z.string().optional(),
      timeframe: z.enum(['last_week', 'last_month', 'last_quarter', 'custom']).default('last_week'),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      insightTypes: z.array(z.enum(['decisions', 'action_items', 'deadlines', 'blockers', 'milestones', 'team_updates'])).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Calculate date range based on timeframe
      const now = new Date();
      let startDate: Date;
      let endDate: Date = now;

      switch (input.timeframe) {
        case 'last_week':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'last_month':
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        case 'last_quarter':
          startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
          break;
        case 'custom':
          if (!input.startDate || !input.endDate) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Custom timeframe requires startDate and endDate'
            });
          }
          startDate = new Date(input.startDate);
          endDate = new Date(input.endDate);
          break;
      }

      const whereClause: any = {
        userId: userId, // Ensure user can only access their own transcriptions
        createdAt: { // Use createdAt instead of meetingDate
          gte: startDate,
          lte: endDate,
        }
      };

      if (input.projectId) {
        // Verify user has access to this project
        const project = await ctx.db.project.findUnique({
          where: { id: input.projectId, createdById: userId }
        });
        if (!project) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Project not found or access denied'
          });
        }
        whereClause.projectId = input.projectId;
      }

      const transcriptions = await ctx.db.transcriptionSession.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
      });

      // Extract insights using AI-enhanced analysis
      const insights = await extractInsightsFromTranscriptions(transcriptions, input.insightTypes, openai);

      return {
        insights,
        summary: {
          totalMeetings: transcriptions.length,
          timeframe: `${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`,
          keyThemes: extractKeyThemes(transcriptions),
          projectProgress: summarizeProjectProgress(transcriptions),
          upcomingDeadlines: insights.deadlines.filter(d => new Date(d.dueDate) > now).length,
          activeBlockers: insights.blockers.filter(b => !b.resolution).length,
        }
      };
    }),

  // Backfill embeddings for existing transcriptions
  backfillTranscriptionEmbeddings: protectedProcedure
    .input(z.object({
      projectId: z.string().optional(),
      limit: z.number().min(1).max(100).default(10),
      skipExisting: z.boolean().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Verify project access if specified
      if (input.projectId) {
        const project = await ctx.db.project.findUnique({
          where: { id: input.projectId, createdById: userId }
        });
        if (!project) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Project not found or access denied'
          });
        }
      }

      // Find transcriptions that need embedding
      const whereClause: Record<string, unknown> = {
        userId,
        transcription: { not: null },
        ...(input.projectId && { projectId: input.projectId }),
      };

      // Get all user's transcriptions
      const transcriptions = await ctx.db.transcriptionSession.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
        take: input.limit * 2, // Get extra to filter
        select: { id: true, title: true },
      });

      // If skipExisting, filter out those that already have chunks
      let toProcess = transcriptions;
      if (input.skipExisting) {
        const existingChunks = await ctx.db.knowledgeChunk.groupBy({
          by: ['sourceId'],
          where: {
            sourceType: 'transcription',
            sourceId: { in: transcriptions.map(t => t.id) },
          },
        });
        const existingIds = new Set(existingChunks.map(c => c.sourceId));
        toProcess = transcriptions.filter(t => !existingIds.has(t.id));
      }

      // Limit to requested amount
      toProcess = toProcess.slice(0, input.limit);

      // Process each transcription
      const knowledgeService = getKnowledgeService(ctx.db);
      const results: { id: string; title: string | null; chunkCount: number; error?: string }[] = [];

      for (const transcription of toProcess) {
        try {
          const chunkCount = await knowledgeService.embedTranscription(transcription.id);
          results.push({
            id: transcription.id,
            title: transcription.title,
            chunkCount,
          });
        } catch (error) {
          console.error(`[backfillTranscriptionEmbeddings] Failed for ${transcription.id}:`, error);
          results.push({
            id: transcription.id,
            title: transcription.title,
            chunkCount: 0,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      return {
        processed: results.length,
        successful: results.filter(r => !r.error).length,
        failed: results.filter(r => r.error).length,
        results,
      };
    }),

  // Get embedding statistics
  getEmbeddingStats: protectedProcedure
    .input(z.object({
      projectId: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Count transcriptions with/without embeddings
      const totalTranscriptions = await ctx.db.transcriptionSession.count({
        where: {
          userId,
          transcription: { not: null },
          ...(input.projectId && { projectId: input.projectId }),
        },
      });

      const transcriptionChunks = await ctx.db.knowledgeChunk.groupBy({
        by: ['sourceId'],
        where: {
          userId,
          sourceType: 'transcription',
          ...(input.projectId && { projectId: input.projectId }),
        },
      });

      // Count resources with/without embeddings
      const totalResources = await ctx.db.resource.count({
        where: {
          userId,
          content: { not: null },
          ...(input.projectId && { projectId: input.projectId }),
        },
      });

      const resourceChunks = await ctx.db.knowledgeChunk.groupBy({
        by: ['sourceId'],
        where: {
          userId,
          sourceType: 'resource',
          ...(input.projectId && { projectId: input.projectId }),
        },
      });

      // Total chunks
      const totalChunks = await ctx.db.knowledgeChunk.count({
        where: {
          userId,
          ...(input.projectId && { projectId: input.projectId }),
        },
      });

      return {
        transcriptions: {
          total: totalTranscriptions,
          withEmbeddings: transcriptionChunks.length,
          pendingEmbeddings: totalTranscriptions - transcriptionChunks.length,
        },
        resources: {
          total: totalResources,
          withEmbeddings: resourceChunks.length,
          pendingEmbeddings: totalResources - resourceChunks.length,
        },
        totalChunks,
      };
    }),

  // ============================================
  // FIREFLIES INTEGRATION WIZARD ENDPOINTS
  // These endpoints are designed for the AI agent to guide users through
  // Fireflies configuration via conversational chat
  // ============================================

  // Check if user already has Fireflies configured
  firefliesCheckExisting: protectedProcedure
    .input(z.object({
      teamId: z.string().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Look for existing Fireflies integration
      const integration = await ctx.db.integration.findFirst({
        where: {
          provider: 'fireflies',
          status: 'ACTIVE',
          OR: [
            { userId: userId },
            ...(input?.teamId ? [{ teamId: input.teamId }] : []),
          ],
        },
        include: {
          credentials: {
            where: { keyType: 'API_KEY' },
            take: 1,
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      if (!integration) {
        return {
          exists: false,
          integrationId: null,
          name: null,
          createdAt: null,
          scope: null,
        };
      }

      return {
        exists: true,
        integrationId: integration.id,
        name: integration.name,
        createdAt: integration.createdAt.toISOString(),
        scope: integration.teamId ? 'team' : 'personal',
      };
    }),

  // Test a Fireflies API key without saving it
  firefliesTestApiKey: protectedProcedure
    .input(z.object({
      apiKey: z.string().min(1, "API key is required"),
    }))
    .mutation(async ({ input }) => {
      const result = await testFirefliesConnection(input.apiKey);
      return {
        success: result.success,
        error: result.error,
        // SECURITY: Never return the API key back
      };
    }),

  // Create Fireflies integration with tested API key
  firefliesCreateIntegration: protectedProcedure
    .input(z.object({
      name: z.string().min(1, "Integration name is required"),
      apiKey: z.string().min(1, "API key is required"),
      description: z.string().optional(),
      scope: z.enum(['personal', 'team']).default('personal'),
      teamId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Test connection first
      const testResult = await testFirefliesConnection(input.apiKey);
      if (!testResult.success) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Fireflies connection failed: ${testResult.error}`,
        });
      }

      // If team scope, verify user has access to the team
      if (input.scope === 'team' && input.teamId) {
        const teamUser = await ctx.db.teamUser.findUnique({
          where: {
            userId_teamId: {
              userId: userId,
              teamId: input.teamId,
            },
          },
        });

        if (!teamUser) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'You do not have access to this team',
          });
        }
      }

      // Create the integration
      const integration = await ctx.db.integration.create({
        data: {
          name: input.name,
          type: 'meeting_transcription',
          provider: 'fireflies',
          description: input.description ?? `Fireflies integration created via AI agent`,
          userId: input.scope === 'personal' ? userId : null,
          teamId: input.scope === 'team' ? input.teamId : null,
          status: 'ACTIVE',
        },
      });

      // Create the credential
      await ctx.db.integrationCredential.create({
        data: {
          key: input.apiKey,
          keyType: 'API_KEY',
          isEncrypted: false, // TODO: implement encryption
          integrationId: integration.id,
        },
      });

      return {
        integrationId: integration.id,
        name: integration.name,
        status: integration.status,
        scope: input.scope,
      };
    }),

  // Update an existing Fireflies integration (for reconfiguring)
  firefliesUpdateIntegration: protectedProcedure
    .input(z.object({
      integrationId: z.string(),
      apiKey: z.string().min(1, "API key is required"),
      name: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Find the existing integration and verify ownership
      const integration = await ctx.db.integration.findFirst({
        where: {
          id: input.integrationId,
          provider: 'fireflies',
          OR: [
            { userId: userId },
            {
              teamId: { not: null },
              team: {
                members: {
                  some: { userId: userId },
                },
              },
            },
          ],
        },
        include: {
          credentials: true,
        },
      });

      if (!integration) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Fireflies integration not found or access denied',
        });
      }

      // Test the new API key first
      const testResult = await testFirefliesConnection(input.apiKey);
      if (!testResult.success) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Fireflies connection failed: ${testResult.error}`,
        });
      }

      // Delete old credentials
      await ctx.db.integrationCredential.deleteMany({
        where: { integrationId: integration.id },
      });

      // Create new API key credential
      await ctx.db.integrationCredential.create({
        data: {
          key: input.apiKey,
          keyType: 'API_KEY',
          isEncrypted: false,
          integrationId: integration.id,
        },
      });

      // Store email if available from test result
      if (testResult.email) {
        await ctx.db.integrationCredential.create({
          data: {
            key: testResult.email,
            keyType: 'EMAIL',
            isEncrypted: false,
            integrationId: integration.id,
          },
        });
      }

      // Update name if provided
      if (input.name) {
        await ctx.db.integration.update({
          where: { id: integration.id },
          data: { name: input.name },
        });
      }

      return {
        integrationId: integration.id,
        name: input.name ?? integration.name,
        status: integration.status,
        updated: true,
      };
    }),

  // Generate webhook token for Fireflies webhook authentication
  firefliesGenerateWebhookToken: protectedProcedure
    .input(z.object({
      integrationId: z.string(),
      expiresIn: z.string().default('90d'),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Verify integration belongs to user or their team
      const integration = await ctx.db.integration.findFirst({
        where: {
          id: input.integrationId,
          provider: 'fireflies',
          OR: [
            { userId: userId },
            {
              teamId: { not: null },
              team: {
                members: {
                  some: { userId: userId },
                },
              },
            },
          ],
        },
      });

      if (!integration) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Fireflies integration not found or access denied',
        });
      }

      // Generate a secure 32-character hex key (matches generateApiToken pattern, ideal for Fireflies webhooks)
      const apiKey = crypto.randomBytes(16).toString('hex'); // 32 characters
      const expirationMs = parseExpiration(input.expiresIn);
      const expiresAt = new Date(Date.now() + expirationMs);

      // Store token for webhook validation
      await ctx.db.verificationToken.create({
        data: {
          identifier: `api-key:Fireflies Webhook - ${integration.name}`,
          token: apiKey,
          expires: expiresAt,
          userId: userId,
        },
      });

      return {
        token: apiKey,
        expiresAt: expiresAt.toISOString(),
        tokenLength: apiKey.length,
      };
    }),

  // Get the webhook URL for user's environment
  firefliesGetWebhookUrl: protectedProcedure
    .query(async () => {
      const baseUrl = process.env.TODO_APP_BASE_URL ??
                      process.env.NEXTAUTH_URL ??
                      'http://localhost:3000';

      return {
        webhookUrl: `${baseUrl}/api/webhooks/fireflies`,
        baseUrl,
        isProduction: baseUrl.includes('vercel.app') || !baseUrl.includes('localhost'),
      };
    }),

  // AI Next Best Step - Get a gentle suggestion for what to focus on
  getNextBestStep: protectedProcedure
    .input(
      z.object({
        context: z.object({
          pendingActionsCount: z.number(),
          overdueActionsCount: z.number(),
          calendarEventsCount: z.number(),
          dailyOutcomesCount: z.number(),
          weeklyOutcomesCount: z.number(),
          completedHabitsCount: z.number(),
          totalHabitsCount: z.number(),
          staleProjectIds: z.array(z.string()),
          dayOfWeek: z.string(),
          isMonday: z.boolean(),
          isSunday: z.boolean(),
        }),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { context } = input;

      // Build a gentle, non-judgmental prompt
      const promptParts = [
        `You are a supportive productivity assistant. Based on today's context (${context.dayOfWeek}), suggest ONE gentle, optional action that might help the user feel successful today.`,
        "",
        "Today's context:",
        `- ${context.pendingActionsCount} action${context.pendingActionsCount !== 1 ? "s" : ""} scheduled for today`,
        context.overdueActionsCount > 0
          ? `- ${context.overdueActionsCount} action${context.overdueActionsCount !== 1 ? "s" : ""} from earlier days (no judgment - just information)`
          : null,
        `- ${context.calendarEventsCount} calendar event${context.calendarEventsCount !== 1 ? "s" : ""} today`,
        `- ${context.dailyOutcomesCount} daily outcome${context.dailyOutcomesCount !== 1 ? "s" : ""} set for today`,
        `- ${context.weeklyOutcomesCount} weekly outcome${context.weeklyOutcomesCount !== 1 ? "s" : ""} this week`,
        `- Habits: ${context.completedHabitsCount}/${context.totalHabitsCount} completed`,
        context.staleProjectIds.length > 0
          ? `- ${context.staleProjectIds.length} project${context.staleProjectIds.length !== 1 ? "s" : ""} haven't had recent activity`
          : null,
        context.isMonday ? "- It's Monday - start of a fresh week" : null,
        context.isSunday ? "- It's Sunday - a good day for reflection or light planning" : null,
        "",
        "Guidelines for your response:",
        "- Keep it to 1-2 sentences maximum",
        "- Use warm, supportive language",
        "- Focus on what might feel good to accomplish, not what 'should' be done",
        "- Never use guilt, pressure, or 'should have' language",
        "- If the day looks clear, suggest something restorative or intentional",
        "- Make the suggestion feel optional, not urgent",
      ].filter(Boolean);

      const prompt = promptParts.join("\n");

      try {
        // Generate JWT for agent authentication
        const agentJWT = generateAgentJWT(ctx.session.user, 30);

        // Call the ash agent for a gentle suggestion
        const res = await fetch(
          `${MASTRA_API_URL}/api/agents/ashagent/generate`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              messages: [{ role: "user", content: prompt }],
              requestContext: {
                authToken: agentJWT,
                userId: ctx.session.user.id,
                userEmail: ctx.session.user.email,
                todoAppBaseUrl:
                  process.env.TODO_APP_BASE_URL ??
                  process.env.NEXTAUTH_URL ??
                  "http://localhost:3000",
              },
            }),
          }
        );

        const text = await res.text();

        if (!res.ok) {
          console.error(
            `[getNextBestStep] Mastra generate failed with status ${res.status}: ${text}`
          );
          // Return a fallback suggestion instead of throwing
          return {
            suggestion: getFallbackSuggestion(context),
            source: "fallback",
          };
        }

        try {
          const responseData = JSON.parse(text);
          const suggestion =
            responseData.text ??
            responseData.content ??
            (typeof responseData === "string" ? responseData : null);

          if (suggestion) {
            return { suggestion, source: "ai" };
          }

          return {
            suggestion: getFallbackSuggestion(context),
            source: "fallback",
          };
        } catch {
          // If response is plain text
          if (text && text.length < 500) {
            return { suggestion: text, source: "ai" };
          }
          return {
            suggestion: getFallbackSuggestion(context),
            source: "fallback",
          };
        }
      } catch (error) {
        console.error("[getNextBestStep] Error calling Mastra:", error);
        return {
          suggestion: getFallbackSuggestion(context),
          source: "fallback",
        };
      }
    }),

  // Calendar Endpoints for Mastra agents
  getCalendarEvents: protectedProcedure
    .input(z.object({
      timeframe: z.enum(['today', 'upcoming', 'custom']).default('today'),
      days: z.number().min(1).max(30).optional().default(7),
      timeMin: z.string().optional(),
      timeMax: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const calendarService = new GoogleCalendarService();
      const userId = ctx.session.user.id;

      try {
        let events;
        if (input.timeframe === 'today') {
          events = await calendarService.getTodayEvents(userId);
        } else if (input.timeframe === 'upcoming') {
          events = await calendarService.getUpcomingEvents(userId, input.days);
        } else {
          events = await calendarService.getEvents(userId, {
            timeMin: input.timeMin ? new Date(input.timeMin) : undefined,
            timeMax: input.timeMax ? new Date(input.timeMax) : undefined,
          });
        }

        return {
          events: events.map((e: any) => ({
            id: e.id || '',
            summary: e.summary || 'No title',
            description: e.description || undefined,
            start: e.start?.dateTime || e.start?.date || '',
            end: e.end?.dateTime || e.end?.date || '',
            location: e.location || undefined,
            attendees: e.attendees?.map((a: any) => a.email || a.displayName) || [],
            htmlLink: e.htmlLink || undefined,
            status: e.status || undefined,
          })),
          calendarConnected: true,
        };
      } catch (error: any) {
        // Check if it's a "not connected" error
        if (error.message?.includes('not connected') || error.message?.includes('No Google account')) {
          return {
            events: [],
            calendarConnected: false,
            error: 'Google Calendar not connected. Please connect your calendar in Settings.',
          };
        }
        throw error;
      }
    }),

  getCalendarConnectionStatus: protectedProcedure
    .query(async ({ ctx }) => {
      const account = await ctx.db.account.findFirst({
        where: {
          userId: ctx.session.user.id,
          provider: "google",
        },
        select: {
          access_token: true,
          refresh_token: true,
          scope: true,
          expires_at: true,
        },
      });

      if (!account?.access_token) {
        return { isConnected: false, hasCalendarScope: false };
      }

      const hasCalendarScope = account.scope?.includes("calendar.events") ?? false;
      const tokenNotExpired = !account.expires_at || account.expires_at > Math.floor(Date.now() / 1000) + 300;
      const canRefresh = !!account.refresh_token;

      return {
        isConnected: hasCalendarScope && (tokenNotExpired || canRefresh),
        hasCalendarScope,
      };
    }),

  // CRM contact lookup by email for Mastra WhatsApp context
  lookupContactByEmail: protectedProcedure
    .input(z.object({ email: z.string().email() }))
    .query(async ({ ctx, input }) => {
      // Generate SHA-256 hash of email for lookup
      const emailHash = crypto
        .createHash("sha256")
        .update(input.email.toLowerCase().trim())
        .digest("hex");

      // Find contact by emailHash within user's workspaces
      const userWorkspaces = await ctx.db.workspaceUser.findMany({
        where: { userId: ctx.session.user.id },
        select: { workspaceId: true },
      });

      if (userWorkspaces.length === 0) {
        return { found: false };
      }

      const workspaceIds = userWorkspaces.map((w) => w.workspaceId);

      const contact = await ctx.db.crmContact.findFirst({
        where: {
          workspaceId: { in: workspaceIds },
          emailHash,
        },
      });

      if (!contact) {
        return { found: false };
      }

      // Decrypt PII fields
      try {
        return {
          found: true,
          contact: {
            id: contact.id,
            firstName: contact.firstName,
            lastName: contact.lastName,
            email: decryptBuffer(contact.email) ?? null,
            phone: decryptBuffer(contact.phone) ?? null,
          },
        };
      } catch (e) {
        console.error("PII decryption failed for contact", contact.id, e);
        return {
          found: true,
          contact: {
            id: contact.id,
            firstName: contact.firstName,
            lastName: contact.lastName,
            email: null,
            phone: null,
          },
        };
      }
    }),

  // Create or update a CRM contact (for Mastra WhatsApp context flow)
  createCrmContact: protectedProcedure
    .input(z.object({
      email: z.string().email(),
      phone: z.string(),
      firstName: z.string().optional(),
      lastName: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Get user's first workspace
      const workspace = await ctx.db.workspaceUser.findFirst({
        where: { userId: ctx.session.user.id },
        select: { workspaceId: true },
      });

      if (!workspace) {
        return { created: false, updated: false, error: "No workspace found" };
      }

      // Generate emailHash for deduplication
      const emailHash = crypto
        .createHash("sha256")
        .update(input.email.toLowerCase().trim())
        .digest("hex");

      // Check if contact already exists
      const existing = await ctx.db.crmContact.findFirst({
        where: {
          workspaceId: workspace.workspaceId,
          emailHash,
        },
      });

      if (existing) {
        // Update with phone if not already set
        if (!existing.phone && input.phone) {
          await ctx.db.crmContact.update({
            where: { id: existing.id },
            data: { phone: encryptString(input.phone) },
          });
          return { created: false, updated: true, contactId: existing.id };
        }
        return { created: false, updated: false, error: "Contact already exists" };
      }

      // Create new contact
      const contact = await ctx.db.crmContact.create({
        data: {
          workspaceId: workspace.workspaceId,
          createdById: ctx.session.user.id,
          firstName: input.firstName,
          lastName: input.lastName,
          email: encryptString(input.email),
          phone: encryptString(input.phone),
          emailHash,
          importSource: "MANUAL",
        },
      });

      return { created: true, updated: false, contactId: contact.id };
    }),

  // ==================== NEW CALENDAR ENDPOINTS ====================

  // Get today's events across all providers
  getTodayCalendarEvents: protectedProcedure
    .mutation(async ({ ctx }) => {
      const today = new Date();
      const start = startOfDay(today).toISOString();
      const end = endOfDay(today).toISOString();

      const events = await getEventsMultiCalendar(
        ctx.session.user.id,
        start,
        end
      );
      return { events, date: today.toISOString() };
    }),

  // Get upcoming events (next N days)
  getUpcomingCalendarEvents: protectedProcedure
    .input(z.object({
      days: z.number().min(1).max(30).default(7),
    }))
    .mutation(async ({ ctx, input }) => {
      const now = new Date();
      const start = now.toISOString();
      const end = addDays(now, input.days).toISOString();

      const events = await getEventsMultiCalendar(
        ctx.session.user.id,
        start,
        end
      );
      return { events, days: input.days };
    }),

  // Get events in custom date range (multi-calendar)
  getCalendarEventsInRange: protectedProcedure
    .input(z.object({
      timeMin: z.string().datetime(),
      timeMax: z.string().datetime(),
      provider: z.enum(['google', 'microsoft']).optional(),
      maxResults: z.number().default(250),
    }))
    .mutation(async ({ ctx, input }) => {
      // If provider specified, use single provider
      if (input.provider) {
        const service = getCalendarService(input.provider);
        const events = await service.getEvents(ctx.session.user.id, {
          timeMin: input.timeMin,
          timeMax: input.timeMax,
          maxResults: input.maxResults,
        });
        return { events, provider: input.provider };
      }

      // Otherwise aggregate from all connected providers
      const multiEvents = await getEventsMultiCalendar(
        ctx.session.user.id,
        input.timeMin,
        input.timeMax,
        input.maxResults
      );
      return { events: multiEvents };
    }),

  // Create a new calendar event
  createCalendarEvent: protectedProcedure
    .input(z.object({
      summary: z.string(),
      description: z.string().optional(),
      start: z.object({
        dateTime: z.string().datetime(),
        timeZone: z.string().optional(),
      }),
      end: z.object({
        dateTime: z.string().datetime(),
        timeZone: z.string().optional(),
      }),
      location: z.string().optional(),
      attendees: z.array(z.object({
        email: z.string().email(),
        displayName: z.string().optional(),
      })).optional(),
      provider: z.enum(['google', 'microsoft']).default('google'),
    }))
    .mutation(async ({ ctx, input }) => {
      const service = getCalendarService(input.provider);

      const createdEvent = await service.createEvent(
        ctx.session.user.id,
        {
          summary: input.summary,
          description: input.description,
          start: input.start,
          end: input.end,
          location: input.location,
          attendees: input.attendees,
        }
      );

      return { event: createdEvent, provider: input.provider };
    }),

  // Get multi-calendar connection status
  getAllCalendarConnectionStatus: protectedProcedure
    .mutation(async ({ ctx }) => {
      const [googleStatus, microsoftStatus] = await Promise.all([
        checkProviderConnection(ctx.db, ctx.session.user.id, 'google'),
        checkProviderConnection(ctx.db, ctx.session.user.id, 'microsoft'),
      ]);

      return {
        google: googleStatus,
        microsoft: microsoftStatus,
        hasAnyConnected: googleStatus.isConnected || microsoftStatus.isConnected,
      };
    }),
});

// Helper function for fallback AI suggestions
function getFallbackSuggestion(context: {
  pendingActionsCount: number;
  overdueActionsCount: number;
  calendarEventsCount: number;
  dailyOutcomesCount: number;
  weeklyOutcomesCount: number;
  completedHabitsCount: number;
  totalHabitsCount: number;
  staleProjectIds: string[];
  isMonday: boolean;
  isSunday: boolean;
}): string {
  // Provide contextual fallback suggestions when AI is unavailable
  if (context.dailyOutcomesCount === 0) {
    return "Consider setting one small intention for today - what would make it feel meaningful?";
  }

  if (context.pendingActionsCount === 0 && context.calendarEventsCount === 0) {
    return "Your day looks open. This might be a good time for something restorative or a project you've been curious about.";
  }

  if (context.isMonday && context.weeklyOutcomesCount === 0) {
    return "It's a fresh week! You might enjoy taking a few minutes to think about what would make this week feel successful.";
  }

  if (context.isSunday) {
    return "Sundays can be great for light reflection. What went well this week that you'd like to continue?";
  }

  if (context.pendingActionsCount > 0) {
    return "You have some actions lined up for today. Starting with the one that feels most approachable can build nice momentum.";
  }

  if (context.completedHabitsCount < context.totalHabitsCount) {
    return "You're making progress on your habits. Keep going at your own pace.";
  }

  return "Take a moment to appreciate what you've already accomplished. Small wins matter.";
}

// Helper functions for meeting insights extraction
function determineContextType(content: string): 'decision' | 'action_item' | 'deadline' | 'blocker' | 'discussion' | 'update' {
  const lowerContent = content.toLowerCase();

  if (lowerContent.includes('decide') || lowerContent.includes('decision') || lowerContent.includes('agreed')) {
    return 'decision';
  }
  if (lowerContent.includes('action') || lowerContent.includes('todo') || lowerContent.includes('will do')) {
    return 'action_item';
  }
  if (lowerContent.includes('deadline') || lowerContent.includes('due') || lowerContent.includes('by ')) {
    return 'deadline';
  }
  if (lowerContent.includes('block') || lowerContent.includes('issue') || lowerContent.includes('problem')) {
    return 'blocker';
  }
  if (lowerContent.includes('update') || lowerContent.includes('progress') || lowerContent.includes('status')) {
    return 'update';
  }
  return 'discussion';
}

async function extractInsightsFromTranscriptions(transcriptions: any[], _insightTypes?: string[], openaiClient?: OpenAI) {
  const insights = {
    decisions: [] as any[],
    actionItems: [] as any[],
    deadlines: [] as any[],
    blockers: [] as any[],
    milestones: [] as any[],
    teamUpdates: [] as any[],
  };

  for (const transcript of transcriptions) {
    // Use AI to extract structured insights if OpenAI is available
    if (openaiClient && transcript.transcription && transcript.transcription.length > 100) {
      try {
        const prompt = `Analyze this meeting transcript and extract structured insights. Return a JSON object with the following structure:
        {
          "decisions": [{"decision": "text", "impact": "high|medium|low", "participants": ["name1", "name2"]}],
          "actionItems": [{"action": "text", "assignee": "name", "dueDate": "YYYY-MM-DD or null", "priority": "high|medium|low"}],
          "deadlines": [{"deadline": "text", "dueDate": "YYYY-MM-DD", "owner": "name"}],
          "blockers": [{"blocker": "text", "severity": "critical|high|medium|low", "owner": "name"}],
          "teamUpdates": [{"member": "name", "update": "text", "category": "progress|blocker|achievement|challenge"}]
        }

        Meeting transcript: ${transcript.transcription.substring(0, 4000)}`;

        const response = await openaiClient.chat.completions.create({
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.1,
        });

        const aiInsights = JSON.parse(response.choices[0]?.message?.content || '{}');

        // Merge AI insights with meeting metadata
        if (aiInsights.decisions) {
          insights.decisions.push(...aiInsights.decisions.map((d: any) => ({
            ...d,
            meetingDate: transcript.createdAt,
            context: `From ${transcript.title || 'Untitled Meeting'}`,
          })));
        }

        if (aiInsights.actionItems) {
          insights.actionItems.push(...aiInsights.actionItems.map((a: any) => ({
            ...a,
            meetingDate: transcript.createdAt,
            status: 'pending',
          })));
        }

        if (aiInsights.deadlines) {
          insights.deadlines.push(...aiInsights.deadlines.map((d: any) => ({
            ...d,
            meetingDate: transcript.createdAt,
            status: new Date(d.dueDate) > new Date() ? 'upcoming' : 'overdue',
          })));
        }

        if (aiInsights.blockers) {
          insights.blockers.push(...aiInsights.blockers.map((b: any) => ({
            ...b,
            meetingDate: transcript.createdAt,
            impact: `Mentioned in ${transcript.title || 'Untitled Meeting'}`,
            resolution: null,
          })));
        }

        if (aiInsights.teamUpdates) {
          insights.teamUpdates.push(...aiInsights.teamUpdates.map((u: any) => ({
            ...u,
            meetingDate: transcript.createdAt,
          })));
        }

      } catch (error) {
        console.error('AI insight extraction failed, falling back to keyword matching:', error);
        // Fallback to simple keyword extraction
        extractKeywordBasedInsights(transcript, insights);
      }
    } else {
      // Fallback keyword-based extraction
      extractKeywordBasedInsights(transcript, insights);
    }
  }

  return insights;
}

function extractKeywordBasedInsights(transcript: any, insights: any) {
  const sentences = (transcript.transcription || "").split(/[.!?]+/);

  sentences.forEach((sentence: string) => {
    const lowerSentence = sentence.toLowerCase().trim();
    if (lowerSentence.length < 10) return;

    // Extract decisions
    if (lowerSentence.includes('decide') || lowerSentence.includes('decision') || lowerSentence.includes('agreed')) {
      insights.decisions.push({
        decision: sentence.trim(),
        context: `From ${transcript.title || 'Untitled Meeting'}`,
        meetingDate: transcript.createdAt,
        participants: [], // Empty since we don't have this data
        impact: 'medium',
      });
    }

    // Extract action items
    if (lowerSentence.includes('action') || lowerSentence.includes('todo') || lowerSentence.includes('will do')) {
      insights.actionItems.push({
        action: sentence.trim(),
        assignee: extractAssignee(sentence),
        dueDate: extractDueDate(sentence),
        status: 'pending',
        meetingDate: transcript.createdAt,
        priority: 'medium',
      });
    }

    // Extract deadlines
    if (lowerSentence.includes('deadline') || lowerSentence.includes('due') || lowerSentence.includes('by ')) {
      const dueDate = extractDueDate(sentence);
      if (dueDate) {
        insights.deadlines.push({
          deadline: sentence.trim(),
          description: sentence.trim(),
          dueDate,
          owner: extractAssignee(sentence),
          status: new Date(dueDate) > new Date() ? 'upcoming' : 'overdue',
          meetingDate: transcript.createdAt,
        });
      }
    }

    // Extract blockers
    if (lowerSentence.includes('block') || lowerSentence.includes('issue') || lowerSentence.includes('problem')) {
      insights.blockers.push({
        blocker: sentence.trim(),
        impact: `Mentioned in ${transcript.title || 'Untitled Meeting'}`,
        owner: extractAssignee(sentence),
        resolution: null,
        meetingDate: transcript.createdAt,
        severity: 'medium',
      });
    }

    // Extract team updates
    if (lowerSentence.includes('update') || lowerSentence.includes('progress') || lowerSentence.includes('working on')) {
      insights.teamUpdates.push({
        member: extractAssignee(sentence) || 'Unknown',
        update: sentence.trim(),
        category: 'progress',
        meetingDate: transcript.createdAt,
      });
    }
  });
}

function extractAssignee(sentence: string): string | undefined {
  const assigneePatterns = [
    /(?:will|should|needs to|assigned to)\s+([A-Z][a-z]+)/,
    /([A-Z][a-z]+)\s+(?:will|should|needs to)/,
  ];

  for (const pattern of assigneePatterns) {
    const match = sentence.match(pattern);
    if (match) return match[1];
  }
  return undefined;
}

function extractDueDate(sentence: string): string | undefined {
  const datePatterns = [
    /by\s+(\w+\s+\d{1,2})/i,
    /due\s+(\w+\s+\d{1,2})/i,
    /(\d{1,2}\/\d{1,2}\/\d{2,4})/,
    /(next week|this week|tomorrow)/i,
  ];

  for (const pattern of datePatterns) {
    const match = sentence.match(pattern);
    if (match && match[1]) {
      const dateStr = match[1].toLowerCase();
      const now = new Date();

      if (dateStr === 'next week') {
        const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        return nextWeek.toISOString();
      }
      if (dateStr === 'this week') {
        const endOfWeek = new Date(now.getTime() + (7 - now.getDay()) * 24 * 60 * 60 * 1000);
        return endOfWeek.toISOString();
      }
      if (dateStr === 'tomorrow') {
        const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        return tomorrow.toISOString();
      }

      try {
        const parsed = new Date(match[1]);
        if (!isNaN(parsed.getTime())) {
          return parsed.toISOString();
        }
      } catch {
        // Ignore parsing errors
      }
    }
  }
  return undefined;
}

function extractKeyThemes(transcriptions: any[]): string[] {
  const wordCounts = new Map<string, number>();
  const excludeWords = new Set(['the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can', 'cannot']);

  transcriptions.forEach(transcript => {
    const words = (transcript.transcription || "").toLowerCase().match(/\b[a-z]+\b/g) || [];
    words.forEach((word: string) => {
      if (word.length > 3 && !excludeWords.has(word)) {
        wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
      }
    });
  });

  return Array.from(wordCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([word]) => word);
}

function summarizeProjectProgress(transcriptions: any[]): string {
  const progressWords = ['completed', 'finished', 'done', 'progress', 'moving', 'advancing'];
  const blockingWords = ['blocked', 'stuck', 'delayed', 'problem', 'issue', 'challenge'];

  let progressScore = 0;
  let total = 0;

  transcriptions.forEach(transcript => {
    const text = (transcript.transcription || "").toLowerCase();
    progressWords.forEach(word => {
      const matches = (text.match(new RegExp(word, 'g')) || []).length;
      progressScore += matches;
      total += matches;
    });
    blockingWords.forEach(word => {
      const matches = (text.match(new RegExp(word, 'g')) || []).length;
      progressScore -= matches;
      total += matches;
    });
  });

  if (total === 0) return 'No clear progress indicators found';

  const ratio = progressScore / total;
  if (ratio > 0.5) return 'Strong positive progress';
  if (ratio > 0) return 'Moderate progress with some challenges';
  if (ratio > -0.5) return 'Mixed progress with notable blockers';
  return 'Significant challenges and blockers identified';
}