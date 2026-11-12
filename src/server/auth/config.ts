import { PrismaAdapter } from "@auth/prisma-adapter";
import { type DefaultSession, type NextAuthConfig } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import DiscordProvider from "next-auth/providers/discord";
import GoogleProvider from "next-auth/providers/google";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import NotionProvider from "next-auth/providers/notion";
import Postmark from "next-auth/providers/postmark";

import { db } from "~/server/db";
import { acceptPendingInvitationsForUser } from "~/server/auth/acceptPendingInvitations";
import { onUserCreated } from "~/server/auth/onUserCreated";
import { deliverSignInCode } from "~/server/auth/deliverSignInCode";
import { authorizeSetupClaim } from "~/server/auth/setupClaim";
import { mayCreateAccount } from "~/server/auth/signUpPolicy";
import { SIGN_UP_CLOSED_ERROR } from "~/lib/signInErrors";
import { resolveSignInMethods, signInMethodWarnings } from "~/server/auth/signInMethods";
import { generateSignInCode, SIGN_IN_CODE_TTL_SECONDS } from "~/lib/signInCode";
import { verifyAuthCode, verifyPkce } from "~/server/utils/native-auth";

/** Where the signIn callback sends an account creation that Sign-up mode refuses. */
const SIGN_UP_CLOSED_REDIRECT = `/signin?error=${SIGN_UP_CLOSED_ERROR}`;

/** Which ways in this install has, resolved once at config load. */
const signInMethods = resolveSignInMethods(process.env);

// Once per process, at config load: log delivery on, or its flag ignored.
for (const warning of signInMethodWarnings(process.env)) console.warn(warning);

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
      isAdmin: boolean;
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
    error: '/signin',
    verifyRequest: '/auth/verify-request',
  },
  providers: [
    // OAuth providers register only when their id and secret are both set, so
    // an install never offers a button that bounces with "provider not
    // found". `/signin`, the invite page and `auth.getConfiguredProviders`
    // read the same resolver.
    ...(signInMethods.discord
      ? [
          DiscordProvider({
            clientId: process.env.AUTH_DISCORD_ID,
            clientSecret: process.env.AUTH_DISCORD_SECRET,
            authorization: {
              url: "https://discord.com/api/oauth2/authorize",
              params: {
                scope: "identify email guilds",
              },
            },
            allowDangerousEmailAccountLinking: true,
          }),
        ]
      : []),
    ...(signInMethods.google
      ? [
          GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            allowDangerousEmailAccountLinking: true,
            authorization: {
              params: {
                access_type: "offline",
                prompt: "consent",
                scope: [
                  "openid",
                  "https://www.googleapis.com/auth/userinfo.email",
                  "https://www.googleapis.com/auth/userinfo.profile",
                ].join(" "),
              },
            },
          }),
        ]
      : []),
    ...(signInMethods.microsoft
      ? [
          MicrosoftEntraID({
            clientId: process.env.MICROSOFT_ENTRA_ID_CLIENT_ID,
            clientSecret: process.env.MICROSOFT_ENTRA_ID_CLIENT_SECRET,
            issuer: process.env.MICROSOFT_ENTRA_ID_TENANT_ID
              ? `https://login.microsoftonline.com/${process.env.MICROSOFT_ENTRA_ID_TENANT_ID}/v2.0`
              : undefined,
            allowDangerousEmailAccountLinking: true,
            authorization: {
              params: {
                scope: "openid profile email User.Read",
              },
            },
          }),
        ]
      : []),
    ...(signInMethods.notion
      ? [
          NotionProvider({
            clientId: process.env.NOTION_CLIENT_ID,
            clientSecret: process.env.NOTION_CLIENT_SECRET,
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
        ]
      : []),
    // The email provider. Its id is `postmark` whatever actually delivers the
    // code (Postmark, SMTP or, opt-in, the server log — `deliverSignInCode`
    // decides), because the id is load-bearing: `buildSignInCodeCallbackUrl`
    // hard-codes `/api/auth/callback/postmark` and three forms call
    // `signIn("postmark")`. The factory only supplies the token generator and
    // `sendVerificationRequest`; its apiKey/from are unused. Registered
    // unconditionally, so a code requested on an install with no delivery
    // fails as a send (SEND_FAILED_MESSAGE) rather than "provider not found".
    Postmark({
      apiKey: process.env.AUTH_POSTMARK_KEY ?? process.env.POSTMARK_SERVER_TOKEN ?? "",
      from: process.env.AUTH_POSTMARK_FROM ?? "noreply@exponential.im",
      /**
       * Email sign-in delivers a typed **Sign-in code**, never a link
       * ([ADR-0056](../../../docs/adr/0056-sign-in-codes-replace-magic-links.md)).
       * Corporate mail scanners follow URLs in email and the token is
       * single-use, so a link is spent before the recipient ever clicks it.
       *
       * `generateVerificationToken` replaces Auth.js's `randomString(32)` with
       * something a human can retype. Everything downstream is untouched: the
       * token is still hashed into `VerificationToken`, still single-use, and
       * the ordinary callback still creates the user and fires
       * `events.createUser` (personal workspace + pending-invite acceptance).
       */
      generateVerificationToken: generateSignInCode,
      maxAge: SIGN_IN_CODE_TTL_SECONDS,
      sendVerificationRequest: ({ identifier, token, expires }) =>
        deliverSignInCode({ identifier, token, expires }),
    }),
    /**
     * Desktop (Electron) sign-in bridge. The Electron app can't run Google/
     * passkey OAuth inside its window (Chromium has no platform authenticator),
     * so it runs the sign-in in the *system browser* via
     * `/api/auth/native/start`, receives a short-lived PKCE auth code on the
     * `exponential://auth/callback` deep link, then loads `/desktop-auth`, which
     * calls `signIn("desktop", { code, code_verifier })`. This provider verifies
     * that handshake and lets NextAuth mint a normal session cookie for the
     * in-app web view.
     *
     * SECURITY — this reuses the exact native-auth checks (no new trust):
     *   • `verifyAuthCode` requires a code signed by our domain-separated
     *     codeSecret, i.e. one issued by `/native/start` to an already-
     *     authenticated user, within its 60s TTL.
     *   • `verifyPkce` requires the caller to prove the `code_verifier` for the
     *     challenge baked into the code. That verifier never leaves the Electron
     *     main process, so an intercepted code is inert.
     * It never accepts an email/password or any long-lived secret.
     */
    CredentialsProvider({
      id: "desktop",
      name: "Desktop",
      credentials: {
        code: { label: "Auth code", type: "text" },
        code_verifier: { label: "PKCE verifier", type: "text" },
      },
      authorize: async (credentials) => {
        const code = credentials?.code;
        const verifier = credentials?.code_verifier;
        if (typeof code !== "string" || typeof verifier !== "string") return null;

        let claims;
        try {
          claims = verifyAuthCode(code);
        } catch {
          return null; // bad signature, expired, or wrong purpose
        }
        if (!verifyPkce(verifier, claims.codeChallenge)) return null;

        const user = await db.user.findUnique({
          where: { id: claims.sub },
          select: { id: true, email: true, name: true, image: true },
        });
        if (!user) return null;

        return { id: user.id, email: user.email, name: user.name, image: user.image };
      },
    }),
    /**
     * First-run claim of a self-host install (`/setup`, ADR-0081). Accepts an
     * email and the one-time **Setup token** `start:selfhost` printed, creates
     * or promotes that user as the instance admin and signs them in — no email
     * transport needed. Registered everywhere, but `claimInstance` refuses
     * once any instance admin exists, so on exponential.im it never succeeds.
     */
    CredentialsProvider({
      id: "setup",
      name: "Instance setup",
      credentials: {
        email: { label: "Email", type: "email" },
        token: { label: "Setup token", type: "text" },
      },
      authorize: (credentials) => authorizeSetupClaim(credentials),
    }),
  ],
  adapter: PrismaAdapter(db),
  session: {
    strategy: "jwt",
  },
  callbacks: {
    session: ({ session, user, token }) => {
      const tokenId =
        typeof token.id === "string"
          ? token.id
          : typeof token.sub === "string"
            ? token.sub
            : "";

      return {
        ...session,
        token,
        user: {
          ...session.user,
          id: user?.id ?? tokenId,
          isAdmin: (token.isAdmin as boolean) ?? false,
        },
      };
    },
    jwt: async ({ token, account, user }) => {
      if (user) {
        token.sub = user.id;
        token.email = user.email;
        // Fetch isAdmin from DB
        const dbUser = await db.user.findUnique({
          where: { id: user.id },
          select: { isAdmin: true },
        });
        token.isAdmin = dbUser?.isAdmin ?? false;
      }
      if (account) {
        token.accessToken = account.access_token;
      }
      return token;
    },
    signIn: async ({ user, account }) => {
      // No email (some OAuth profiles): an existing account signs in; a new
      // one is an account creation, so Sign-up mode decides.
      if (!user.email) {
        // Credentials sign-ins (desktop bridge, /setup) only ever return a
        // user their `authorize` already found or created.
        if (account?.type === "credentials") return true;
        const existingAccount = account
          ? await db.account.findUnique({
              where: {
                provider_providerAccountId: {
                  provider: account.provider,
                  providerAccountId: account.providerAccountId,
                },
              },
              select: { id: true },
            })
          : null;
        if (existingAccount) return true;
        return (await mayCreateAccount(db, null)) ? true : SIGN_UP_CLOSED_REDIRECT;
      }

      // Check if a user exists with this email
      const existingUser = await db.user.findUnique({
        where: { email: user.email },
        select: {
          id: true,
          projects: { take: 1 },
          actions: { take: 1 },
        },
      });

      // No user yet: this sign-in creates the account. Under invite-only
      // Sign-up mode (ADR-0081) that needs a pending invitation; refused here,
      // an email sign-in is refused before any code is sent. The Welcome email
      // fires from events.createUser — once per user, on any provider.
      if (!existingUser) {
        return (await mayCreateAccount(db, user.email)) ? true : SIGN_UP_CLOSED_REDIRECT;
      }

      // Update lastLogin timestamp for existing users
      await db.user.update({
        where: { id: existingUser.id },
        data: { lastLogin: new Date() },
      });

      // Auto-accept any pending invitations that arrived after the user signed up
      await acceptPendingInvitationsForUser(db, existingUser.id, user.email);

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
  events: {
    // A new user's one-time setup (Personal workspace, invitations, Welcome
    // email) lives in `onUserCreated`, which `/setup` also calls.
    createUser: async ({ user }) => {
      await onUserCreated(user);
    },
  },
} satisfies NextAuthConfig;
