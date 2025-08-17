import { auth } from "~/server/auth";
import { redirect } from "next/navigation";
import { headers } from "next/headers";

const GOOGLE_CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events",
].join(" ");

export async function GET() {
  const session = await auth();
  
  if (!session?.user) {
    redirect("/signin");
  }

  // Get the host from the request headers to handle different ports
  const headersList = await headers();
  const host = headersList.get('host') || 'localhost:3000';
  const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
  const baseUrl = `${protocol}://${host}`;

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: `${baseUrl}/api/auth/google-calendar/callback`,
    response_type: "code",
    scope: GOOGLE_CALENDAR_SCOPES,
    access_type: "offline",
    prompt: "consent", // Force consent screen to ensure we get calendar permissions
    state: session.user.id, // Pass user ID for security
  });

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  
  redirect(authUrl);
}