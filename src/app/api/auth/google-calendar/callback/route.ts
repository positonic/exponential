import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { headers } from "next/headers";

export async function GET(request: NextRequest) {
  const session = await auth();
  
  if (!session?.user) {
    redirect("/signin");
  }

  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) {
    redirect("/today?calendar_error=access_denied");
  }

  if (!code || state !== session.user.id) {
    redirect("/today?calendar_error=invalid_request");
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
      await db.account.update({
        where: {
          id: existingAccount.id,
        },
        data: {
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token || existingAccount.refresh_token,
          expires_at: tokens.expires_in ? Math.floor(Date.now() / 1000) + tokens.expires_in : null,
          scope: tokens.scope,
        },
      });
    } else {
      // This shouldn't happen if user signed in with Google, but handle gracefully
      redirect("/today?calendar_error=no_google_account");
    }

    console.log("✅ Calendar tokens stored successfully!");
    redirect("/today?calendar_connected=true");
  } catch (error) {
    // Don't catch Next.js redirect errors
    if (error instanceof Error && error.message === 'NEXT_REDIRECT') {
      throw error;
    }
    
    console.error("Calendar OAuth error:", error);
    console.error("Error details:", {
      message: error instanceof Error ? error.message : 'Unknown error',
      code: (error as any)?.code,
      response: (error as any)?.response?.data,
    });
    redirect("/today?calendar_error=token_exchange_failed");
  }
}