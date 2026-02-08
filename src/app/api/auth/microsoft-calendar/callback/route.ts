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
    return JSON.parse(Buffer.from(state, "base64").toString()) as OAuthState;
  } catch {
    return null;
  }
}

interface MicrosoftTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope: string;
  token_type?: string;
}

interface MicrosoftUserInfo {
  id: string;
  displayName?: string;
  mail?: string;
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

  const state = parseState(stateParam);
  const returnUrl = state?.returnUrl ?? "/plan";

  if (error) {
    redirect(`${returnUrl}?calendar_error=access_denied`);
  }

  if (!code || !state || state.userId !== session.user.id) {
    redirect(`${returnUrl}?calendar_error=invalid_request`);
  }

  const headersList = await headers();
  const host = headersList.get("host") ?? "localhost:3000";
  const protocol = process.env.NODE_ENV === "production" ? "https" : "http";
  const baseUrl = `${protocol}://${host}`;

  const tenantId = process.env.MICROSOFT_ENTRA_ID_TENANT_ID ?? "common";

  try {
    console.log("🔄 Starting Microsoft token exchange...");

    const tokenResponse = await fetch(
      `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: process.env.MICROSOFT_ENTRA_ID_CLIENT_ID!,
          client_secret: process.env.MICROSOFT_ENTRA_ID_CLIENT_SECRET!,
          code,
          grant_type: "authorization_code",
          redirect_uri: `${baseUrl}/api/auth/microsoft-calendar/callback`,
          scope: "Calendars.Read Calendars.ReadWrite offline_access",
        }),
      },
    );

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error("❌ Microsoft token exchange failed:", {
        status: tokenResponse.status,
        response: errorText,
      });
      throw new Error(
        `Failed to exchange authorization code: ${tokenResponse.status} ${errorText}`,
      );
    }

    const tokens = (await tokenResponse.json()) as MicrosoftTokenResponse;

    console.log("📦 Received Microsoft tokens:", {
      hasAccessToken: !!tokens.access_token,
      hasRefreshToken: !!tokens.refresh_token,
      expiresIn: tokens.expires_in,
      scope: tokens.scope,
    });

    // Fetch the Microsoft account's email address
    const msUserInfoResponse = await fetch(
      "https://graph.microsoft.com/v1.0/me",
      {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      },
    );
    const msUserInfo = msUserInfoResponse.ok
      ? ((await msUserInfoResponse.json()) as MicrosoftUserInfo)
      : null;

    // Find existing Microsoft account for this user
    const existingAccount = await db.account.findFirst({
      where: {
        userId: session.user.id,
        provider: "microsoft-entra-id",
      },
    });

    if (existingAccount) {
      // Update existing account with calendar tokens
      const updateData: {
        access_token: string;
        refresh_token?: string;
        expires_at: number | null;
        scope: string;
        providerEmail?: string;
      } = {
        access_token: tokens.access_token,
        expires_at: tokens.expires_in
          ? Math.floor(Date.now() / 1000) + tokens.expires_in
          : null,
        scope: tokens.scope,
      };

      if (tokens.refresh_token) {
        updateData.refresh_token = tokens.refresh_token;
      }

      if (msUserInfo?.mail) {
        updateData.providerEmail = msUserInfo.mail;
      }

      await db.account.update({
        where: { id: existingAccount.id },
        data: updateData,
      });

      console.log(
        "✅ Updated existing Microsoft account with calendar tokens",
      );
    } else {
      // User doesn't have a Microsoft account yet (signed in with Google/Discord/email)
      if (!tokens.refresh_token) {
        console.error(
          "❌ Cannot create Microsoft account without refresh token!",
        );
        redirect(`${returnUrl}?calendar_error=no_refresh_token`);
      }

      if (!msUserInfo) {
        throw new Error("Failed to fetch Microsoft user info");
      }

      await db.account.create({
        data: {
          userId: session.user.id,
          type: "oauth",
          provider: "microsoft-entra-id",
          providerAccountId: msUserInfo.id,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expires_at: tokens.expires_in
            ? Math.floor(Date.now() / 1000) + tokens.expires_in
            : null,
          token_type: tokens.token_type ?? "Bearer",
          scope: tokens.scope,
          providerEmail: msUserInfo.mail,
        },
      });

      console.log("✅ Created new Microsoft account record for user");
    }

    console.log("✅ Microsoft Calendar tokens stored successfully!");
    redirect(`${returnUrl}?microsoft_calendar_connected=true`);
  } catch (error) {
    // Don't catch Next.js redirect errors
    if (
      error instanceof Error &&
      error.message === "NEXT_REDIRECT"
    ) {
      throw error;
    }

    console.error("Microsoft Calendar OAuth error:", error);
    redirect(`${returnUrl}?calendar_error=token_exchange_failed`);
  }
}
