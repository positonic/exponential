import { z } from "zod";
import { OpenAIEmbeddings } from "@langchain/openai";
import { summarizeTranscription, describeAndSave, summarizeAndSaveSummary, getSetups } from "~/server/services/videoService";
import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "~/server/api/trpc";
import { getVideoIdFromYoutubeUrl } from "~/utils/youtube";
import { VideoService } from "~/server/services/videoService";

export const videoRouter = createTRPCRouter({
  hello: publicProcedure
    .input(z.object({ text: z.string() }))
    .query(({ input }) => {
      return {
        greeting: `Hello ${input.text}`,
      };
    }),

  // create: protectedProcedure
  //   .input(z.object({ name: z.string().min(1) }))
  //   .mutation(async ({ ctx, input }) => {
  //     return ctx.db.video.create({
  //       data: {
  //         slug: input.slug,
  //         createdBy: { connect: { id: ctx.session.user.id } },
  //       },
  //     });
  //   }),

  getLatest: protectedProcedure.query(async ({ ctx }) => {
    const video = await ctx.db.video.findFirst({
      where: {
        users: {
          some: {
            userId: ctx.session.user.id
          }
        }
      },
      orderBy: { createdAt: "desc" },
    });

    return video ?? null;
  }),

  get: protectedProcedure.query(async ({ ctx }) => {
    return await ctx.db.video.findMany({
      where: {
        users: {
          some: {
            userId: ctx.session.user.id
          }
        }
      },
      orderBy: { createdAt: "desc" },
    });
  }),

  getSecretMessage: protectedProcedure.query(() => {
    return "you can now see this secret message!";
  }),
  search: protectedProcedure
    .input(
      z.object({
        query: z.string(),
        limit: z.number().default(5),
      })
    )
    .query(async ({ ctx, input }) => {
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
      console.log(results);
      return { results };
    }),

  create: protectedProcedure
    .input(z.object({ url: z.string().url() }))
    .mutation(async ({ ctx, input }) => {
      const slug = getVideoIdFromYoutubeUrl(input.url);
      const videoService = new VideoService(ctx.db);
      
      return await videoService.createVideo({
        videoUrl: input.url,
        status: 'pending',
        slug,
        userId: ctx.session.user.id
      });
    }),

  getBySlug: publicProcedure
    .input(z.string())
    .query(async ({ ctx, input }) => {
      const video = await ctx.db.video.findFirst({
        where: { slug: input },
      });
      return video;
    }),

  summarizeTranscription: protectedProcedure
    .input(z.object({ 
      videoId: z.string(),
      transcription: z.string(),
      summaryType: z.string(),
    }))
    .mutation(async ({ input }) => {
      const summary = await summarizeAndSaveSummary(input.videoId, input.transcription, input.summaryType)
      console.log("summarizeTranscription is", summary)
      return summary
    }),

   
    // Creates a detailed description more than a summary.
  describeTranscription: protectedProcedure
    .input(z.object({ 
      transcription: z.string(),
      summaryType: z.string(),
      captions: z.array(z.object({
        startSeconds: z.number(),
        endSeconds: z.number(),
        text: z.string(),
      })),
      videoUrl: z.string().optional()
    }))
    .mutation(async ({ input }) => {
      const description = await describeAndSave(input.transcription, input.summaryType, input.captions, input.videoUrl)
      console.log("summarizeTranscription is", description)
      return description
    }),

  getSetups: protectedProcedure
    .input(z.object({ 
      transcription: z.string(),
      summaryType: z.string()
    }))
    .mutation(async ({ input }) => {
      const summary = await getSetups(input.transcription, input.summaryType)
      console.log("summarizeTranscription is", summary)
      return summary
    }),

  getCount: publicProcedure.query(async ({ ctx }) => {
    const count = await ctx.db.video.count({
      where: {
        users: {
          some: {
            userId: ctx.session?.user?.id
          }
        }
      }
    });
    return count;
  }),
});

export async function getVideoBySlug(slug: string) {
  const db = await import("~/server/db").then((mod) => mod.db);
  const video = await db.video.findFirst({
    where: { slug },
  });
  return video;
}
