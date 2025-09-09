import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "~/server/auth";
import { z } from "zod";

const authorizeSchema = z.object({
  projectId: z.string().optional(),
  redirectUrl: z.string().url().optional(),
});

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

    const { searchParams } = new URL(request.url);
    const params = Object.fromEntries(searchParams);

    const { projectId, redirectUrl } = authorizeSchema.parse(params);

    // Create state parameter to maintain context
    const state = Buffer.from(
      JSON.stringify({
        userId: session.user.id,
        projectId,
        redirectUrl,
        timestamp: Date.now(),
      }),
    ).toString("base64");

    // For GitHub App, we need to determine if the user has already installed the app
    // If not, redirect to installation. If yes, redirect to repository selection.
    
    // GitHub App installation URL - replace YOUR_APP_SLUG with your actual app slug
    const appSlug = process.env.GITHUB_APP_SLUG || "your-app-name";
    
    // First, redirect to GitHub App installation with state
    const installUrl = new URL(`https://github.com/apps/${appSlug}/installations/new`);
    installUrl.searchParams.set("state", state);
    
    // The installation process will redirect back to our setup-url configured in the GitHub App
    console.log(`Redirecting to GitHub App installation: ${installUrl.toString()}`);
    
    return NextResponse.redirect(installUrl.toString());
  } catch (error) {
    console.error("GitHub OAuth authorization error:", error);
    return NextResponse.json(
      { error: "Failed to initiate GitHub authorization" },
      { status: 500 },
    );
  }
}
