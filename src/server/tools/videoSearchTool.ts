import { z } from "zod";
import { tool } from "@langchain/core/tools";
import { OpenAIEmbeddings } from "@langchain/openai";

const videoSearchSchema = z.object({
  query: z.string(),
  limit: z.number().optional().default(5),
});

export const createVideoSearchTool = (ctx: any) => tool(
  async (input): Promise<string> => {
    const embeddings = new OpenAIEmbeddings({
      openAIApiKey: process.env.OPENAI_API_KEY,
    });

    const queryEmbedding = await embeddings.embedQuery(input.query);

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
      ORDER BY vc."chunk_embedding" <=> ${queryEmbedding}::vector
      LIMIT ${input.limit};
    `;

    const formattedResults = results.map((r: any) => 
      `Video ${r.slug} (${r.chunkStart}-${r.chunkEnd}): ${r.chunkText}`
    ).join('\n');

    return `Found the following relevant video segments:\n${formattedResults}`;
  },
  {
    name: "video_search",
    description: "Search through video transcripts using semantic search. Provide a query string to find relevant video segments.",
    schema: videoSearchSchema,
  }
); 