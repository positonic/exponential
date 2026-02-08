import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "~/server/auth";
import { githubIntegrationService } from "~/server/services/github-integration";
import { App } from "octokit";
import { z } from "zod";

const callbackSchema = z.object({
  installation_id: z.string(),
  setup_action: z.enum(["install", "update"]).optional(),
  state: z.string().optional(),
  error: z.string().optional(),
  error_description: z.string().optional(),
});

// GitHub App credentials
const GITHUB_APP_ID = process.env.GITHUB_APP_ID!;
const GITHUB_PRIVATE_KEY = process.env.GITHUB_PRIVATE_KEY!;
const BASE_URL = process.env.NEXTAUTH_URL || "http://localhost:3000";

// In-memory store to track processed installation IDs (for development/demo)
// In production, use Redis or database to track processed installations
const processedInstallations = new Set<string>();

export async function GET(request: NextRequest) {
  try {
    // Add request tracking for debugging
    const requestId = crypto.randomUUID().slice(0, 8);
    console.log(
      `[GitHub Callback ${requestId}] Processing request: ${request.url}`,
    );

    // Check if this is a favicon, prefetch or other non-OAuth request
    const url = new URL(request.url);
    const headers = request.headers;

    if (url.pathname.includes("favicon") || url.pathname.includes(".ico")) {
      console.log(`[GitHub Callback ${requestId}] Ignoring favicon request`);
      return new NextResponse(null, { status: 404 });
    }

    // Check for prefetch requests
    const purpose = headers.get("Sec-Purpose") || headers.get("Purpose");
    if (purpose === "prefetch" || headers.get("X-Purpose") === "preview") {
      console.log(`[GitHub Callback ${requestId}] Ignoring prefetch request`);
      return new NextResponse(null, { status: 204 });
    }

    const session = await auth();

    if (!session?.user?.id) {
      console.log(`[GitHub Callback ${requestId}] Unauthorized - no session`);
      return NextResponse.redirect(
        `${BASE_URL}/auth/signin?error=unauthorized`,
      );
    }

    const { searchParams } = new URL(request.url);
    const params = Object.fromEntries(searchParams);

    console.log(`[GitHub Callback ${requestId}] URL params:`, {
      hasInstallationId: !!params.installation_id,
      hasSetupAction: !!params.setup_action,
      hasState: !!params.state,
      hasError: !!params.error,
    });

    const validatedParams = callbackSchema.parse(params);

    // Handle installation error
    if (validatedParams.error) {
      const errorMessage =
        validatedParams.error_description || validatedParams.error;
      console.log(
        `[GitHub Callback ${requestId}] Installation error:`,
        errorMessage,
      );
      return NextResponse.redirect(
        `${BASE_URL}/settings/integrations/github?error=${encodeURIComponent(errorMessage)}`,
      );
    }

    const { installation_id, state } = validatedParams;

    // Check if this installation has already been processed
    if (processedInstallations.has(installation_id)) {
      console.log(
        `[GitHub Callback ${requestId}] Installation already processed, redirecting to avoid duplicate`,
      );
      // Determine redirect URL based on state
      let redirectUrl = `${BASE_URL}/settings/integrations`;
      if (state) {
        try {
          const stateData = JSON.parse(Buffer.from(state, "base64").toString());
          if (stateData.projectId) {
            redirectUrl = `${BASE_URL}/projects/${stateData.projectId}?tab=workflows&github_already_connected=true`;
          }
        } catch (error) {
          console.error(
            `[GitHub Callback ${requestId}] Failed to parse state for redirect:`,
            error,
          );
        }
      }
      return NextResponse.redirect(redirectUrl);
    }

    // Mark this installation as being processed
    processedInstallations.add(installation_id);
    console.log(
      `[GitHub Callback ${requestId}] Processing new installation: ${installation_id}`,
    );

    // Parse state to get project ID if provided
    let projectId: string | undefined = undefined;
    let userId: string | null = null;
    if (state) {
      try {
        const stateData = JSON.parse(Buffer.from(state, "base64").toString());
        projectId = stateData.projectId || null;
        userId = stateData.userId || null;
      } catch (error) {
        console.error("Failed to parse state:", error);
      }
    }

    // Create GitHub App instance
    console.log(`[GitHub Callback ${requestId}] Creating GitHub App instance`);

    const app = new App({
      appId: GITHUB_APP_ID,
      privateKey: GITHUB_PRIVATE_KEY,
    });

    // Get installation Octokit instance (this handles token creation automatically)
    console.log(
      `[GitHub Callback ${requestId}] Getting installation Octokit for installation ${installation_id}`,
    );

    const installationOctokit = await app.getInstallationOctokit(
      parseInt(installation_id),
    );

    // Get installation details using the app's main Octokit (not installation-specific)
    const installation = await installationOctokit.rest.apps.getInstallation({
      installation_id: parseInt(installation_id),
    });

    const installationData = installation.data;
    const githubUser = installationData.account;

    // Get repositories accessible by this installation
    console.log(
      `[GitHub Callback ${requestId}] Fetching repositories for installation`,
    );

    const reposResponse =
      await installationOctokit.rest.apps.listReposAccessibleToInstallation({
        installation_id: parseInt(installation_id),
        per_page: 100,
      });

    const repositories = reposResponse.data.repositories;

    console.log("Repositories: ", repositories);
    console.log("Github user: ", githubUser);

    // For compatibility with the existing service, we need to get an access token
    // We'll create one manually to store it (though normally you'd use the installation Octokit)
    const tokenResponse =
      await installationOctokit.rest.apps.createInstallationAccessToken({
        installation_id: parseInt(installation_id),
      });

    const { token: access_token } = tokenResponse.data;

    // Create GitHub integration using the service
    const integration = await githubIntegrationService.createGitHubIntegration(
      session.user.id,
      {
        accessToken: access_token,
        scopes: installationData.permissions
          ? Object.keys(installationData.permissions)
          : [],
        githubUser,
        projectId,
        installationId: parseInt(installation_id),
        selectedRepository: repositories[0] || null, // Will be selected in the UI
      },
    );

    // Redirect back to the appropriate page
    let redirectUrl: string;

    if (projectId) {
      // For project-specific integrations, include github_auth data for repository selection
      const githubAuthData = {
        accessToken: access_token,
        scopes: installationData.permissions
          ? Object.keys(installationData.permissions)
          : [],
        githubUser: {
          login: githubUser?.name,
          url: githubUser?.html_url ? githubUser.html_url : "",
          html_url: githubUser?.html_url || "",
        },
        availableRepositories: repositories.map((repo: any) => ({
          id: repo.id,
          name: repo.name,
          full_name: repo.full_name,
          html_url: repo.html_url,
          private: repo.private,
          language: repo.language,
          description: repo.description,
          permissions: repo.permissions,
        })),
        integrationId: integration.id,
        projectId,
        userId: userId,
      };

      console.log("github auth data: ", githubAuthData);

      const githubAuthParam = Buffer.from(
        JSON.stringify(githubAuthData),
      ).toString("base64");
      redirectUrl = `${BASE_URL}/projects/${projectId}?tab=workflows&github_auth=${encodeURIComponent(githubAuthParam)}`;
    } else {
      redirectUrl = `${BASE_URL}/settings/integrations`;
    }

    console.log(
      `[GitHub Callback ${requestId}] Successfully processed, redirecting to:`,
      redirectUrl,
    );

    // Clean up processed installation after successful completion
    setTimeout(() => {
      processedInstallations.delete(installation_id);
    }, 60000); // Clean up after 1 minute

    return NextResponse.redirect(redirectUrl);
  } catch (error) {
    const requestId = crypto.randomUUID().slice(0, 8);
    console.error(
      `[GitHub Callback ${requestId}] OAuth callback error:`,
      error,
    );

    // Clean up processed installation on error
    const url = new URL(request.url);
    const installation_id = url.searchParams.get("installation_id");
    if (installation_id && processedInstallations.has(installation_id)) {
      processedInstallations.delete(installation_id);
    }

    const errorMessage =
      error instanceof Error ? error.message : "OAuth callback failed";
    return NextResponse.redirect(
      `${BASE_URL}/settings/integrations/github?error=${encodeURIComponent(errorMessage)}`,
    );
  }
}
