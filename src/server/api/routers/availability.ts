import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { requireWorkspaceMembership } from "~/server/services/access/middleware";
import { GoogleCalendarService } from "~/server/services/GoogleCalendarService";
import { MicrosoftCalendarService } from "~/server/services/MicrosoftCalendarService";
import type { BusyInterval, CalendarProvider } from "~/server/services/CalendarProvider";
import {
  isCalendarConnected,
  toProviderType,
  type CalendarProviderType,
} from "~/server/services/calendarConnection";
import {
  computeCommonFreeSlots,
  mergeIntervals,
  parseBusyIntervals,
} from "~/server/services/AvailabilityService";
import { isGoogleOAuthTester } from "~/lib/googleAuth";

const MAX_RANGE_DAYS = 31;
const MAX_MEMBERS = 10;
const MAX_SLOTS = 200;

function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

function getCalendarService(provider: CalendarProviderType): CalendarProvider {
  return provider === "microsoft"
    ? new MicrosoftCalendarService()
    : new GoogleCalendarService();
}

export const availabilityRouter = createTRPCRouter({
  /**
   * Free/busy availability for a set of workspace members, plus the common
   * free slots where a meeting of the requested duration fits.
   *
   * Privacy: each member's calendar is read with their own stored tokens and
   * reduced to opaque busy intervals server-side — event titles, attendees
   * and locations never leave this procedure.
   */
  getTeamAvailability: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        memberUserIds: z.array(z.string()).min(1).max(MAX_MEMBERS),
        timeMin: z.date(),
        timeMax: z.date(),
        durationMinutes: z.number().int().min(15).max(480).default(30),
        slotIncrementMinutes: z.number().int().min(15).max(120).default(30),
        timeZone: z
          .string()
          .refine(isValidTimeZone, "Unknown time zone")
          .default("UTC"),
        workdayStartHour: z.number().int().min(0).max(23).default(9),
        workdayEndHour: z.number().int().min(1).max(24).default(17),
        includeWeekends: z.boolean().default(false),
      }),
    )
    .use(requireWorkspaceMembership("view"))
    .query(async ({ ctx, input }) => {
      const { timeMin, timeMax } = input;

      if (timeMax <= timeMin) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "timeMax must be after timeMin",
        });
      }
      if (
        timeMax.getTime() - timeMin.getTime() >
        MAX_RANGE_DAYS * 24 * 60 * 60 * 1000
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Availability can be checked over at most ${MAX_RANGE_DAYS} days`,
        });
      }
      if (input.workdayEndHour <= input.workdayStartHour) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Workday end must be after workday start",
        });
      }

      const memberUserIds = [...new Set(input.memberUserIds)];

      // Every requested user must be a member of this workspace — being able
      // to see someone's busy blocks is a workspace-membership privilege.
      const memberships = await ctx.db.workspaceUser.findMany({
        where: {
          workspaceId: input.workspaceId,
          userId: { in: memberUserIds },
        },
        include: {
          user: {
            select: { id: true, name: true, email: true, image: true },
          },
        },
      });

      if (memberships.length !== memberUserIds.length) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "All selected people must be members of this workspace",
        });
      }

      const accounts = await ctx.db.connectedAccount.findMany({
        where: {
          userId: { in: memberUserIds },
          provider: { in: ["google", "microsoft-entra-id"] },
        },
        select: {
          id: true,
          userId: true,
          provider: true,
          scope: true,
          expires_at: true,
          access_token: true,
          refresh_token: true,
          calendarPreference: { select: { selectedCalendarIds: true } },
        },
      });

      const members = await Promise.all(
        memberships.map(async (membership) => {
          const member = membership.user;

          // Google calendar is gated per-user while Google's scope
          // verification is pending — gate by the *member's* email, since it
          // is their tokens we would be using.
          const googleGated = !isGoogleOAuthTester(member.email);
          const usableAccounts = accounts
            .filter((a) => a.userId === member.id)
            .filter((a) => isCalendarConnected(a))
            .filter((a) => !(googleGated && a.provider === "google"));

          const perAccountBusy = await Promise.all(
            usableAccounts.map(async (account) => {
              try {
                const service = getCalendarService(toProviderType(account.provider));
                return await service.getFreeBusy(member.id, {
                  timeMin,
                  timeMax,
                  calendarIds: account.calendarPreference?.selectedCalendarIds,
                  accountId: account.id,
                });
              } catch (error) {
                console.error(
                  `[availability] free/busy failed for account ${account.id}:`,
                  error,
                );
                return null;
              }
            }),
          );

          const fetchFailed = perAccountBusy.some((busy) => busy === null);
          const busy: BusyInterval[] = perAccountBusy
            .filter((b): b is BusyInterval[] => b !== null)
            .flat();

          const mergedBusy = mergeIntervals(
            parseBusyIntervals(busy, timeMin, timeMax),
          ).map((interval) => ({
            start: interval.start.toISOString(),
            end: interval.end.toISOString(),
          }));

          return {
            userId: member.id,
            name: member.name,
            image: member.image,
            calendarConnected: usableAccounts.length > 0,
            // True when we could not read any of this member's calendars, so
            // their "free" is really "unknown" — the UI must say so instead
            // of promising availability.
            availabilityUnknown:
              usableAccounts.length === 0 ||
              (fetchFailed && busy.length === 0 && usableAccounts.length > 0),
            busy: mergedBusy,
          };
        }),
      );

      const slots = computeCommonFreeSlots(
        members.map((m) => m.busy),
        {
          timeMin,
          timeMax,
          durationMinutes: input.durationMinutes,
          slotIncrementMinutes: input.slotIncrementMinutes,
          timeZone: input.timeZone,
          startHour: input.workdayStartHour,
          endHour: input.workdayEndHour,
          includeWeekends: input.includeWeekends,
          maxSlots: MAX_SLOTS,
        },
      ).map((slot) => ({
        start: slot.start.toISOString(),
        end: slot.end.toISOString(),
      }));

      return { members, slots };
    }),
});
