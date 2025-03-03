import { type Context } from "~/server/auth/types";

export async function getAllLifeDomains({ ctx }: { ctx: Context }) {
  return await ctx.db.lifeDomain.findMany({
    orderBy: {
      title: 'asc'
    }
  });
} 