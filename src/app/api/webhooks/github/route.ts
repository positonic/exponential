import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "~/server/db";
import { githubIntegrationService } from "~/server/services/github-integration";

const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET!;

function verifySignature(payload: string, signature: string): boolean {
  if (!WEBHOOK_SECRET) {
    console.warn(
      "GITHUB_WEBHOOK_SECRET not set - skipping signature verification",
    );
    return true; // Allow in development
  }

  const expectedSignature =
    "sha256=" +
    crypto.createHmac("sha256", WEBHOOK_SECRET).update(payload).digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature),
  );
}

export async function POST(request: NextRequest) {
  try {
    const signature = request.headers.get("x-hub-signature-256");
    const event = request.headers.get("x-github-event");
    const delivery = request.headers.get("x-github-delivery");

    if (!signature || !event || !delivery) {
      console.error("Mission required headers", request.headers);
      return NextResponse.json(
        { error: "Missing required headers" },
        { status: 400 },
      );
    }

    const payload = await request.text();

    // Verify webhook signature
    if (!verifySignature(payload, signature)) {
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
