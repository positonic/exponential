import { type PrismaClient } from "@prisma/client";

import {
  type IStepExecutor,
  type StepContext,
} from "~/server/services/workflows/steps/IStepExecutor";
import { EmailService } from "~/server/services/EmailService";
import { encryptString } from "~/server/utils/encryption";
import { CollectionService } from "../../../collections/CollectionService";
import { createMemberTypeRegistry } from "../../../collections/createMemberTypeRegistry";
import { buildUnsubscribeUrl } from "../../crmUnsubscribeToken";
import { fanoutSend, isWholeBatchFailure } from "../../broadcast/fanout";

/**
 * `send_email_to_list` — the CRM-contributed fan-out send for a **Broadcast**
 * (CONTEXT.md → Broadcast; [ADR-0030](../../../../../../docs/adr/0030-generic-collection-list-primitive.md)).
 *
 * Resolves a contact **List** to eligible recipients (the resolver already
 * excludes opted-out/unmailable contacts), then sends the rendered digest to
 * each in isolation via the pure `fanoutSend`. Logs one `CrmCommunication` per
 * recipient (SENT/FAILED), is recipient-idempotent within a period (skips
 * contacts already SENT this period), and throws only on a whole-batch failure.
 */
const BROADCAST_SOURCE = "crm_broadcast";

interface DigestBody {
  subject: string;
  summary: string;
  sections: { category: string; items: string[] }[];
}

export class SendEmailToListStep implements IStepExecutor {
  type = "send_email_to_list";
  label = "Send to a contact List";

  constructor(private db: PrismaClient) {}

  async execute(
    input: Record<string, unknown>,
    config: Record<string, unknown>,
    context: StepContext,
  ): Promise<Record<string, unknown>> {
    // generate_ai_digest signalled nothing user-facing shipped → no-op.
    if (input.skip === true || !input.digest) {
      return { noop: true, attempted: 0, sent: 0, failed: 0, skipped: 0 };
    }

    const digest = input.digest as DigestBody;
    const collectionId =
      (typeof config.collectionId === "string" && config.collectionId) ||
      (typeof input.collectionId === "string" ? input.collectionId : undefined);
    if (!collectionId) {
      throw new Error("send_email_to_list: missing collectionId (config/input)");
    }

    const periodStart =
      typeof input.scheduledFor === "string"
        ? new Date(input.scheduledFor)
        : startOfUtcDay(new Date());

    const service = new CollectionService(
      this.db,
      createMemberTypeRegistry(this.db),
    );
    const recipients = await service.resolveMembers(collectionId);

    // Recipient-level idempotency: who already received this period's send?
    const priorSent = await this.db.crmCommunication.findMany({
      where: {
        sourceType: BROADCAST_SOURCE,
        status: "SENT",
        sentAt: { gte: periodStart },
        contactId: { in: recipients.map((r) => r.memberId) },
      },
      select: { contactId: true },
    });
    const alreadySent = new Set(
      priorSent
        .map((p) => p.contactId)
        .filter((id): id is string => typeof id === "string"),
    );

    const result = await fanoutSend({
      recipients: recipients.map((r) => ({
        memberId: r.memberId,
        email: r.email ?? null,
        greetingName:
          typeof r.mergeVars?.firstName === "string"
            ? r.mergeVars.firstName
            : null,
      })),
      alreadySent,
      send: async (r) => {
        const unsubscribeUrl = buildUnsubscribeUrl(r.memberId);
        try {
          const rendered = await EmailService.sendBroadcastDigestEmail({
            to: r.email!,
            subject: digest.subject,
            summary: digest.summary,
            sections: digest.sections,
            unsubscribeUrl,
            greetingName: r.greetingName,
          });
          await this.db.crmCommunication.create({
            data: {
              contactId: r.memberId,
              workspaceId: context.workspaceId,
              type: "EMAIL",
              toEmail: encryptString(r.email!),
              subject: rendered.subject,
              htmlContent: rendered.htmlBody,
              textContent: rendered.textBody,
              status: "SENT",
              sentAt: new Date(),
              agentGenerated: true,
              sourceType: BROADCAST_SOURCE,
              createdById: context.userId,
            },
          });
        } catch (e) {
          // Record the failure (no sentAt → retryable next period) and re-throw
          // so fanoutSend counts it without aborting the batch.
          await this.db.crmCommunication
            .create({
              data: {
                contactId: r.memberId,
                workspaceId: context.workspaceId,
                type: "EMAIL",
                status: "FAILED",
                errorMessage: e instanceof Error ? e.message : "send failed",
                agentGenerated: true,
                sourceType: BROADCAST_SOURCE,
                createdById: context.userId,
              },
            })
            .catch(() => undefined);
          throw e;
        }
      },
    });

    if (isWholeBatchFailure(result)) {
      throw new Error(
        `send_email_to_list: all ${result.attempted} sends failed — likely an email-provider/infra failure`,
      );
    }

    return {
      attempted: result.attempted,
      sent: result.sent,
      failed: result.failed,
      skipped: result.skipped,
      failures: result.failures,
    };
  }
}

function startOfUtcDay(at: Date): Date {
  return new Date(
    Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()),
  );
}
