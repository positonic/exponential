import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "~/server/auth";
import { isGithubAppConfigured } from "~/server/services/github/connectionState";
import { z } from "zod";

const authorizeSchema = z.object({
  projectId: z.string().optional(),
  workspaceId: z.string().optional(),
  redirectUrl: z.string().url().optional(),
});

const BASE_URL = process.env.NEXTAUTH_URL || "http://localhost:3000";

// GitHub App credentials (currently unused)
// const GITHUB_APP_ID = process.env.GITHUB_APP_ID!;
// const BASE_URL = process.env.NEXTAUTH_URL || "http://localhost:3000";

export async function GET(request: NextRequest) {
  try {
    // Get current session
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // L1 prerequisite: can't start an install without the GitHub App
    // registered. Degrade gracefully instead of sending the user to a broken
    // github.com/apps/your-app-name URL.
    if (!isGithubAppConfigured()) {
      return NextResponse.redirect(
        `${BASE_URL}/integrations?error=github_not_configured`,
      );
    }

    const { searchParams } = new URL(request.url);
    const params = Object.fromEntries(searchParams);

    const { projectId, workspaceId, redirectUrl } =
      authorizeSchema.parse(params);

    // Create state parameter to maintain context. `workspaceId` is what makes
    // the install round-trip back to the originating workspace (ADR-0020).
    const state = Buffer.from(
      JSON.stringify({
        userId: session.user.id,
        projectId,
        workspaceId,
        redirectUrl,
        timestamp: Date.now(),
      }),
    ).toString("base64");

    // Redirect to GitHub App installation, carrying state through the install.
    const appSlug = process.env.GITHUB_APP_SLUG!;
    const installUrl = new URL(
      `https://github.com/apps/${appSlug}/installations/new`,
    );
    installUrl.searchParams.set("state", state);

    // The install round-trips back to our setup-url (the callback route).
    return NextResponse.redirect(installUrl.toString());
  } catch (error) {
    console.error("GitHub OAuth authorization error:", error);
    return NextResponse.json(
      { error: "Failed to initiate GitHub authorization" },
      { status: 500 },
    );
  }
}
