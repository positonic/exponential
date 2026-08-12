import { z } from "zod";
import type { Prisma, PrismaClient } from "@prisma/client";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { isGoogleOAuthTester } from "~/lib/googleAuth";

/**
 * Per-user "Getting started" setup state, persisted on `User.welcomeSetupState`.
 *
 * The welcome page walks new users through four sequential steps
 * (goal → action → plan → calendar); both the Chat and Checklist views read
 * and write this same record so progress is shared and resumable mid-flow.
 */
const setupStateSchema = z.object({
  goal: z.string().nullable().default(null),
  goalId: z.number().nullable().default(null),
  /** Index into the goal suggestion chips (-1 = free text) — drives which action chips are offered. */
  goalSuggestionIndex: z.number().default(-1),
  action: z.string().nullable().default(null),
  actionId: z.string().nullable().default(null),
  planCreated: z.boolean().default(false),
  calendar: z.enum(["google", "outlook", "skipped"]).nullable().default(null),
});

export type WelcomeSetupState = z.infer<typeof setupStateSchema>;

/**
 * Safe-parse a raw `User.welcomeSetupState` value; malformed or empty input
 * yields the pristine default state. Also used by the admin router to derive
 * user lifecycle status.
 */
export function parseSetupState(value: unknown): WelcomeSetupState {
  const result = setupStateSchema.safeParse(value ?? {});
  return result.success ? result.data : setupStateSchema.parse({});
}

async function loadSetupState(
  db: PrismaClient,
  userId: string,
): Promise<WelcomeSetupState> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { welcomeSetupState: true },
  });
  return parseSetupState(user?.welcomeSetupState);
}

async function saveSetupState(
  db: PrismaClient,
  userId: string,
  state: WelcomeSetupState,
): Promise<WelcomeSetupState> {
  await db.user.update({
    where: { id: userId },
    data: { welcomeSetupState: state as Prisma.InputJsonObject },
  });
  return state;
}

/**
 * Objects created during setup land in the user's PERSONAL workspace. The
 * default workspace is used only when it is itself personal: for an invited
 * user the default is the shared team workspace (invite auto-accept overrides
 * it at signup), and a throwaway onboarding goal like "Get fit" must never be
 * visible to the rest of the team.
 *
 * Exported for tests — this is the enforcement point for the "onboarding
 * artifacts never land in a shared workspace" acceptance criterion.
 */
export async function resolveWorkspaceId(
  db: PrismaClient,
  userId: string,
): Promise<string | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { defaultWorkspaceId: true },
  });
  const defaultWorkspace = user?.defaultWorkspaceId
    ? await db.workspace.findUnique({
        where: { id: user.defaultWorkspaceId },
        select: { id: true, type: true, ownerId: true },
      })
    : null;
  // Ownership matters, not just type: a user can be invited into someone
  // ELSE's personal workspace (addMember has no type gate), and auto-accept
  // makes that their default — their onboarding goal must not land there.
  if (defaultWorkspace?.type === "personal" && defaultWorkspace.ownerId === userId) {
    return defaultWorkspace.id;
  }

  // Default is shared (team/organization) or unset — use the personal
  // workspace the user owns (auto-created at signup).
  const personal = await db.workspace.findFirst({
    where: { ownerId: userId, type: "personal" },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (personal) return personal.id;

  // No personal workspace exists — keep the previous resolution order.
  if (defaultWorkspace) return defaultWorkspace.id;
  const membership = await db.workspaceUser.findFirst({
    where: { userId },
    orderBy: { joinedAt: "asc" },
    select: { workspaceId: true },
  });
  return membership?.workspaceId ?? null;
}

/** What the invited welcome variant needs to know about the joined workspace. */
export interface InvitedContext {
  workspaceName: string;
  workspaceSlug: string;
  inviterName: string | null;
}

/**
 * Detect whether this user is a fresh invitee: their most recently accepted
 * WorkspaceInvitation, but only when it put them into someone ELSE's
 * workspace. A user who owns the workspace their latest invitation points at
 * (e.g. an owner re-invited into their own workspace) is not "invited" — the
 * welcome page must not pretend they just joined a team.
 *
 * Exported for tests — this decides which welcome variant a user sees.
 */
export async function resolveInvitedContext(
  db: PrismaClient,
  userId: string,
  email: string | null | undefined,
): Promise<InvitedContext | null> {
  if (!email) return null;
  const invitation = await db.workspaceInvitation.findFirst({
    where: { email, status: "accepted" },
    orderBy: { acceptedAt: "desc" },
    include: {
      workspace: {
        select: { name: true, slug: true, type: true, ownerId: true },
      },
      createdBy: { select: { name: true, email: true } },
    },
  });
  if (!invitation) return null;
  if (invitation.workspace.ownerId === userId) return null;

  // Only genuine CURRENT members: an invitee who was later removed must not
  // see "You've joined {workspace}" with a CTA into a workspace whose access
  // gate will reject them (and must not be shown its name/inviter at all).
  const membership = await db.workspaceUser.findUnique({
    where: {
      userId_workspaceId: { userId, workspaceId: invitation.workspaceId },
    },
    select: { userId: true },
  });
  if (!membership) return null;

  // `??` alone would let a whitespace-only stored name through and render
  // "  invited you" — treat blank as missing.
  const inviterName =
    invitation.createdBy.name?.trim() ||
    invitation.createdBy.email?.trim() ||
    null;

  return {
    workspaceName: invitation.workspace.name,
    workspaceSlug: invitation.workspace.slug,
    inviterName,
  };
}

export const welcomeRouter = createTRPCRouter({
  /**
   * Everything the welcome page needs to render/resume: the persisted setup
   * state plus whether a calendar is actually connected (OAuth happens out of
   * band, so connection status is derived from ConnectedAccount rows).
   */
  getSetup: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    const [user, calendarAccountCount, invitedContext] = await Promise.all([
      ctx.db.user.findUnique({
        where: { id: userId },
        select: {
          name: true,
          welcomeCompletedAt: true,
          welcomeSetupState: true,
        },
      }),
      ctx.db.connectedAccount.count({
        where: {
          userId,
          provider: { in: ["google", "microsoft-entra-id"] },
        },
      }),
      resolveInvitedContext(ctx.db, userId, ctx.session.user.email),
    ]);

    return {
      userName: user?.name ?? null,
      welcomeCompletedAt: user?.welcomeCompletedAt ?? null,
      calendarConnected: calendarAccountCount > 0,
      // Google's calendar scopes are still awaiting verification. For users who
      // aren't allowlisted testers the step isn't "not connected", it's not
      // available — the Google half of the step is hidden rather than offered.
      googleCalendarAvailable: isGoogleOAuthTester(ctx.session.user.email),
      // Only a live signal while welcome is in progress: once completed, a
      // return visit to /welcome must not flip an ordinary user's finished
      // flow into the invited variant.
      invitedContext: user?.welcomeCompletedAt ? null : invitedContext,
      state: parseSetupState(user?.welcomeSetupState),
    };
  }),

  /** Step 1 — creates a real Goal and records it in the setup state. */
  createGoal: protectedProcedure
    .input(
      z.object({
        title: z.string().min(1).max(500),
        suggestionIndex: z.number().int().default(-1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Idempotency: a retry after an ambiguous failure must not create a
      // second goal — the step is already answered.
      const existing = await loadSetupState(ctx.db, userId);
      if (existing.goalId !== null) return existing;

      const workspaceId = await resolveWorkspaceId(ctx.db, userId);

      const goal = await ctx.db.goal.create({
        data: {
          title: input.title,
          status: "active",
          userId,
          driUserId: userId,
          workspaceId,
        },
      });


      return saveSetupState(ctx.db, userId, {
        ...existing,
        goal: goal.title,
        goalId: goal.id,
        goalSuggestionIndex: input.suggestionIndex,
      });
    }),

  /**
   * Step 2 — creates a real Action, due today so it shows up on the Today
   * page (and its sidebar badge) immediately.
   *
   * TODO: the onboarding framework links Actions directly to Goals, but the
   * Action model has no `goalId` — the current schema only supports
   * Goal→Project→Action. When the backend migration adds a direct Action↔Goal
   * link, connect this action to `state.goalId`.
   */
  createAction: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(500),
        /** Local midnight from the client so "today" matches the user's timezone. */
        dueDate: z.date(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Idempotency: a retry after an ambiguous failure must not create a
      // second action — the step is already answered.
      const existing = await loadSetupState(ctx.db, userId);
      if (existing.actionId !== null) return existing;

      const workspaceId = await resolveWorkspaceId(ctx.db, userId);

      const action = await ctx.db.action.create({
        data: {
          name: input.name,
          dueDate: input.dueDate,
          priority: "Quick",
          status: "ACTIVE",
          createdById: userId,
          workspaceId,
        },
      });


      return saveSetupState(ctx.db, userId, {
        ...existing,
        action: action.name,
        actionId: action.id,
      });
    }),

  /**
   * Step 3 — creates today's DailyPlan with the three preview blocks
   * (the user's first action, a goal-breakdown block, an end-of-day review).
   */
  planDay: protectedProcedure
    .input(
      z.object({
        /** Local midnight from the client (same convention as dailyPlan router). */
        date: z.date(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const state = await loadSetupState(ctx.db, userId);

      let plan = await ctx.db.dailyPlan.findFirst({
        where: { userId, date: input.date, workspaceId: null },
        select: { id: true, plannedActions: { select: { id: true } } },
      });

      if (!plan) {
        plan = await ctx.db.dailyPlan.create({
          data: { userId, date: input.date, status: "DRAFT" },
          select: { id: true, plannedActions: { select: { id: true } } },
        });
      }

      // Only seed the blocks once — re-running the step must not duplicate them.
      if (plan.plannedActions.length === 0) {
        const at = (hours: number, minutes: number) =>
          new Date(input.date.getTime() + (hours * 60 + minutes) * 60_000);

        const blocks = [
          {
            name: state.action ?? "Your first action",
            actionId: state.actionId ?? undefined,
            duration: 45,
            scheduledStart: at(9, 0),
            scheduledEnd: at(9, 45),
          },
          {
            name: "Break your goal into next actions",
            duration: 45,
            scheduledStart: at(9, 45),
            scheduledEnd: at(10, 30),
          },
          {
            name: "5-minute end-of-day review",
            duration: 5,
            scheduledStart: at(16, 30),
            scheduledEnd: at(16, 35),
          },
        ];

        await ctx.db.dailyPlanAction.createMany({
          data: blocks.map((block, sortOrder) => ({
            dailyPlanId: plan.id,
            sortOrder,
            source: "onboarding-welcome",
            schedulingMethod: "auto-suggested",
            ...block,
          })),
        });
      }


      return saveSetupState(ctx.db, userId, { ...state, planCreated: true });
    }),

  /**
   * Step 4 — records the calendar choice. For google/outlook the OAuth flow
   * itself creates the ConnectedAccount; this just persists the answer
   * (including "skipped") so the flow is resumable.
   */
  setCalendar: protectedProcedure
    .input(z.object({ choice: z.enum(["google", "outlook", "skipped"]) }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const state = await loadSetupState(ctx.db, userId);
      return saveSetupState(ctx.db, userId, {
        ...state,
        calendar: input.choice,
      });
    }),
});
