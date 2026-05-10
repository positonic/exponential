import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { findUserByEmailInWorkspace } from "~/server/services/access/resolvers/workspaceResolver";

// ────────────────────────────────────────────────────────────────────
// One2b agent integration: pre-meeting brief lookups.
//
// `getHistory` resolves a meeting attendee (by email, scoped to a
// workspace) into a lightweight profile + their recent meeting history
// so the meetingContextAgent can produce a focused brief without paging
// through full transcripts.
//
// Resolution order for the participant's display name:
//   1. The matched workspace User's `name`, if the email belongs to a
//      WorkspaceUser. (Authoritative.)
//   2. The most recent TranscriptionSessionParticipant.name with that
//      email in the same workspace. (Best-effort fallback for externals.)
// ────────────────────────────────────────────────────────────────────

export const transcriptionSessionParticipantRouter = createTRPCRouter({
  getHistory: protectedProcedure
    .input(
      z.object({
        email: z.string().email(),
        workspaceId: z.string(),
        limit: z.number().min(1).max(50).default(10),
      }),
    )
    .output(
      z.object({
        participant: z.object({
          email: z.string(),
          name: z.string().nullable(),
          isWorkspaceMember: z.boolean(),
          userId: z.string().nullable(),
          meetingCount: z.number(),
        }),
        recentMeetings: z.array(
          z.object({
            transcriptionSessionId: z.string(),
            title: z.string().nullable(),
            meetingDate: z.date().nullable(),
            isHost: z.boolean(),
            speakerLabel: z.string().nullable(),
            summary: z.string().nullable(),
          }),
        ),
      }),
    )
    .query(async ({ ctx, input }) => {
      const callerId = ctx.session.user.id;

      // 1. Caller must belong to the workspace they're querying.
      const membership = await ctx.db.workspaceUser.findUnique({
        where: {
          userId_workspaceId: { userId: callerId, workspaceId: input.workspaceId },
        },
        select: { userId: true },
      });
      if (!membership) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You are not a member of this workspace",
        });
      }

      // 2. Try to resolve the email to a workspace User (authoritative source).
      const workspaceUser = await findUserByEmailInWorkspace(
        input.email,
        input.workspaceId,
      );
      const isWorkspaceMember = workspaceUser !== null;
      const userId = workspaceUser?.id ?? null;

      // 3. Fetch participations for (email, workspaceId), most recent first,
      //    capped by `limit`. Includes the related TranscriptionSession so
      //    we can hydrate title/meetingDate/summary in a single query.
      const participations = await ctx.db.transcriptionSessionParticipant.findMany({
        where: { email: input.email, workspaceId: input.workspaceId },
        include: {
          transcriptionSession: {
            select: {
              id: true,
              title: true,
              meetingDate: true,
              summary: true,
            },
          },
        },
        orderBy: { transcriptionSession: { meetingDate: "desc" } },
        take: input.limit,
      });

      // 4. Total participation count (independent of `limit`).
      const meetingCount = await ctx.db.transcriptionSessionParticipant.count({
        where: { email: input.email, workspaceId: input.workspaceId },
      });

      // 5. Pick a display name. Prefer the User row; fall back to the most
      //    recent participant.name we have on file. `participations` is
      //    already ordered by meetingDate desc, so the first non-null name
      //    is the freshest one.
      let name: string | null = workspaceUser?.name ?? null;
      if (!name) {
        const fallback = participations.find((p) => p.name && p.name.length > 0);
        name = fallback?.name ?? null;
      }

      return {
        participant: {
          email: input.email,
          name,
          isWorkspaceMember,
          userId,
          meetingCount,
        },
        recentMeetings: participations.map((p) => ({
          transcriptionSessionId: p.transcriptionSession.id,
          title: p.transcriptionSession.title,
          meetingDate: p.transcriptionSession.meetingDate,
          isHost: p.isHost,
          speakerLabel: p.speakerLabel,
          summary: p.transcriptionSession.summary,
        })),
      };
    }),
});
