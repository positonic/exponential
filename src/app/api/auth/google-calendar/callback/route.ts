import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { headers } from "next/headers";

interface OAuthState {
  userId: string;
  returnUrl: string;
}

function parseState(state: string | null): OAuthState | null {
  if (!state) return null;
  try {
    return JSON.parse(Buffer.from(state, 'base64').toString()) as OAuthState;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const session = await auth();

  if (!session?.user) {
    redirect("/signin");
  }

  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const stateParam = searchParams.get("state");
  const error = searchParams.get("error");

  // Parse state to get userId and returnUrl
  const state = parseState(stateParam);
  const returnUrl = state?.returnUrl ?? "/today";

  if (error) {
    redirect(`${returnUrl}?calendar_error=access_denied`);
  }

  if (!code || !state || state.userId !== session.user.id) {
    redirect(`${returnUrl}?calendar_error=invalid_request`);
  }

  // Get the host from the request headers to handle different ports
  const headersList = await headers();
  const host = headersList.get('host') || 'localhost:3000';
  const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
  const baseUrl = `${protocol}://${host}`;

  try {
    console.log("🔄 Starting token exchange...", {
      baseUrl,
      redirectUri: `${baseUrl}/api/auth/google-calendar/callback`,
      hasClientId: !!process.env.GOOGLE_CLIENT_ID,
      hasClientSecret: !!process.env.GOOGLE_CLIENT_SECRET,
      codeLength: code?.length,
    });

    // Exchange authorization code for tokens
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        code,
        grant_type: "authorization_code",
        redirect_uri: `${baseUrl}/api/auth/google-calendar/callback`,
      }),
    });

    console.log("📊 Token response status:", tokenResponse.status);

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error("❌ Token exchange failed:", {
        status: tokenResponse.status,
        statusText: tokenResponse.statusText,
        response: errorText,
      });
      throw new Error(`Failed to exchange authorization code: ${tokenResponse.status} ${errorText}`);
    }

    const tokens = await tokenResponse.json();

    console.log("📦 Received tokens:", {
      hasAccessToken: !!tokens.access_token,
      hasRefreshToken: !!tokens.refresh_token,
      expiresIn: tokens.expires_in,
      scope: tokens.scope,
    });

    if (!tokens.refresh_token) {
      console.error("⚠️ No refresh token received from Google. This might mean:");
      console.error("  1. User already authorized this app before");
      console.error("  2. Need to revoke access at https://myaccount.google.com/permissions");
      console.error("  3. Or the prompt=consent parameter didn't work");
    }

    // Store tokens in the database
    // First, find or create a Google account record for this user
    const existingAccount = await db.account.findFirst({
      where: {
        userId: session.user.id,
        provider: "google",
      },
    });

    if (existingAccount) {
      // Update existing account with calendar tokens
      // IMPORTANT: Only update refresh_token if we got a new one
      const updateData: {
        access_token: string;
        refresh_token?: string;
        expires_at: number | null;
        scope: string;
      } = {
        access_token: tokens.access_token,
        expires_at: tokens.expires_in ? Math.floor(Date.now() / 1000) + tokens.expires_in : null,
        scope: tokens.scope,
      };

      // Only update refresh_token if Google sent a new one
      if (tokens.refresh_token) {
        updateData.refresh_token = tokens.refresh_token;
      }

      await db.account.update({
        where: {
          id: existingAccount.id,
        },
        data: updateData,
      });

      console.log("✅ Updated existing Google account with new tokens");
    } else {
      // User doesn't have a Google account yet (e.g., signed in with Discord)
      // Create a new Google Account record
      if (!tokens.refresh_token) {
        console.error("❌ Cannot create Google account without refresh token!");
        redirect(`${returnUrl}?calendar_error=no_refresh_token`);
      }

      // Get provider account ID from Google
      const userInfoResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
        },
      });

      if (!userInfoResponse.ok) {
        throw new Error("Failed to fetch Google user info");
      }

      const userInfo = await userInfoResponse.json();

      await db.account.create({
        data: {
          userId: session.user.id,
          type: "oauth",
          provider: "google",
          providerAccountId: userInfo.id,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expires_at: tokens.expires_in ? Math.floor(Date.now() / 1000) + tokens.expires_in : null,
          token_type: tokens.token_type ?? "Bearer",
          scope: tokens.scope,
        },
      });

      console.log("✅ Created new Google account record for user");
    }

    console.log("✅ Calendar tokens stored successfully!");
    redirect(`${returnUrl}?calendar_connected=true`);
  } catch (error) {
    // Don't catch Next.js redirect errors
    if (error instanceof Error && error.message === 'NEXT_REDIRECT') {
      throw error;
    }

    console.error("Calendar OAuth error:", error);
    console.error("Error details:", {
      message: error instanceof Error ? error.message : 'Unknown error',
      code: (error as { code?: string } | null)?.code,
      response: (error as { response?: { data?: unknown } } | null)?.response?.data,
    });
    redirect(`${returnUrl}?calendar_error=token_exchange_failed`);
  }
}