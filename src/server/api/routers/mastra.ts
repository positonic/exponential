import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import OpenAI from "openai";
import { TRPCError } from "@trpc/server";
import { mastraClient } from "~/lib/mastra";

// OpenAI client for embeddings
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Get Mastra API URL from environment variable
const MASTRA_API_URL = process.env.MASTRA_API_URL;

if (!MASTRA_API_URL) {
  throw new Error("MASTRA_API_URL environment variable is not set");
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
        console.log("Mastra API URL:", mastraApiUrl);
        const response = await fetch(mastraApiUrl);
        
        if (!response.ok) {
          console.error(`Mastra API returned status ${response.status}`);
          return [];
        }

        const agentsData = await response.json();
        console.log("Mastra API data from direct fetch:", agentsData);
        
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

        // Validate the TRANSFORMED array against the Zod schema
        const validationResult = MastraAgentsResponseSchema.safeParse(transformedAgents);
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

  callAgent: publicProcedure
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
    .mutation(async ({ input }) => {
      const { agentId, messages } = input;
      console.log(`[mastraRouter] JSON.stringify({ messages }):`, JSON.stringify({ messages }));
      const res = await fetch(
        `${MASTRA_API_URL}/api/agents/${agentId}/generate`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages }),
        }
      );
      console.log(`[mastraRouter] Mastra generate response:`, res);
      const text = await res.text();
      console.log(`[mastraRouter] Mastra generate response text:`, text);
      if (!res.ok) {
        console.error(`[mastraRouter] Mastra generate failed with status ${res.status}: ${text}`);
        throw new TRPCError({ code: 'BAD_REQUEST', message: `Mastra generate failed (${res.status}): ${text}` });
      }
      let data;
      const textData = JSON.parse(text);
      try {
        data = { response: textData.text, agentName: agentId }
      } catch {
        // Response is not JSON, return raw text
        return { response: text, agentName: agentId };
      }
      const responseText = typeof data === 'object' && 'response' in data ? data.response : text;
      return { response: responseText, agentName: agentId };
    }),
}); 