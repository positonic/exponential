import { z } from "zod";
import { tool } from "@langchain/core/tools";
import { getVideoIdFromYoutubeUrl } from "~/utils/youtube";

const addVideoSchema = z.object({
  videoUrl: z.string().url(),
  isSearchable: z.boolean().default(true),
});

export const createAddVideoTool = (ctx: any) => tool(
  async (input): Promise<string> => {
    try {
      const slug = getVideoIdFromYoutubeUrl(input.videoUrl);
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