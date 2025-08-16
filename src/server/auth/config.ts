import { PrismaAdapter } from "@auth/prisma-adapter";
import { type DefaultSession, type NextAuthConfig } from "next-auth";
import DiscordProvider from "next-auth/providers/discord";
import GoogleProvider from "next-auth/providers/google";
import NotionProvider from "next-auth/providers/notion";

import { db } from "~/server/db";

/**
 * Module augmentation for `next-auth` types. Allows us to add custom properties to the `session`
 * object and keep type safety.
 *
 * @see https://next-auth.js.org/getting-started/typescript#module-augmentation
 */
declare module "next-auth" {
  interface Session extends DefaultSession {
    user: {
      id: string;
      // ...other properties
      // role: UserRole;
    } & DefaultSession["user"];
  }
}

/**
 * Options for NextAuth.js used to configure adapters, providers, callbacks, etc.
 *
 * @see https://next-auth.js.org/configuration/options
 */
export const authConfig = {
  pages: {
    signIn: '/signin',
    error: '/signin', // Custom error page
  },
  providers: [
    DiscordProvider({
      clientId: process.env.AUTH_DISCORD_ID!,
      clientSecret: process.env.AUTH_DISCORD_SECRET!,
      authorization: {
        url: "https://discord.com/api/oauth2/authorize",
        params: {
          scope: "identify email guilds",
        },
      },
      allowDangerousEmailAccountLinking: true,
    }),
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      allowDangerousEmailAccountLinking: true,
    }),
    NotionProvider({
      clientId: process.env.NOTION_CLIENT_ID!,
      clientSecret: process.env.NOTION_CLIENT_SECRET!,
      redirectUri: process.env.NOTION_REDIRECT_URI!,
      authorization: {
        params: {
          scope: 'basic read_databases write_databases',
          owner: 'user',
          response_type: 'code'
        },
        redirectUri: process.env.NOTION_REDIRECT_URI!,
      }
    }),
  ],
  adapter: PrismaAdapter(db),
  session: {
    strategy: "jwt",
  },
  callbacks: {
    session: ({ session, user, token }) => {
      const tokenId = typeof token.id === 'string' ? token.id : 
                     typeof token.sub === 'string' ? token.sub : '';
      
      return {
        ...session,
        token,
        user: {
          ...session.user,
          id: user?.id ?? tokenId
        }
      };
    },
    jwt: ({ token, account, user }) => {
      if (user) {
        token.sub = user.id;
        token.email = user.email;
      }
      if (account) {
        token.accessToken = account.access_token;
      }
      return token;
    },
    signIn: async ({ user, account }) => {
      // Allow sign in if the user doesn't exist yet
      if (!user.email) {
        return true;
      }
      
      // Check if a user exists with this email
      const existingUser = await db.user.findUnique({
        where: { email: user.email },
        select: {
          id: true,
          onboardingCompletedAt: true,
          projects: { take: 1 },
          actions: { take: 1 },
        },
      }); 

      // If no user exists, allow sign in (new user - will need onboarding)
      if (!existingUser) {
        return true;
      }

      // If user exists and this is the same provider they used before, allow sign in
      if (existingUser && account?.provider) {
        const existingAccount = await db.account.findFirst({
          where: {
            userId: existingUser.id,
            provider: account.provider,
          },
        });
        if (existingAccount) {
          return true;
        }
      }

      // Allow linking accounts with same email
      return true;
    },
    /**
     * Controls the redirection behavior after sign-in, sign-out, or errors.
     * @param url - The URL the user is being redirected to.
     * @param baseUrl - The base URL of the application.
     * @returns The URL to redirect to.
     */
    redirect: async ({ url, baseUrl }) => {
      // For non-sign-in URLs, allow normal navigation
      if (url.startsWith("/")) return `${baseUrl}${url}`;
      if (new URL(url).origin === baseUrl) return url;
      
      // For sign-in redirects, check if user needs onboarding
      try {
        // Get user from the most recent session/token
        // Since this runs after authentication, we need to get user by email from the sign-in context
        // We'll rely on the session callback to handle this more reliably
        return "/home"; // Default redirect - onboarding check happens in page components
      } catch (error) {
        console.error("Error in redirect callback:", error);
        return "/home"; // Fallback to home
      }
    },
  },
} satisfies NextAuthConfig;
