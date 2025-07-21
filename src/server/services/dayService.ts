import { type Context } from "~/server/auth/types";
import { startOfDay, endOfDay, startOfWeek, endOfWeek } from "date-fns";

export async function getUserDays({ ctx }: { ctx: Context }) {
  const userId = ctx.session?.user?.id;
  return await ctx.db.day.findMany({
    where: {
      // UserDay model removed - show all days for now
    }
  });
}

/**
 * Find an existing week record or create a new one for the given date
 * Weeks run from Monday to Sunday
 */
export async function findOrCreateWeek({ ctx, date }: { ctx: Context, date: Date }) {
  // Calculate the start (Monday) and end (Sunday) of the week
  const weekStart = startOfWeek(date, { weekStartsOn: 1 }); // 1 = Monday
  const weekEnd = endOfWeek(date, { weekStartsOn: 1 });
  
  // Try to find an existing week that contains this date
  const existingWeek = await ctx.db.week.findFirst({
    where: {
      startDate: weekStart,
      endDate: weekEnd
    }
  });
  
  if (existingWeek) {
    return existingWeek;
  }
  
  // Create a new week if none exists
  return await ctx.db.week.create({
    data: {
      startDate: weekStart,
      endDate: weekEnd
    }
  });
}

export async function createUserDay({ ctx, input }: { ctx: Context, input: { date: Date } }) {
  if (!ctx.session?.user?.id) {
    throw new Error("User not authenticated");
  }
  
  // First check if a day record already exists for this date for this user
  const existingDay = await ctx.db.day.findFirst({
    where: {
      date: {
        gte: startOfDay(input.date),
        lt: endOfDay(input.date)
      },
      // UserDay model removed
    }
  });
  
  // If day exists, return it
  if (existingDay) {
    return existingDay;
  }
  
  // Find or create the appropriate week for this date
  const week = await findOrCreateWeek({ ctx, date: input.date });
  
  // Create a new day with the correct week ID
  return await ctx.db.day.create({
    data: {
      date: input.date,
      weekId: week.id,
      // UserDay model removed
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
      // UserDay model removed
    },
    include: {
      exercises: true,
      notes: true,
      // UserDay relations removed
    }
  });
}
