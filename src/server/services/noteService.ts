import { type Context } from "~/server/auth/types";
import { startOfDay, endOfDay } from "date-fns";

/**
 * Create a note for the current user
 */
export async function createNote({ 
  ctx, 
  input 
}: { 
  ctx: Context, 
  input: { 
    content: string;
    type: string;
    title?: string;
    dayId: number;
  } 
}) {
  if (!ctx.session?.user?.id) {
    throw new Error("User not authenticated");
  }

  return await ctx.db.note.create({
    data: {
      content: input.content,
      type: input.type,
      title: input.title,
      dayId: input.dayId,
      userId: ctx.session.user.id,
    }
  });
}

/**
 * Get notes by day ID
 */
export async function getNotesByDay({ 
  ctx, 
  input 
}: { 
  ctx: Context, 
  input: { 
    dayId: number;
    type?: string;
  } 
}) {
  if (!ctx.session?.user?.id) {
    throw new Error("User not authenticated");
  }

  const where: any = {
    dayId: input.dayId,
    userId: ctx.session.user.id,
  };

  // Filter by type if provided
  if (input.type) {
    where.type = input.type;
  }

  return await ctx.db.note.findMany({
    where,
    orderBy: {
      createdAt: 'desc',
    },
  });
}

/**
 * Get notes by date
 */
export async function getNotesByDate({ 
  ctx, 
  input 
}: { 
  ctx: Context, 
  input: { 
    date: Date;
    type?: string;
  } 
}) {
  if (!ctx.session?.user?.id) {
    throw new Error("User not authenticated");
  }

  // First find the day for the given date
  const day = await ctx.db.day.findFirst({
    where: {
      date: {
        gte: startOfDay(input.date),
        lt: endOfDay(input.date)
      },
      // UserDay model removed
    }
  });

  if (!day) {
    return [];
  }

  // Get notes for the day
  const where: any = {
    dayId: day.id,
    userId: ctx.session.user.id,
  };

  // Filter by type if provided
  if (input.type) {
    where.type = input.type;
  }

  return await ctx.db.note.findMany({
    where,
    orderBy: {
      createdAt: 'desc',
    },
  });
} 