import { type NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "~/server/db";
import { githubIntegrationService } from "~/server/services/github-integration";
import { githubActivityService } from "~/server/services/GitHubActivityService";
import { triggerAdrSyncFromPush } from "~/server/services/adrSync/webhookTrigger";
import { safeSignatureEquals } from "~/server/utils/webhookSignature";

function verifySignature(
  payload: string,
  signature: string,
  secret: string,
): boolean {
  const expectedSignature =
    "sha256=" +
    crypto.createHmac("sha256", secret).update(payload).digest("hex");

  return safeSignatureEquals(signature, expectedSignature);
}

export async function POST(request: NextRequest) {
  try {
    // Fail closed: without the shared secret we cannot verify a single
    // delivery, so we must never process one (same rule as the Notion and
    // Sentry receivers).
    const secret = process.env.GITHUB_WEBHOOK_SECRET;
    if (!secret) {
      console.error(
        "[GitHubWebhook] GITHUB_WEBHOOK_SECRET is not configured — refusing to process events",
      );
      return NextResponse.json(
        { error: "GITHUB_WEBHOOK_SECRET is not configured" },
        { status: 503 },
      );
    }

    const signature = request.headers.get("x-hub-signature-256");
    const event = request.headers.get("x-github-event");
    const delivery = request.headers.get("x-github-delivery");

    if (!signature || !event || !delivery) {
      console.error("Missing required headers", request.headers);
      return NextResponse.json(
        { error: "Missing required headers" },
        { status: 400 },
      );
    }

    const payload = await request.text();

    // Verify webhook signature
    if (!verifySignature(payload, signature, secret)) {
      console.error("Invalid webhook signature");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const data = JSON.parse(payload);

    // Log webhook receipt
    console.log(`GitHub webhook received: ${event} (${delivery})`);

    // Process different event types
    switch (event) {
      case "issues":
        await handleIssueEvent(data);
        break;
      case "push":
        await githubActivityService.processPushEvent(data, delivery);
        // Decision Log fast-follow: a default-branch push touching enrolled
        // adrPaths lands the ADR within seconds instead of at the next hourly
        // cron. Best-effort — a failure here must never break the activity
        // handling above (redelivery is idempotent via the tree-SHA
        // short-circuit).
        try {
          await triggerAdrSyncFromPush(db, data);
        } catch (error) {
          console.error("[AdrSync] webhook trigger failed:", error);
        }
        break;
      case "pull_request":
        await githubActivityService.processPullRequestEvent(data, delivery);
        break;
      case "pull_request_review":
        await githubActivityService.processPullRequestReviewEvent(data, delivery);
        break;
      case "installation":
      case "installation_repositories":
        await handleInstallationEvent(data);
        break;
      case "ping":
        console.log("GitHub webhook ping received");
        break;
      default:
        console.log(`Unhandled GitHub event: ${event}`);
    }

    return NextResponse.json({ message: "Webhook processed successfully" });
  } catch (error) {
    console.error("GitHub webhook processing error:", error);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 },
    );
  }
}

async function handleIssueEvent(data: any) {
  const { action, issue, repository } = data;
  const repositoryFullName = repository.full_name;

  // Find GitHub integrations that should sync this repository
  const integrations = await db.integration.findMany({
    where: {
      provider: "github",
      status: "ACTIVE",
    },
    include: {
      credentials: {
        where: {
          keyType: "github_metadata",
        },
      },
    },
  });

  // Filter integrations that have access to this repository
  const relevantIntegrations = integrations.filter((integration) => {
    const metadataCredential = integration.credentials.find(
      (c) => c.keyType === "github_metadata",
    );
    if (!metadataCredential) return false;

    try {
      const metadata = JSON.parse(metadataCredential.key);
      if (metadata.repository.fullName === repositoryFullName) {
        return integration;
      }
    } catch {
      return false;
    }
  });

  for (const integration of relevantIntegrations) {
    try {
      await githubIntegrationService.handleIssueWebhook(integration.id, {
        action,
        issue,
        repository,
      });

      // Log successful processing via WorkflowRun (existing model)
      const workflow = await db.workflow.findFirst({
        where: {
          integrationId: integration.id,
          type: "github_issues",
          status: "ACTIVE",
        },
      });

      if (workflow) {
        await db.workflowRun.create({
          data: {
            workflowId: workflow.id,
            status: "completed",
            itemsProcessed: 1,
            itemsCreated: action === "opened" ? 1 : 0,
            itemsUpdated: ["edited", "closed", "reopened"].includes(action)
              ? 1
              : 0,
            completedAt: new Date(),
            metadata: {
              webhookEvent: action,
              repositoryFullName,
              issueNumber: issue.number,
              issueId: issue.id,
            },
          },
        });
      }
    } catch (error) {
      console.error(
        `Failed to process webhook for integration ${integration.id}:`,
        error,
      );

      // Log error via WorkflowRun
      const workflow = await db.workflow.findFirst({
        where: {
          integrationId: integration.id,
          type: "github_issues",
          status: "ACTIVE",
        },
      });

      if (workflow) {
        await db.workflowRun.create({
          data: {
            workflowId: workflow.id,
            status: "failed",
            itemsProcessed: 1,
            itemsSkipped: 1,
            completedAt: new Date(),
            errorMessage:
              error instanceof Error ? error.message : "Unknown error",
            metadata: {
              webhookEvent: action,
              repositoryFullName,
              issueNumber: issue.number,
              issueId: issue.id,
              error: error instanceof Error ? error.stack : String(error),
            },
          },
        });
      }
    }
  }
}

async function handleInstallationEvent(data: any) {
  const { action, installation, repositories } = data;

  console.log(`GitHub installation ${action}:`, {
    installationId: installation.id,
    accountLogin: installation.account.login,
    repositoryCount: repositories?.length || 0,
  });

  // Handle installation events (repository access changes, etc.)
  // This could be used to update repository lists for affected integrations
}
