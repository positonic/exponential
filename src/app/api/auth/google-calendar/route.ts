import { auth } from "~/server/auth";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import type { NextRequest } from "next/server";

// Combined scopes for Calendar, Contacts, and Gmail
const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/contacts.readonly",
  "https://www.googleapis.com/auth/gmail.readonly",
].join(" ");

export async function GET(request: NextRequest) {
  const session = await auth();

  if (!session?.user) {
    redirect("/signin");
  }

  // Get return URL from query params (where to redirect after OAuth)
  const { searchParams } = new URL(request.url);
  const returnUrl = searchParams.get("returnUrl") ?? "/plan";

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
    scope: GOOGLE_SCOPES,
    access_type: "offline",
    prompt: "consent", // Force consent screen to ensure we get all permissions
    state,
  });

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

  redirect(authUrl);
}