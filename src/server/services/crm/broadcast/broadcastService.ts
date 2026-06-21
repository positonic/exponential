import { type PrismaClient, type Prisma } from "@prisma/client";

import { SCHEDULED_TRIGGER } from "~/server/services/workflows/TriggerRegistry";
import { FetchGitHubCommitsStep } from "~/server/services/workflows/steps/FetchGitHubCommitsStep";
import { GenerateAiDigestStep } from "~/server/services/workflows/steps/GenerateAiDigestStep";
import { EmailService } from "~/server/services/EmailService";

/**
 * Creates and tests "What Shipped Today" **Broadcasts** (CONTEXT.md → Broadcast,
 * What Shipped Today). A Broadcast is a `scheduled` `WorkflowDefinition` wiring
 * fetch_github_commits → generate_ai_digest → send_email_to_list. Draft-by-default
 * (inactive until explicitly activated) so it can't fire mid-setup.
 */
export type BroadcastCadence =
  | { kind: "daily"; hour: number }
  | { kind: "weekly"; hour: number; weekday: number };

export interface CreateBroadcastInput {
  workspaceId: string;
  name: string;
  /** The contact List that receives it. */
  collectionId: string;
  cadence: BroadcastCadence;
  subject?: string;
  createdById: string;
}

export function createBroadcast(db: PrismaClient, input: CreateBroadcastInput) {
  const subject = input.subject ?? "What Shipped Today";
  return db.workflowDefinition.create({
    data: {
      workspaceId: input.workspaceId,
      createdById: input.createdById,
      name: input.name,
      triggerType: SCHEDULED_TRIGGER,
      isActive: false, // draft-by-default
      config: {
        schedule: input.cadence,
        collectionId: input.collectionId,
        subject,
      } as Prisma.InputJsonValue,
      steps: {
        create: [
          {
            order: 0,
            type: "fetch_github_commits",
            label: "Fetch commits from the workspace's repos",
            config: { dayRange: 1 } as Prisma.InputJsonValue,
          },
          {
            order: 1,
            type: "generate_ai_digest",
            label: "Summarise into a digest",
            config: { subject } as Prisma.InputJsonValue,
          },
          {
            order: 2,
            type: "send_email_to_list",
            label: "Send to the contact List",
            config: { collectionId: input.collectionId } as Prisma.InputJsonValue,
          },
        ],
      },
    },
  });
}

export interface TestSendResult {
  skipped: boolean;
  reason?: string;
}

/**
 * Renders the digest for a workspace's repos and sends it ONLY to `toEmail`
 * (the requesting admin). Reuses the real fetch + generate steps, but does not
 * touch the List, `CrmCommunication`, or period idempotency — a safe preview.
 */
export async function runBroadcastTestSend(
  db: PrismaClient,
  input: { workspaceId: string; userId: string; toEmail: string; subject?: string },
): Promise<TestSendResult> {
  const ctx = {
    userId: input.userId,
    workspaceId: input.workspaceId,
    runId: "test-send",
  };

  const fetchStep = new FetchGitHubCommitsStep(db);
  const commitsOut = await fetchStep.execute({ dayRange: 1 }, {}, ctx);

  const genStep = new GenerateAiDigestStep();
  const digestOut = await genStep.execute(
    commitsOut,
    { subject: input.subject },
    ctx,
  );

  if (digestOut.skip === true || !digestOut.digest) {
    return { skipped: true, reason: "no user-facing changes to send" };
  }

  const digest = digestOut.digest as {
    subject: string;
    summary: string;
    sections: { category: string; items: string[] }[];
  };

  await EmailService.sendBroadcastDigestEmail({
    to: input.toEmail,
    subject: `[Test] ${digest.subject}`,
    summary: digest.summary,
    sections: digest.sections,
    // Test preview — not a real recipient, so no working unsubscribe needed.
    unsubscribeUrl: "#",
    greetingName: null,
  });

  return { skipped: false };
}
