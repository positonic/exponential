import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { ChatOpenAI } from "@langchain/openai";
import { SystemMessage, AIMessage, HumanMessage, ToolMessage } from "@langchain/core/messages";
import { tool } from "@langchain/core/tools";
import { OpenAIEmbeddings } from "@langchain/openai";
import { extractYoutubeSlugFromUrl } from "~/utils/youtube";

const adderSchema = z.object({
    a: z.number(),
    b: z.number(),
  });
  const adderTool = tool(
    async (input): Promise<string> => {
      const sum = input.a + input.b;
      console.log('in Adder!!! sum is ', sum);
      return `The sum of ${input.a} and ${input.b} is ${sum}`;
    },
    {
      name: "adder",
      description: "Adds two numbers together",
      schema: adderSchema,
    }
  );
  
  //await adderTool.invoke({ a: 1, b: 2 });
// import asana from 'asana';
// import { Tool } from "langchain/tools";

// Initialize Asana client
// const configuration = new asana.Client.create({
//   defaultHeaders: { 'Asana-Enable': 'new_project_templates,new_user_task_lists' },
//   logAsanaChangeWarnings: false,
// }).useAccessToken(env.ASANA_ACCESS_TOKEN);

// Create tool functions
// const createAsanaTaskTool = new Tool({
//   name: "create_asana_task",
//   description: "Creates a task in Asana given the name of the task and when it is due",
//   func: async ({ task_name, project_gid, due_on = new Date().toISOString().split('T')[0] }) => {
//     try {
//       const result = await configuration.tasks.create({
//         name: task_name,
//         due_on: due_on,
//         projects: [project_gid]
//       });
//       return JSON.stringify(result, null, 2);
//     } catch (e) {
//       return `Error creating task: ${e.message}`;
//     }
//   }
// });

const videoSearchSchema = z.object({
  query: z.string(),
  limit: z.number().optional().default(5),
});

// Define the tool as a function that takes ctx
const createVideoSearchTool = (ctx: any) => tool(
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

    // Format results into a readable string
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

const addVideoSchema = z.object({
  videoUrl: z.string().url(),
  isSearchable: z.boolean().default(true),
});

const createAddVideoTool = (ctx: any) => tool(
  async (input): Promise<string> => {
    try {
      const slug = extractYoutubeSlugFromUrl(input.videoUrl);

      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

      const video = await ctx.db.video.create({
        data: {
          id: crypto.randomUUID(),
          videoUrl: input.videoUrl,
          slug: slug,
          status: "pending",
          isSearchable: input.isSearchable,
          userId: ctx.session.user.id,
        },
      });

      return `Successfully added video to the database! The video ${input.isSearchable ? 'will' : 'will not'} be searchable. Processing will take a few minutes - you can track the progress at ${baseUrl}/videos. Video ID: ${video.id}`;
    } catch (error) {
      console.error('Error adding video:', error);
      throw new Error(`Failed to add video: ${error instanceof Error ? error.message : String(error)}`);
    }
  },
  {
    name: "add_video",
    description: "Adds a YouTube video to the database for processing. Provide the video URL and optionally specify if it should be searchable. Processing takes a few minutes.",
    schema: addVideoSchema,
  }
);

export const toolRouter = createTRPCRouter({
  chat: protectedProcedure
    .input(z.object({
      message: z.string(),
      history: z.array(z.object({
        type: z.enum(['system', 'human', 'ai', 'tool']),
        content: z.string(),
        name: z.string().optional(),
        tool_call_id: z.string().optional()
      }))
    }))
    .mutation(async ({ ctx, input }) => {
        console.log('mutation input is ', input);
        const model = new ChatOpenAI({ 
            modelName: process.env.LLM_MODEL,
            modelKwargs: { "tool_choice": "auto" }
        });

        // Create the tools with context
        const tools = [adderTool, createVideoSearchTool(ctx), createAddVideoTool(ctx)];
        const llmWithTools = model.bindTools(tools);

        const systemMessage = new SystemMessage(
            "You have access to the following tools:\n" +
            "- adder: Adds two numbers together. Use this when asked to perform addition.\n" +
            "- video_search: Search through video transcripts semantically. Use this when asked about video content or to find specific topics in videos.\n" +
            "- add_video: Adds a YouTube video to the database. Use this when users want to analyze or process a video. The video URL is required, and you can specify if it should be searchable (default is true).\n" +
            "After using a tool, always provide a natural language response explaining the result."
        );

        const messages = [systemMessage, ...input.history.map(msg => {
            switch (msg.type) {
                case 'system': return new SystemMessage(msg.content);
                case 'human': return new HumanMessage(msg.content);
                case 'ai': return new AIMessage(msg.content);
                case 'tool': return new ToolMessage(msg.content, msg.tool_call_id ?? '');
            }
        })];

        messages.push(new HumanMessage(input.message));

        try {
            let response = await llmWithTools.invoke(messages);
            
            if(!response || !response.tool_calls || response.tool_calls.length === 0) {
                return { response: response.content };
            }
            
            // If there are tool calls, execute them and get final response
            const toolCall = response.tool_calls[0];
            if(!toolCall || !toolCall.args) return { response: response.content };
            
             // Find the appropriate tool based on the name
             let toolResult;
             if (toolCall.name === "adder") {
              const toolCallArgs = toolCall.args as { a: number; b: number };
                 toolResult = await adderTool.invoke(toolCallArgs);
             } else if (toolCall.name === "video_search") {
                 toolResult = await createVideoSearchTool(ctx).invoke(toolCall.args as any);
             } else if (toolCall.name === "add_video") {
                 toolResult = await createAddVideoTool(ctx).invoke(toolCall.args as any);
             } else {
                 throw new Error(`Unknown tool: ${toolCall.name}`);
             }

            
            
            // Add both the AI response with tool call and the tool result
            messages.push(new AIMessage({ content: "", tool_calls: response.tool_calls }));
            messages.push(new ToolMessage(toolResult, toolCall.id ?? ''));
            
            // Get AI's interpretation of the tool result
            response = await llmWithTools.invoke(messages);
            
            return { response: response.content };
        } catch (error) {
            console.error('Error:', error);
            throw new Error(`AI chat error: ${error instanceof Error ? error.message : String(error)}`);
        }
    })
}); 