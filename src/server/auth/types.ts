import { type DefaultSession } from "next-auth"
import { type PrismaClient } from "@prisma/client";

export interface Session extends DefaultSession {
  user: {
    id: string;
  } & DefaultSession["user"];
} 

export type Context = {
  session: Session | null;
  db: PrismaClient;
};