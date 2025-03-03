import { type Context } from "~/server/auth/types";
import { startOfDay, endOfDay } from "date-fns";

export async function getUserDays({ ctx }: { ctx: Context }) {
  const userId = ctx.session?.user?.id;
  return await ctx.db.day.findMany({
    where: {
      users: {
        some: {
          userId: userId
        }
      }
    }
  });
}

export async function createUserDay({ ctx, input }: { ctx: Context, input: { date: Date, weekId: number } }) {
  if (!ctx.session?.user?.id) {
    throw new Error("User not authenticated");
  }
  
  return await ctx.db.day.create({
    data: {
      date: input.date,
      weekId: input.weekId,
      users: {
        create: {
          userId: ctx.session.user.id
        }
      }
    }
  });
}

export async function getDayByDate({ ctx, input }: { ctx: Context, input: { date: Date } }) {
  return await ctx.db.day.findFirst({
    where: {
      date: {
        gte: startOfDay(input.date),
        lt: endOfDay(input.date)
      },
      users: {
        some: {
          userId: ctx.session?.user?.id
        }
      }
    },
    include: {
      exercises: true,
      journals: true,
      users: true
    }
  });
}
