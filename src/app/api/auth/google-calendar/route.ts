import { auth } from "~/server/auth";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import type { NextRequest } from "next/server";

const GOOGLE_CALENDAR_SCOPES = "https://www.googleapis.com/auth/calendar.events";

export async function GET(request: NextRequest) {
  const session = await auth();

  if (!session?.user) {
    redirect("/signin");
  }

  // Get return URL from query params (where to redirect after OAuth)
  const { searchParams } = new URL(request.url);
  const returnUrl = searchParams.get("returnUrl") ?? "/today";

  // Get the host from the request headers to handle different ports
  const headersList = await headers();
  const host = headersList.get('host') ?? 'localhost:3000';
  const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
  const baseUrl = `${protocol}://${host}`;

  // Encode userId and returnUrl in state for security and redirect
  const state = Buffer.from(JSON.stringify({
    userId: session.user.id,
    returnUrl,
  })).toString('base64');

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: `${baseUrl}/api/auth/google-calendar/callback`,
    response_type: "code",
    scope: GOOGLE_CALENDAR_SCOPES,
    access_type: "offline",
    prompt: "consent", // Force consent screen to ensure we get calendar permissions
    state,
  });

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

  redirect(authUrl);
}