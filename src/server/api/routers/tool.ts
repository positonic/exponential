import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { ChatOpenAI } from "@langchain/openai";
import { SystemMessage, AIMessage, HumanMessage, ToolMessage } from "@langchain/core/messages";
import { tool } from "@langchain/core/tools";
import { OpenAIEmbeddings } from "@langchain/openai";
import { extractYoutubeSlugFromUrl } from "~/utils/youtube";
import { getTools } from "~/server/tools";
import { createAddVideoTool } from "~/server/tools/addVideoTool";
import { gmTool } from "~/server/tools/gmTool";
import { createVideoSearchTool } from "~/server/tools/videoSearchTool";
import { createActionTools } from "~/server/tools/actionTools";

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
        try {
            const model = new ChatOpenAI({ 
                modelName: process.env.LLM_MODEL,
                modelKwargs: { "tool_choice": "auto" }
            });

            const tools = getTools(ctx);
            const llmWithTools = model.bindTools(tools);

            const systemMessage = new SystemMessage(
                "You have access to the following tools:\n" +
                "- adder: Adds two numbers together. Use this when asked to perform addition.\n" +
                "- video_search: Search through video transcripts semantically. Use this when asked about video content or to find specific topics in videos.\n" +
                "- add_video: Adds a YouTube video to the database. Use this when users want to analyze or process a video.\n" +
                "- create_action: Creates a new action item with specified details.\n" +
                "- read_action: Retrieves an action's details by ID.\n" +
                "- update_status_action: Updates the status of an existing action. Favoured over create_action for existing actions\n" +
                "- delete_action: Removes an action from the system.\n" +
                "- gm: When a user says `gm` we will initiate their morning routing by asking them questions to figure out how to win the morning and the day.\n" +
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

            let response = await llmWithTools.invoke(messages);
            
            if(!response.tool_calls || response.tool_calls.length === 0) {
                return { response: response.content };
            }
            
            // Handle tool calls
            const toolResults = await Promise.all(response.tool_calls.map(async (toolCall) => {
                if(!toolCall || !toolCall?.args) return null;
                
                const actionTools = createActionTools(ctx);
                let toolResult;
                
                try {
                    switch(toolCall.name) {
                        case "adder":
                            toolResult = await adderTool.invoke(toolCall.args as any);
                            break;
                        case "video_search":
                            toolResult = await createVideoSearchTool(ctx).invoke(toolCall.args as any);
                            break;
                        case "add_video":
                            toolResult = await createAddVideoTool(ctx).invoke(toolCall.args as any);
                            break;
                        case "create_action":
                            toolResult = await actionTools.createActionTool.invoke(toolCall.args as any);
                            break;
                        case "read_action":
                            toolResult = await actionTools.readActionTool.invoke(toolCall.args as any);
                            break;
                        case "update_status_action":
                            toolResult = await actionTools.updateActionTool.invoke(toolCall.args as any);
                            break;
                        case "delete_action":
                            toolResult = await actionTools.deleteActionTool.invoke(toolCall.args as any);
                            break;
                        case "gm":
                            toolResult = await gmTool(ctx).invoke(toolCall.args as any);
                            break;
                        default:
                            throw new Error(`Unknown tool: ${toolCall.name}`);
                    }
                    
                    // Add tool result to messages
                    messages.push(new AIMessage({ content: "", tool_calls: [toolCall] }));
                    messages.push(new ToolMessage(toolResult, toolCall.id ?? ''));
                    
                    return toolResult;
                } catch (error) {
                    console.error(`Error executing tool ${toolCall.name}:`, error);
                    return `Error: ${error instanceof Error ? error.message : String(error)}`;
                }
            }));
            
            // Filter out null results and get final response
            const validToolResults = toolResults.filter(Boolean);
            if (validToolResults.length > 0) {
                response = await llmWithTools.invoke(messages);
            }
            
            return { response: response.content };
        } catch (error) {
            console.error('Error:', error);
            throw new Error(`AI chat error: ${error instanceof Error ? error.message : String(error)}`);
        }
    })
}); 