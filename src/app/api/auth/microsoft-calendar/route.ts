import { auth } from "~/server/auth";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import type { NextRequest } from "next/server";

const MICROSOFT_CALENDAR_SCOPES = [
  "Calendars.Read",
  "Calendars.ReadWrite",
  "offline_access",
];

export async function GET(request: NextRequest) {
  const session = await auth();

  if (!session?.user) {
    redirect("/signin");
  }

  const { searchParams } = new URL(request.url);
  const returnUrl = searchParams.get("returnUrl") ?? "/plan";

  const headersList = await headers();
  const host = headersList.get("host") ?? "localhost:3000";
  const protocol = process.env.NODE_ENV === "production" ? "https" : "http";
  const baseUrl = `${protocol}://${host}`;

  const state = Buffer.from(
    JSON.stringify({
      userId: session.user.id,
      returnUrl,
    }),
  ).toString("base64");

  const tenantId = process.env.MICROSOFT_ENTRA_ID_TENANT_ID ?? "common";

  const params = new URLSearchParams({
    client_id: process.env.MICROSOFT_ENTRA_ID_CLIENT_ID!,
    redirect_uri: `${baseUrl}/api/auth/microsoft-calendar/callback`,
    response_type: "code",
    scope: MICROSOFT_CALENDAR_SCOPES.join(" "),
    response_mode: "query",
    state,
    prompt: "consent",
  });

  const authUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?${params.toString()}`;

  redirect(authUrl);
}
