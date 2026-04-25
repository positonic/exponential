import { type Context } from "~/server/auth/types";
import { startOfDay, endOfDay, differenceInDays } from "date-fns";

// Types
interface CreateHabitInput {
  title: string;
  description?: string;
  frequency: string;
  daysOfWeek?: number[];
  timeOfDay?: string;
  startDate?: Date;
  endDate?: Date;
  goalId?: number;
}

interface UpdateHabitInput {
  id: string;
  title?: string;
  description?: string;
  frequency?: string;
  daysOfWeek?: number[];
  timeOfDay?: string;
  endDate?: Date | null;
  isActive?: boolean;
  goalId?: number | null;
}

interface ToggleCompletionInput {
  habitId: string;
  date: Date;
  notes?: string;
  duration?: number;
  rating?: number;
}

interface GetCompletionsInput {
  habitId?: string;
  startDate: Date;
  endDate: Date;
}

// Get all habits for the current user
export async function getMyHabits({ ctx }: { ctx: Context }) {
  const userId = ctx.session?.user?.id;
  if (!userId) throw new Error("User not authenticated");

  return await ctx.db.habit.findMany({
    where: { userId },
    include: {
      goal: true,
      completions: {
        orderBy: { completedDate: "desc" },
        take: 90, // Last 90 days for streak calendar
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

// Get habits by goal ID
export async function getHabitsByGoal({
  ctx,
  goalId,
}: {
  ctx: Context;
  goalId: number;
}) {
  const userId = ctx.session?.user?.id;
  if (!userId) throw new Error("User not authenticated");

  return await ctx.db.habit.findMany({
    where: {
      userId,
      goalId,
    },
    include: {
      goal: true,
      completions: {
        orderBy: { completedDate: "desc" },
        take: 90,
      },
    },
  });
}

// Create a new habit
export async function createHabit({
  ctx,
  input,
}: {
  ctx: Context;
  input: CreateHabitInput;
}) {
  const userId = ctx.session?.user?.id;
  if (!userId) throw new Error("User not authenticated");

  return await ctx.db.habit.create({
    data: {
      title: input.title,
      description: input.description,
      frequency: input.frequency,
      daysOfWeek: input.daysOfWeek ?? [],
      timeOfDay: input.timeOfDay,
      startDate: input.startDate ?? new Date(),
      endDate: input.endDate,
      goalId: input.goalId,
      userId,
    },
    include: {
      goal: true,
      completions: true,
    },
  });
}

// Update a habit
export async function updateHabit({
  ctx,
  input,
}: {
  ctx: Context;
  input: UpdateHabitInput;
}) {
  const userId = ctx.session?.user?.id;
  if (!userId) throw new Error("User not authenticated");

  // Verify ownership
  const existing = await ctx.db.habit.findFirst({
    where: { id: input.id, userId },
  });
  if (!existing) throw new Error("Habit not found or unauthorized");

  return await ctx.db.habit.update({
    where: { id: input.id },
    data: {
      title: input.title,
      description: input.description,
      frequency: input.frequency,
      daysOfWeek: input.daysOfWeek,
      timeOfDay: input.timeOfDay,
      endDate: input.endDate,
      isActive: input.isActive,
      goalId: input.goalId,
    },
    include: {
      goal: true,
      completions: true,
    },
  });
}

// Delete a habit
export async function deleteHabit({
  ctx,
  input,
}: {
  ctx: Context;
  input: { id: string };
}) {
  const userId = ctx.session?.user?.id;
  if (!userId) throw new Error("User not authenticated");

  // Verify ownership
  const existing = await ctx.db.habit.findFirst({
    where: { id: input.id, userId },
  });
  if (!existing) throw new Error("Habit not found or unauthorized");

  return await ctx.db.habit.delete({
    where: { id: input.id },
  });
}

// Toggle habit completion for a date
export async function toggleCompletion({
  ctx,
  input,
}: {
  ctx: Context;
  input: ToggleCompletionInput;
}) {
  const userId = ctx.session?.user?.id;
  if (!userId) throw new Error("User not authenticated");

  // Verify habit ownership
  const habit = await ctx.db.habit.findFirst({
    where: { id: input.habitId, userId },
  });
  if (!habit) throw new Error("Habit not found or unauthorized");

  // Normalize the date to start of day
  const completedDate = startOfDay(input.date);

  // Check if completion exists
  const existing = await ctx.db.habitCompletion.findUnique({
    where: {
      habitId_completedDate: {
        habitId: input.habitId,
        completedDate,
      },
    },
  });

  if (existing) {
    // Delete the completion (toggle off)
    await ctx.db.habitCompletion.delete({
      where: { id: existing.id },
    });
    return { completed: false, completion: null };
  } else {
    // Create completion (toggle on)
    const completion = await ctx.db.habitCompletion.create({
      data: {
        habitId: input.habitId,
        completedDate,
        notes: input.notes,
        duration: input.duration,
        rating: input.rating,
      },
    });
    return { completed: true, completion };
  }
}

// Get habit completions for date range
export async function getCompletions({
  ctx,
  input,
}: {
  ctx: Context;
  input: GetCompletionsInput;
}) {
  const userId = ctx.session?.user?.id;
  if (!userId) throw new Error("User not authenticated");

  const whereClause: {
    completedDate: { gte: Date; lte: Date };
    habit: { userId: string; id?: string };
  } = {
    completedDate: {
      gte: startOfDay(input.startDate),
      lte: endOfDay(input.endDate),
    },
    habit: { userId },
  };

  if (input.habitId) {
    whereClause.habit.id = input.habitId;
  }

  return await ctx.db.habitCompletion.findMany({
    where: whereClause,
    include: {
      habit: true,
    },
    orderBy: { completedDate: "asc" },
  });
}

// Calculate streak data for a habit
export async function getHabitStreak({
  ctx,
  habitId,
}: {
  ctx: Context;
  habitId: string;
}) {
  const userId = ctx.session?.user?.id;
  if (!userId) throw new Error("User not authenticated");

  // Verify habit ownership
  const habit = await ctx.db.habit.findFirst({
    where: { id: habitId, userId },
    include: {
      completions: {
        orderBy: { completedDate: "desc" },
      },
    },
  });
  if (!habit) throw new Error("Habit not found or unauthorized");

  const completions = habit.completions;
  if (completions.length === 0) {
    return { currentStreak: 0, longestStreak: 0, totalCompletions: 0 };
  }

  // Calculate current streak
  let currentStreak = 0;
  const today = startOfDay(new Date());
  let checkDate = today;

  // For daily habits, check consecutive days
  if (habit.frequency === "daily") {
    for (const completion of completions) {
      const completionDate = startOfDay(completion.completedDate);
      const dayDiff = differenceInDays(checkDate, completionDate);

      if (dayDiff === 0 || dayDiff === 1) {
        currentStreak++;
        checkDate = completionDate;
      } else {
        break;
      }
    }
  } else {
    // For other frequencies, just count recent completions
    // This is a simplified approach - could be enhanced
    currentStreak = completions.filter((c) => {
      const daysDiff = differenceInDays(today, startOfDay(c.completedDate));
      return daysDiff <= 7;
    }).length;
  }

  // Calculate longest streak (simplified for daily)
  let longestStreak = 0;
  let tempStreak = 0;
  let prevDate: Date | null = null;

  const sortedCompletions = [...completions].sort(
    (a, b) => a.completedDate.getTime() - b.completedDate.getTime()
  );

  for (const completion of sortedCompletions) {
    const completionDate = startOfDay(completion.completedDate);

    if (prevDate === null) {
      tempStreak = 1;
    } else {
      const dayDiff = differenceInDays(completionDate, prevDate);
      if (dayDiff === 1) {
        tempStreak++;
      } else {
        tempStreak = 1;
      }
    }

    longestStreak = Math.max(longestStreak, tempStreak);
    prevDate = completionDate;
  }

  return {
    currentStreak,
    longestStreak,
    totalCompletions: completions.length,
  };
}

// Get today's habits with their completion status
export async function getTodayStatus({ ctx }: { ctx: Context }) {
  const userId = ctx.session?.user?.id;
  if (!userId) throw new Error("User not authenticated");

  const today = startOfDay(new Date());
  const dayOfWeek = today.getDay();

  // Get all active habits
  const habits = await ctx.db.habit.findMany({
    where: {
      userId,
      isActive: true,
      startDate: { lte: today },
      OR: [{ endDate: null }, { endDate: { gte: today } }],
    },
    include: {
      goal: true,
      completions: {
        where: {
          completedDate: today,
        },
      },
    },
  });

  // Filter habits that should be done today based on frequency
  const todayHabits = habits.filter((habit) => {
    switch (habit.frequency) {
      case "daily":
        return true;
      case "weekly":
        return dayOfWeek === 0; // Sunday
      case "bi_weekly":
        // Check if it's been 2 weeks since start
        const weeksSinceStart = Math.floor(
          differenceInDays(today, habit.startDate) / 7
        );
        return weeksSinceStart % 2 === 0 && dayOfWeek === 0;
      case "monthly":
        return today.getDate() === 1;
      case "3x_week":
      case "custom":
        return habit.daysOfWeek.includes(dayOfWeek);
      default:
        return true;
    }
  });

  return todayHabits.map((habit) => ({
    ...habit,
    isCompletedToday: habit.completions.length > 0,
    todayCompletion: habit.completions[0] ?? null,
  }));
}
