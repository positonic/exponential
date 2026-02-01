import { auth } from "~/server/auth";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import type { NextRequest } from "next/server";

/**
 * Google OAuth scope sets for incremental authorization.
 *
 * We use incremental authorization to minimize permissions requested during onboarding:
 * - "calendar": Only calendar access (sensitive scope, faster Google verification)
 * - "contacts": Calendar + Contacts (sensitive scopes)
 * - "crm": Calendar + Contacts + Gmail (includes restricted scope, requires security audit)
 */
export const GOOGLE_SCOPE_SETS = {
  calendar: [
    "https://www.googleapis.com/auth/calendar.events",
  ],
  contacts: [
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/contacts.readonly",
  ],
  crm: [
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/contacts.readonly",
    "https://www.googleapis.com/auth/gmail.readonly",
  ],
} as const;

export type GoogleScopeType = keyof typeof GOOGLE_SCOPE_SETS;

export async function GET(request: NextRequest) {
  const session = await auth();

  if (!session?.user) {
    redirect("/signin");
  }

  // Get query params
  const { searchParams } = new URL(request.url);
  const returnUrl = searchParams.get("returnUrl") ?? "/plan";

  // Get scope type - defaults to "calendar" for minimal permissions
  const scopeTypeParam = searchParams.get("type") ?? "calendar";
  const scopeType: GoogleScopeType =
    scopeTypeParam in GOOGLE_SCOPE_SETS
      ? (scopeTypeParam as GoogleScopeType)
      : "calendar";

  const scopes = GOOGLE_SCOPE_SETS[scopeType].join(" ");

  // Get the host from the request headers to handle different ports
  const headersList = await headers();
  const host = headersList.get('host') ?? 'localhost:3000';
  const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
  const baseUrl = `${protocol}://${host}`;

  // Encode userId, returnUrl, and scopeType in state for security and redirect
  const state = Buffer.from(JSON.stringify({
    userId: session.user.id,
    returnUrl,
    scopeType,
  })).toString('base64');

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: `${baseUrl}/api/auth/google-calendar/callback`,
    response_type: "code",
    scope: scopes,
    access_type: "offline",
    prompt: "consent", // Force consent screen to ensure we get all permissions
    state,
  });

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

  redirect(authUrl);
}