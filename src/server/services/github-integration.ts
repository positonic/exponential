import { db } from "~/server/db";
import { App } from "octokit";
import type {
  Integration,
  IntegrationCredential,
  Prisma,
  Workflow,
} from "@prisma/client";
import { encryptCredential } from "~/server/utils/credentialHelper";
import {
  GITHUB_INSTALLATION_PROVIDER,
  GITHUB_INSTALLATION_TYPE,
  isGithubAppConfigured,
} from "~/server/services/github/connectionState";
import {
  normalizeAccessibleRepos,
  type RepoOption,
} from "~/server/services/github/accessibleRepos";

/** Minimal GitHub account shape captured at install time (account = user or org). */
interface GitHubAccount {
  id?: number;
  login?: string;
  avatar_url?: string;
  html_url?: string;
}

interface UpsertWorkspaceInstallationParams {
  workspaceId: string;
  /** User who performed the install — recorded as the Integration's `userId`. */
  addedById: string;
  installationId: number;
  accessToken: string;
  scopes: string[];
  githubUser: GitHubAccount | null;
  /**
   * Raw `apps.listReposAccessibleToInstallation` payload, stashed on the
   * Integration's `providerConfig` so `listAccessibleRepos` can offer repos for
   * selection without a live GitHub call (and works when L1 env is absent).
   */
  accessibleRepos: unknown;
}

interface GitHubIssue {
  id: number;
  number: number;
  title: string;
  body: string | null;
  state: "open" | "closed";
  labels: Array<{ name: string; color: string }>;
  assignees: Array<{ login: string; avatar_url: string }>;
  created_at: string;
  updated_at: string;
  html_url: string;
}

interface GitHubRepository {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  html_url: string;
}

type GitHubIntegration = Integration & {
  credentials: IntegrationCredential[];
};

class GitHubIntegrationService {
  private async getAccessToken(
    integration: GitHubIntegration,
  ): Promise<string> {
    const tokenCredential = integration.credentials.find(
      (cred) => cred.keyType === "access_token",
    );

    if (!tokenCredential) {
      throw new Error("GitHub access token not found");
    }

    return tokenCredential.key;
  }

  private async makeGitHubRequest(
    integration: GitHubIntegration,
    endpoint: string,
    options: RequestInit = {},
  ) {
    const accessToken = await this.getAccessToken(integration);

    const response = await fetch(`https://api.github.com${endpoint}`, {
      ...options,
      headers: {
        Authorization: `token ${accessToken}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "your-app-name/1.0",
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`GitHub API error: ${response.status} ${error}`);
    }

    return response.json();
  }

  /**
   * Upsert the ONE workspace-scoped GitHub App installation `Integration`
   * (ADR-0020, L2). Replaces the legacy one-Integration-per-repo shape for the
   * workspace connect flow: a workspace has at most one installation row
   * (`provider=github`, `type=github_app_installation`, `status=ACTIVE`), which
   * is the FK target for `WorkspaceRepository`. Idempotent — re-installing
   * refreshes the token, accessible-repo list, and metadata in place.
   */
  async upsertWorkspaceInstallation(
    params: UpsertWorkspaceInstallationParams,
  ): Promise<Integration> {
    const {
      workspaceId,
      addedById,
      installationId,
      accessToken,
      scopes,
      githubUser,
      accessibleRepos,
    } = params;

    const existing = await db.integration.findFirst({
      where: {
        workspaceId,
        provider: GITHUB_INSTALLATION_PROVIDER,
        type: GITHUB_INSTALLATION_TYPE,
      },
      select: { id: true },
    });

    const providerConfig: Prisma.InputJsonValue = {
      installationId,
      // Retained for the later identity-claim phase; never used to attribute
      // commits in this slice.
      githubLogin: githubUser?.login ?? null,
      // Raw GitHub payload (JSON-serializable); normalized on read.
      accessibleRepos: (accessibleRepos ?? null) as Prisma.InputJsonValue,
    };

    const data = {
      name: "GitHub",
      type: GITHUB_INSTALLATION_TYPE,
      provider: GITHUB_INSTALLATION_PROVIDER,
      status: "ACTIVE",
      description: "GitHub App installation for this workspace",
      workspaceId,
      userId: addedById,
      lastSyncAt: new Date(),
      providerConfig,
    };

    const integration = existing
      ? await db.integration.update({ where: { id: existing.id }, data })
      : await db.integration.create({ data });

    // Refresh the credentials we own for this installation. Replace-in-place so
    // re-installs don't accumulate stale token/metadata rows.
    const encryptedToken = encryptCredential(accessToken);
    await db.integrationCredential.deleteMany({
      where: {
        integrationId: integration.id,
        keyType: { in: ["access_token", "github_metadata"] },
      },
    });
    await db.integrationCredential.createMany({
      data: [
        {
          integrationId: integration.id,
          key: encryptedToken.key,
          keyType: "access_token",
          isEncrypted: encryptedToken.isEncrypted,
        },
        {
          integrationId: integration.id,
          key: JSON.stringify({
            githubUserId: githubUser?.id,
            githubUsername: githubUser?.login,
            avatarUrl: githubUser?.avatar_url,
            scopes,
            installationId,
          }),
          keyType: "github_metadata",
          isEncrypted: false,
        },
      ],
    });

    return integration;
  }

  /**
   * Re-fetch the repos accessible to a workspace's installation directly from
   * GitHub and refresh the cached `providerConfig.accessibleRepos` (ADR-0020,
   * slice #3 follow-up). Paginates so installations with >100 repos are fully
   * listed. Lets a user who just granted the App access to more repos on GitHub
   * see them without re-installing. Never throws on config: returns `[]` when
   * the workspace isn't installed, and falls back to the cached list (writing
   * nothing) when L1 env is absent or the installation id is unusable.
   */
  async refreshWorkspaceAccessibleRepos(
    workspaceId: string,
  ): Promise<RepoOption[]> {
    const installation = await db.integration.findFirst({
      where: {
        workspaceId,
        provider: GITHUB_INSTALLATION_PROVIDER,
        type: GITHUB_INSTALLATION_TYPE,
        status: "ACTIVE",
      },
      select: { id: true, providerConfig: true },
    });
    if (!installation) return [];

    const cfg = (installation.providerConfig ?? {}) as Record<string, unknown>;
    const installationId = Number(cfg.installationId);
    if (!isGithubAppConfigured() || !Number.isFinite(installationId)) {
      return normalizeAccessibleRepos(cfg.accessibleRepos);
    }

    const app = new App({
      appId: process.env.GITHUB_APP_ID!,
      privateKey: process.env.GITHUB_PRIVATE_KEY!,
    });
    const octokit = await app.getInstallationOctokit(installationId);
    const repositories = await octokit.paginate(
      octokit.rest.apps.listReposAccessibleToInstallation,
      { per_page: 100 },
    );

    const accessibleRepos = { repositories };
    await db.integration.update({
      where: { id: installation.id },
      data: {
        providerConfig: {
          ...cfg,
          accessibleRepos,
        } as Prisma.InputJsonValue,
      },
    });

    return normalizeAccessibleRepos(accessibleRepos);
  }

  async createGitHubIntegration(
    userId: string,
    oauthData: {
      accessToken: string;
      scopes: string[];
      githubUser: any;
      selectedRepository: any;
      installationId?: number;
      projectId?: string;
    },
  ) {
    const {
      accessToken,
      scopes,
      githubUser,
      selectedRepository,
      installationId,
      projectId,
    } = oauthData;

    // Create the main integration record with project-specific naming
    const integration = await db.integration.create({
      data: {
        name: `GitHub - ${selectedRepository?.name}`,
        type: "oauth",
        provider: "github",
        status: "ACTIVE",
        description: `GitHub integration for ${selectedRepository?.full_name}`,
        userId,
        lastSyncAt: new Date(),
      },
    });

    // Store access token as encrypted credential
    const encryptedToken = encryptCredential(accessToken);
    await db.integrationCredential.create({
      data: {
        integrationId: integration.id,
        key: encryptedToken.key,
        keyType: "access_token",
        isEncrypted: encryptedToken.isEncrypted,
      },
    });

    // Store GitHub user info and metadata with only the selected repository
    await db.integrationCredential.create({
      data: {
        integrationId: integration.id,
        key: JSON.stringify({
          githubUserId: githubUser.id,
          githubUsername: githubUser.login,
          avatarUrl: githubUser.avatar_url,
          scopes,
          installationId,
          repository: {
            id: selectedRepository?.id,
            name: selectedRepository?.name,
            fullName: selectedRepository?.full_name,
            private: selectedRepository?.private,
            permissions: selectedRepository?.permissions,
          },
        }),
        keyType: "github_metadata",
        isEncrypted: false,
      },
    });

    // If this is for a specific project, create a workflow for GitHub sync
    if (projectId) {
      await this.createGitHubSyncWorkflow(integration.id, userId, projectId);
    }

    return integration;
  }

  async updateGithubIntegration(
    userId: string,
    integrationId: string,
    oauthData: {
      accessToken: string;
      scopes: string[];
      githubUser: any;
      selectedRepository: any;
      installationId?: number;
      projectId?: string;
    },
  ) {
    const {
      scopes,
      githubUser,
      selectedRepository,
      installationId,
    } = oauthData;

    // Create the main integration record with project-specific naming
    await db.integration.update({
      where: {
        id: integrationId,
      },
      data: {
        name: `GitHub - ${selectedRepository?.name}`,
        type: "oauth",
        provider: "github",
        status: "ACTIVE",
        description: `GitHub integration for ${selectedRepository?.full_name}`,
        userId,
        lastSyncAt: new Date(),
      },
    });

    // Store GitHub user info and metadata with only the selected repository
    await db.integrationCredential.updateMany({
      where: {
        integrationId: integrationId,
      },
      data: {
        integrationId: integrationId,
        key: JSON.stringify({
          githubUserId: githubUser.id,
          githubUsername: githubUser.login,
          avatarUrl: githubUser.avatar_url,
          scopes,
          installationId,
          repository: {
            id: selectedRepository?.id,
            name: selectedRepository?.name,
            fullName: selectedRepository?.full_name,
            private: selectedRepository?.private,
            permissions: selectedRepository?.permissions,
          },
        }),
        keyType: "github_metadata",
        isEncrypted: false,
      },
    });
  }

  private async createGitHubSyncWorkflow(
    integrationId: string,
    userId: string,
    projectId: string,
  ) {
    return db.workflow.create({
      data: {
        name: "GitHub Issues Sync",
        type: "github_issues",
        provider: "github",
        status: "ACTIVE",
        syncDirection: "pull", // GitHub → App
        syncFrequency: "realtime", // Via webhooks
        config: {
          syncDirection: "pull",
          autoSync: true,
          includeClosedIssues: false,
          createActionsFromIssues: true,
          syncAssignees: true,
          priorityMapping: {
            bug: "High",
            enhancement: "Medium",
            documentation: "Low",
          },
        },
        integrationId,
        userId,
        projectId,
      },
    });
  }

  async syncRepositoryIssues(
    integrationId: string,
    repositoryFullName: string,
  ) {
    const integration = await db.integration.findUnique({
      where: { id: integrationId },
      include: { credentials: true },
    });

    if (!integration) {
      throw new Error("Integration not found");
    }

    const workflow = await db.workflow.findFirst({
      where: {
        integrationId,
        type: "github_issues",
        status: "ACTIVE",
      },
    });

    if (!workflow) {
      throw new Error("No active GitHub sync workflow found");
    }

    try {
      const startTime = Date.now();

      // Create workflow run record
      const workflowRun = await db.workflowRun.create({
        data: {
          workflowId: workflow.id,
          status: "running",
          itemsProcessed: 0,
          itemsCreated: 0,
          itemsUpdated: 0,
          itemsSkipped: 0,
        },
      });

      // Get all issues from the repository
      const issues: GitHubIssue[] = await this.makeGitHubRequest(
        integration as GitHubIntegration,
        `/repos/${repositoryFullName}/issues?state=all&per_page=100`,
      );

      let itemsProcessed = 0;
      let itemsCreated = 0;
      let itemsUpdated = 0;
      let itemsSkipped = 0;

      for (const issue of issues) {
        try {
          const result = await this.syncIssueToAction(
            integration as GitHubIntegration,
            workflow,
            issue,
            repositoryFullName,
          );

          if (result.action === "created") {
            itemsCreated++;
          } else if (result.action === "updated") {
            itemsUpdated++;
          } else {
            itemsSkipped++;
          }

          itemsProcessed++;
        } catch (error) {
          console.error(`Failed to sync issue ${issue.number}:`, error);
          itemsSkipped++;
          itemsProcessed++;
        }
      }

      // Update workflow run with final status
      await db.workflowRun.update({
        where: { id: workflowRun.id },
        data: {
          status: "completed",
          completedAt: new Date(),
          itemsProcessed,
          itemsCreated,
          itemsUpdated,
          itemsSkipped,
          metadata: {
            repositoryFullName,
            duration: Date.now() - startTime,
          },
        },
      });

      return { itemsProcessed, itemsCreated, itemsUpdated, itemsSkipped };
    } catch (error) {
      console.error("GitHub sync failed:", error);
      throw error;
    }
  }

  private async syncIssueToAction(
    integration: GitHubIntegration,
    workflow: Workflow,
    issue: GitHubIssue,
    repositoryFullName: string,
  ) {
    if (!workflow.projectId) {
      throw new Error("Workflow has no project ID");
    }

    // Check if issue is already synced
    const existingSync = await db.actionSync.findFirst({
      where: {
        provider: "github",
        externalId: `${repositoryFullName}#${issue.number}`,
      },
      include: { action: true },
    });

    if (existingSync) {
      // Update existing action
      await this.updateActionFromIssue(existingSync.action, issue);

      await db.actionSync.update({
        where: { id: existingSync.id },
        data: {
          syncedAt: new Date(),
          updatedAt: new Date(),
        },
      });

      return { action: "updated", actionId: existingSync.action.id };
    } else {
      // Create new action
      const action = await this.createActionFromIssue(
        workflow.userId,
        workflow.projectId,
        issue,
        repositoryFullName,
      );

      console.log(action);

      // Create sync mapping
      await db.actionSync.create({
        data: {
          actionId: action.id,
          provider: "github",
          externalId: `${repositoryFullName}#${issue.number}`,
          status: "synced",
        },
      });

      return { action: "created", actionId: action.id };
    }
  }

  private async createActionFromIssue(
    userId: string,
    projectId: string,
    issue: GitHubIssue,
    repositoryFullName: string,
  ) {
    // Map GitHub labels to priority
    const priority = this.mapLabelsToPriority(issue.labels);

    // Map GitHub state to action status
    const status = issue.state === "closed" ? "COMPLETE" : "ACTIVE";

    // Create action description with GitHub context
    const description = [
      issue.body || "",
      "",
      `**GitHub Issue**: [${repositoryFullName}#${issue.number}](${issue.html_url})`,
      `**Repository**: ${repositoryFullName}`,
      issue.labels.length > 0
        ? `**Labels**: ${issue.labels.map((l) => l.name).join(", ")}`
        : null,
    ]
      .filter(Boolean)
      .join("\n");

    // Inherit workspaceId from the target project
    let ghWorkspaceId: string | null = null;
    if (projectId) {
      const proj = await db.project.findUnique({
        where: { id: projectId },
        select: { workspaceId: true },
      });
      ghWorkspaceId = proj?.workspaceId ?? null;
    }

    return db.action.create({
      data: {
        name: `[${repositoryFullName}#${issue.number}] ${issue.title}`,
        description,
        status,
        priority,
        projectId,
        createdById: userId,
        workspaceId: ghWorkspaceId,
      },
    });
  }

  private async updateActionFromIssue(action: any, issue: GitHubIssue) {
    const priority = this.mapLabelsToPriority(issue.labels);
    const status = issue.state === "closed" ? "COMPLETE" : "ACTIVE";

    return db.action.update({
      where: { id: action.id },
      data: {
        status,
        priority,
        // Update other fields as needed
      },
    });
  }

  private mapLabelsToPriority(
    labels: Array<{ name: string; color: string }>,
  ): string {
    const labelNames = labels.map((l) => l.name.toLowerCase());

    if (
      labelNames.some((name) =>
        ["critical", "urgent", "high priority"].includes(name),
      )
    ) {
      return "Critical";
    }
    if (labelNames.some((name) => ["high", "important"].includes(name))) {
      return "High";
    }
    if (labelNames.some((name) => ["medium", "normal"].includes(name))) {
      return "Medium";
    }
    if (labelNames.some((name) => ["low", "minor"].includes(name))) {
      return "Low";
    }
    if (
      labelNames.some((name) =>
        ["bug", "enhancement", "feature"].includes(name),
      )
    ) {
      return "Medium";
    }

    return "Quick"; // Default priority
  }

  async handleIssueWebhook(
    integrationId: string,
    webhookData: {
      action: string;
      issue: GitHubIssue;
      repository: GitHubRepository;
    },
  ) {
    const integration = await db.integration.findUnique({
      where: { id: integrationId },
      include: { credentials: true },
    });

    if (!integration) {
      throw new Error("Integration not found");
    }

    const workflow = await db.workflow.findFirst({
      where: {
        integrationId,
        type: "github_issues",
        status: "ACTIVE",
      },
    });

    console.log("workflow is: ", workflow);

    if (!workflow) {
      return; // No active sync workflow
    }

    const { action, issue, repository } = webhookData;
    console.log("action is: ", action);
    switch (action) {
      case "opened":
        await this.syncIssueToAction(
          integration as GitHubIntegration,
          workflow,
          issue,
          repository.full_name,
        );
        break;
      case "reopened":
      case "edited":
      case "closed":
      case "deleted":
        await this.handleIssueDeleted(repository.full_name, issue.number);
        break;
      default:
        console.log(`Unhandled issue action: ${action}`);
    }
  }

  private async handleIssueDeleted(
    repositoryFullName: string,
    issueNumber: number,
  ) {
    const actionSync = await db.actionSync.findFirst({
      where: {
        provider: "github",
        externalId: `${repositoryFullName}#${issueNumber}`,
      },
    });

    if (actionSync) {
      // Update action status instead of deleting
      await db.action.update({
        where: { id: actionSync.actionId },
        data: {
          status: "ARCHIVED",
          description: `**Note**: Original GitHub issue was deleted.`,
        },
      });

      // Remove the sync mapping
      await db.actionSync.delete({
        where: { id: actionSync.id },
      });
    }
  }

  async getRepositories(integrationId: string): Promise<GitHubRepository[]> {
    const integration = await db.integration.findUnique({
      where: { id: integrationId },
      include: { credentials: true },
    });

    if (!integration) {
      throw new Error("Integration not found");
    }

    return this.makeGitHubRequest(
      integration as GitHubIntegration,
      "/user/repos?affiliation=owner,collaborator&sort=updated&per_page=100",
    );
  }

  async testConnection(integrationId: string): Promise<boolean> {
    try {
      const integration = await db.integration.findUnique({
        where: { id: integrationId },
        include: { credentials: true },
      });

      if (!integration) {
        return false;
      }

      await this.makeGitHubRequest(integration as GitHubIntegration, "/user");
      return true;
    } catch {
      return false;
    }
  }
}

export const githubIntegrationService = new GitHubIntegrationService();
