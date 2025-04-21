import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";

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
}); 