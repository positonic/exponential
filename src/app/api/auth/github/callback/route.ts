import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { githubIntegrationService } from "~/server/services/github-integration";
import { isGithubAppConfigured } from "~/server/services/github/connectionState";
import { App } from "octokit";
import { z } from "zod";
import {
  workspaceGithubSettingsPath,
  type GithubInstallResult,
} from "~/lib/github/installResult";
import {
  resolveInstallReturnPath,
  resolveInstallTarget,
} from "~/server/services/github/installReturn";

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

/** The workspace an install was started from, as an absolute URL, or null. */
async function workspaceReturnUrl(
  state: string | null | undefined,
  userId: string,
  result?: GithubInstallResult,
): Promise<string | null> {
  const path = await resolveInstallReturnPath(db, state, userId, result);
  return path ? `${BASE_URL}${path}` : null;
}

/**
 * The account integrations page shows `?error=` as a notification. Every
 * message passed here is written in this file: text from GitHub's query string
 * or from an exception never reaches it, since the page displays it as is.
 */
function accountErrorUrl(message: string): string {
  return `${BASE_URL}/settings/integrations?error=${encodeURIComponent(message)}`;
}

export async function GET(request: NextRequest) {
  const isDev = process.env.NODE_ENV !== "production";
  // One id for the whole request, so the catch block's log lines can be matched
  // to the ones above them.
  const requestId = crypto.randomUUID().slice(0, 8);
  try {
    if (isDev) {
      console.log(
        `[GitHub Callback ${requestId}] Processing request: ${request.url}`,
      );
    }

    // Check if this is a favicon, prefetch or other non-OAuth request
    const url = new URL(request.url);
    const headers = request.headers;

    if (url.pathname.includes("favicon") || url.pathname.includes(".ico")) {
      return new NextResponse(null, { status: 404 });
    }

    // Check for prefetch requests
    const purpose = headers.get("Sec-Purpose") || headers.get("Purpose");
    if (purpose === "prefetch" || headers.get("X-Purpose") === "preview") {
      return new NextResponse(null, { status: 204 });
    }

    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.redirect(
        `${BASE_URL}/auth/signin?error=unauthorized`,
      );
    }

    // L1 prerequisite: without the GitHub App env the SDK can't mint an
    // installation token. Degrade gracefully instead of throwing a 500.
    if (!isGithubAppConfigured()) {
      return NextResponse.redirect(
        (await workspaceReturnUrl(
          url.searchParams.get("state"),
          session.user.id,
          "failed",
        )) ?? accountErrorUrl("GitHub isn't set up on this deployment yet"),
      );
    }

    const { searchParams } = new URL(request.url);
    const params = Object.fromEntries(searchParams);

    if (isDev) {
      console.log(`[GitHub Callback ${requestId}] URL params:`, {
        hasInstallationId: !!params.installation_id,
        hasSetupAction: !!params.setup_action,
        hasState: !!params.state,
        hasError: !!params.error,
      });
    }

    // GitHub reports a refused or failed install as `error`, usually with no
    // installation_id, so this is checked before the schema requires one.
    if (params.error) {
      return NextResponse.redirect(
        (await workspaceReturnUrl(params.state, session.user.id, "failed")) ??
          accountErrorUrl("GitHub reported that the install did not complete"),
      );
    }

    const validatedParams = callbackSchema.parse(params);

    const { installation_id, state } = validatedParams;

    // Check if this installation has already been processed
    if (processedInstallations.has(installation_id)) {
      // Determine redirect URL based on state. A repeat hit for a workspace
      // install goes back to that workspace, with no result: the first hit
      // reports it.
      let redirectUrl =
        (await workspaceReturnUrl(state, session.user.id)) ??
        `${BASE_URL}/settings/integrations`;
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

    // Parse state to get project / workspace context if provided
    let projectId: string | undefined = undefined;
    let workspaceId: string | undefined = undefined;
    let userId: string | null = null;
    if (state) {
      try {
        const stateData = JSON.parse(Buffer.from(state, "base64").toString());
        projectId = stateData.projectId || undefined;
        workspaceId = stateData.workspaceId || undefined;
        userId = stateData.userId || null;
      } catch (error) {
        console.error("Failed to parse state:", error);
      }
    }

    // Create GitHub App instance
    const app = new App({
      appId: GITHUB_APP_ID,
      privateKey: GITHUB_PRIVATE_KEY,
    });

    // Get installation Octokit instance (this handles token creation automatically)
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
    const reposResponse =
      await installationOctokit.rest.apps.listReposAccessibleToInstallation({
        installation_id: parseInt(installation_id),
        per_page: 100,
      });

    const repositories = reposResponse.data.repositories;

    // For compatibility with the existing service, we need to get an access token
    // We'll create one manually to store it (though normally you'd use the installation Octokit)
    const tokenResponse =
      await installationOctokit.rest.apps.createInstallationAccessToken({
        installation_id: parseInt(installation_id),
      });

    const { token: access_token } = tokenResponse.data;

    const scopes = installationData.permissions
      ? Object.keys(installationData.permissions)
      : [];

    // ── New workspace connect flow (ADR-0020) ──────────────────────────────
    // When the install was started from a workspace, upsert the ONE
    // workspace-scoped installation Integration and round-trip back to the
    // workspace so repos can be associated (slice #3). This replaces the
    // legacy one-Integration-per-repo shape for the workspace flow.
    if (workspaceId) {
      // Connecting GitHub is an owner/admin action, as it is in the UI and in
      // the repository mutations. Membership alone is not enough: a viewer
      // could otherwise build the install link by hand.
      const target = await resolveInstallTarget(
        db,
        workspaceId,
        session.user.id,
      );
      if (target.status === "not_member") {
        processedInstallations.delete(installation_id);
        return NextResponse.redirect(
          accountErrorUrl("Not a member of the target workspace"),
        );
      }
      if (target.status === "forbidden") {
        processedInstallations.delete(installation_id);
        return NextResponse.redirect(
          `${BASE_URL}${workspaceGithubSettingsPath(target.slug, "forbidden")}`,
        );
      }

      await githubIntegrationService.upsertWorkspaceInstallation({
        workspaceId,
        addedById: session.user.id,
        installationId: parseInt(installation_id),
        accessToken: access_token,
        scopes,
        githubUser,
        accessibleRepos: reposResponse.data,
      });

      setTimeout(() => {
        processedInstallations.delete(installation_id);
      }, 60000);

      // Back to the workspace the install was started from. `/integrations`
      // carries no workspace, so it showed the default workspace's repositories
      // instead of the one that was just connected.
      return NextResponse.redirect(
        `${BASE_URL}${workspaceGithubSettingsPath(
          target.slug,
          validatedParams.setup_action === "update" ? "updated" : "connected",
        )}`,
      );
    }

    // ── Legacy project connect flow (unchanged) ────────────────────────────
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

      const githubAuthParam = Buffer.from(
        JSON.stringify(githubAuthData),
      ).toString("base64");
      redirectUrl = `${BASE_URL}/projects/${projectId}?tab=workflows&github_auth=${encodeURIComponent(githubAuthParam)}`;
    } else {
      redirectUrl = `${BASE_URL}/settings/integrations`;
    }

    // Clean up processed installation after successful completion
    setTimeout(() => {
      processedInstallations.delete(installation_id);
    }, 60000); // Clean up after 1 minute

    return NextResponse.redirect(redirectUrl);
  } catch (error) {
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

    // A workspace install goes back to its workspace with a fixed "failed"
    // notice; the detail stays in the log above. Looking the workspace up can
    // itself fail (the session or the database may be what broke), and then the
    // account page is the fallback.
    try {
      const session = await auth();
      const workspaceUrl = session?.user?.id
        ? await workspaceReturnUrl(
            url.searchParams.get("state"),
            session.user.id,
            "failed",
          )
        : null;
      if (workspaceUrl) return NextResponse.redirect(workspaceUrl);
    } catch (lookupError) {
      console.error(
        `[GitHub Callback ${requestId}] Could not resolve the workspace to return to:`,
        lookupError,
      );
    }

    // The exception is logged above; its text is not shown to the user.
    return NextResponse.redirect(
      accountErrorUrl("GitHub couldn't be connected. Please try again."),
    );
  }
}
