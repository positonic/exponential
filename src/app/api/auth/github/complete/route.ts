import { NextRequest, NextResponse } from "next/server";
import { auth } from "~/server/auth";
import { githubIntegrationService } from "~/server/services/github-integration";
import { z } from "zod";

const completeSchema = z.object({
  authToken: z.string(),
  repositoryId: z.number(),
});

const BASE_URL = process.env.NEXTAUTH_URL || "http://localhost:3000";

export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { authToken, repositoryId } = completeSchema.parse(body);

    // Decode auth data from temporary storage
    let authData;
    try {
      authData = JSON.parse(Buffer.from(authToken, "base64").toString());
    } catch (error) {
      return NextResponse.json(
        { error: "Invalid auth token" },
        { status: 400 },
      );
    }

    // Validate auth data is recent (within 10 minutes)
    if (Date.now() - authData.timestamp > 10 * 60 * 1000) {
      return NextResponse.json(
        { error: "Auth token expired" },
        { status: 400 },
      );
    }

    // Validate user matches
    if (authData.userId !== session.user.id) {
      return NextResponse.json(
        { error: "Auth token mismatch" },
        { status: 400 },
      );
    }

    // Find the selected repository
    const selectedRepository = authData.availableRepositories.find(
      (repo: any) => repo.id === repositoryId,
    );

    if (!selectedRepository) {
      return NextResponse.json(
        { error: "Repository not found" },
        { status: 400 },
      );
    }

    // Create GitHub integration with selected repository
    await githubIntegrationService.updateGithubIntegration(
      session.user.id,
      authData.integrationId,
      {
        accessToken: authData.accessToken,
        scopes: authData.scopes,
        githubUser: authData.githubUser,
        selectedRepository,
        installationId: selectedRepository.installationId,
        projectId: authData.projectId,
      },
    );

    // Return success with redirect URL
    const redirectUrl = authData.projectId
      ? `${BASE_URL}/projects/${authData.projectId}?tab=workflows&github_connected=true`
      : `${BASE_URL}/integrations`;

    return NextResponse.json({
      success: true,
      integrationId: authData.integrationId,
      redirectUrl,
    });
  } catch (error) {
    console.error("GitHub OAuth completion error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "OAuth completion failed";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
