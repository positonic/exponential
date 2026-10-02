import type { PrismaClient } from "@prisma/client";

import { getPublicBaseUrlFromEnv } from "~/lib/urls";
import { CollectionService } from "~/server/services/collections/CollectionService";
import { createMemberTypeRegistry } from "~/server/services/collections/createMemberTypeRegistry";
import { fanoutSend, isWholeBatchFailure } from "~/server/services/crm/broadcast/fanout";
import { buildUnsubscribeUrl } from "~/server/services/crm/crmUnsubscribeToken";
import type { EmailService } from "~/server/services/EmailService";
import { encryptString } from "~/server/utils/encryption";

import { outcome, type ApprovedUpdate, type Channel } from "./distribute";
import { publicUpdatePath, stripLeadingHeadline } from "./public";

/** CrmCommunication.sourceType for update emails; sourceId is the update id. */
export const UPDATE_EMAIL_SOURCE = "workspace_update";

export interface EmailChannelDeps {
  /** Send one email; returns what was sent, for the CRM log. */
  send: typeof EmailService.sendWorkspaceUpdateEmail;
  /** Approved Markdown → sanitized HTML. */
  renderHtml: (markdown: string) => string;
  baseUrl?: string;
}

/**
 * Email an approved update to the workspace's newsletter List.
 *
 * Reuses the Broadcast machinery: the List resolver already drops opted-out
 * and unmailable contacts; `fanoutSend` sends each in isolation; every send is
 * logged as a CrmCommunication (SENT / FAILED) keyed to the update, and
 * contacts already SENT this update are skipped — so the hourly retry only
 * reaches the ones that failed, and nobody gets the same update twice.
 */
export function createEmailChannel(db: PrismaClient, deps: EmailChannelDeps): Channel {
  return async (update: ApprovedUpdate) => {
    const collectionId = update.config.newsletterCollectionId;
    if (!collectionId) return outcome("skipped", "no newsletter List configured");

    const recipients = await new CollectionService(db, createMemberTypeRegistry(db)).resolveMembers(collectionId);
    const prior = await db.crmCommunication.findMany({
      where: {
        sourceType: UPDATE_EMAIL_SOURCE,
        sourceId: update.id,
        status: "SENT",
        contactId: { in: recipients.map((r) => r.memberId) },
      },
      select: { contactId: true },
    });
    const alreadySent = new Set(prior.flatMap((p) => (p.contactId ? [p.contactId] : [])));

    const baseUrl = deps.baseUrl ?? getPublicBaseUrlFromEnv();
    const webUrl = update.config.isPublic ? `${baseUrl}${publicUpdatePath(update.workspaceSlug, update.id)}` : null;
    const bodyMarkdown = stripLeadingHeadline(update.body);
    const bodyHtml = deps.renderHtml(bodyMarkdown);

    const result = await fanoutSend({
      recipients: recipients.map((r) => ({
        memberId: r.memberId,
        email: r.email ?? null,
        greetingName: typeof r.mergeVars?.firstName === "string" ? r.mergeVars.firstName : null,
      })),
      alreadySent,
      send: async (r) => {
        try {
          const rendered = await deps.send({
            to: r.email!,
            subject: update.title,
            bodyHtml,
            bodyText: bodyMarkdown,
            workspaceName: update.workspaceName,
            unsubscribeUrl: buildUnsubscribeUrl(r.memberId),
            webUrl,
            greetingName: r.greetingName,
            workspaceId: update.workspaceId,
          });
          await db.crmCommunication.create({
            data: {
              contactId: r.memberId,
              workspaceId: update.workspaceId,
              type: "EMAIL",
              toEmail: encryptString(r.email!),
              subject: rendered.subject,
              htmlContent: rendered.htmlBody,
              textContent: rendered.textBody,
              status: "SENT",
              sentAt: new Date(),
              agentGenerated: true,
              sourceType: UPDATE_EMAIL_SOURCE,
              sourceId: update.id,
              createdById: update.approvedById,
            },
          });
        } catch (e) {
          await db.crmCommunication
            .create({
              data: {
                contactId: r.memberId,
                workspaceId: update.workspaceId,
                type: "EMAIL",
                status: "FAILED",
                errorMessage: e instanceof Error ? e.message : "send failed",
                agentGenerated: true,
                sourceType: UPDATE_EMAIL_SOURCE,
                sourceId: update.id,
                createdById: update.approvedById,
              },
            })
            .catch(() => undefined);
          throw e;
        }
      },
    });

    const summary = `sent ${result.sent}, failed ${result.failed}, skipped ${result.skipped} (no address or already sent)`;
    if (isWholeBatchFailure(result) || result.failed > 0) return outcome("failed", summary);
    return outcome("done", summary);
  };
}
