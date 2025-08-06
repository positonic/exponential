import { z } from "zod";
import { tool } from "@langchain/core/tools";
import { OpenAIEmbeddings } from "@langchain/openai";

const videoSearchSchema = z.object({
  query: z.string(),
  limit: z.number().optional().default(5),
});

export const createVideoSearchTool = (ctx: any) => tool(
  async (input): Promise<string> => {
    // CRITICAL SECURITY CHECK: Ensure user is authenticated
    if (!ctx?.session?.user?.id) {
      console.error('[SECURITY ALERT] Unauthorized access attempted to video_search tool - no user context');
      throw new Error('Unauthorized: Authentication required to access video content');
    }

    const userId = ctx.session.user.id;
    console.log(`[SECURITY] Video search executed by user ${userId} for query: "${input.query}"`);

    const embeddings = new OpenAIEmbeddings({
      openAIApiKey: process.env.OPENAI_API_KEY,
    });

    const queryEmbedding = await embeddings.embedQuery(input.query);

    // CRITICAL FIX: Add user-scoped filtering to prevent cross-user data access
    const results = await ctx.db.$queryRaw`
      SELECT 
        vc."chunk_text" as "chunkText",
        vc."video_id" as "videoId",
        vc."chunk_start" as "chunkStart",
        vc."chunk_end" as "chunkEnd",
        v."slug",
        v."id",
        1 - (vc."chunk_embedding" <=> ${queryEmbedding}::vector) as similarity
      FROM "VideoChunk" vc
      JOIN "Video" v ON v."id" = vc."video_id"
      JOIN "TranscriptionSession" ts ON ts."id" = v."transcriptionSessionId"
      WHERE ts."userId" = ${userId}
      ORDER BY vc."chunk_embedding" <=> ${queryEmbedding}::vector
      LIMIT ${input.limit};
    `;

    if (results.length === 0) {
      return `No video segments found for your query "${input.query}". Make sure you have uploaded and processed video content.`;
    }

    const formattedResults = results.map((r: any) => 
      `Video ${r.slug} (${r.chunkStart}-${r.chunkEnd}): ${r.chunkText}`
    ).join('\n');

    console.log(`[SECURITY] Returned ${results.length} video results for user ${userId}`);
    return `Found the following relevant video segments:\n${formattedResults}`;
  },
  {
    name: "video_search",
    description: "Search through video transcripts using semantic search. Provide a query string to find relevant video segments.",
    schema: videoSearchSchema,
  }
); 