import { z } from "zod";
import {
  createTRPCRouter,
  protectedProcedure,
} from "~/server/api/trpc";
import { createNote, getNotesByDay, getNotesByDate } from "~/server/services/noteService";

export const noteRouter = createTRPCRouter({
  create: protectedProcedure
    .input(z.object({
      content: z.string(),
      type: z.string(),
      title: z.string().optional(),
      dayId: z.number(),
    }))
    .mutation(createNote),
  
  getByDay: protectedProcedure
    .input(z.object({
      dayId: z.number(),
      type: z.string().optional(),
    }))
    .query(getNotesByDay),
  
  getByDate: protectedProcedure
    .input(z.object({
      date: z.date(),
      type: z.string().optional(),
    }))
    .query(getNotesByDate),
}); 