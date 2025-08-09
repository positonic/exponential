import { auth } from "~/server/auth";
import { redirect } from "next/navigation";

const GOOGLE_CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events",
].join(" ");

export async function GET() {
  const session = await auth();
  
  if (!session?.user) {
    redirect("/use-the-force");
  }

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: `${process.env.NEXTAUTH_URL || "http://localhost:3000"}/api/auth/google-calendar/callback`,
    response_type: "code",
    scope: GOOGLE_CALENDAR_SCOPES,
    access_type: "offline",
    prompt: "consent", // Force consent screen to ensure we get calendar permissions
    state: session.user.id, // Pass user ID for security
  });

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  
  redirect(authUrl);
}