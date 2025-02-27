import { z } from "zod";
import { tool } from "@langchain/core/tools";
//import { getVideoIdFromYoutubeUrl } from "~/utils/youtube";

const addVideoSchema = z.object({
  videoUrl: z.string().url(),
  isSearchable: z.boolean().default(true),
});

export const gmTool = () => tool(
  async (input): Promise<string> => {
    try {
      console.log('gmTool input is ', input);
      
      
      return `Successfully Hit the GM Tool`;
    } catch (error) {
      console.error('Error adding video:', error);
      throw new Error(`Failed to add video: ${error instanceof Error ? error.message : String(error)}`);
    }
  },
  {
    name: "gm",
    description: "Adds a YouTube video to the database for processing. Provide the video URL and optionally specify if it should be searchable. Processing takes a few minutes.",
    schema: addVideoSchema,
  }
); 