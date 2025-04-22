import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import OpenAI from "openai";
import { TRPCError } from "@trpc/server";

// OpenAI client for embeddings
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Utility to cache agent instruction embeddings
let agentEmbeddingsCache: { id: string; vector: number[] }[] | null = null;
/**
 * Load and cache embeddings for each agent's instructions.
 * Always returns an array (never null).
 */
async function loadAgentEmbeddings(): Promise<{ id: string; vector: number[] }[]> {
  if (agentEmbeddingsCache) return agentEmbeddingsCache;
  const response = await fetch("http://localhost:4111/api/agents");
  if (!response.ok) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Unable to fetch Mastra agents for embedding" });
  const data = await response.json(); // { [agentId]: { instructions: string, ... } }
  const agentIds = Object.keys(data);
  // Extract instructions (assert data[id] exists)
  const instructions = agentIds.map(id => (data[id] as any).instructions as string);
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
      const mastraApiUrl = "http://localhost:4111/api/agents"; // Default Mastra dev server URL
      try {
        const response = await fetch(mastraApiUrl);
        console.log("Mastra API response:", response);
        if (!response.ok) {
          console.error(`Mastra API Error: ${response.status} ${response.statusText}`);
          // Return empty array or throw specific TRPCError based on desired handling
          // Returning empty array for graceful degradation if Mastra server is down
          return []; 
        }

        const data = await response.json();
        console.log("Mastra API data:", data);

        // Check if the response is an object
        if (typeof data !== 'object' || data === null) {
            console.error("Mastra API response structure unexpected. Expected an object.", data);
            return [];
        }
        
        // Transform the object into an array of { id, name, agentInstructions }
        const transformedAgents = Object.keys(data).map((agentId) => {
          const agentData = data[agentId] as any;
          return {
            id: agentId,
            name: agentData.name,
            instructions: agentData.instructions,
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
        `http://localhost:4111/api/agents/${agentId}/generate`,
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