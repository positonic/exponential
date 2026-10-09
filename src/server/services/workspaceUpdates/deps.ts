import type { PrismaClient } from "@prisma/client";

import { getPublicBaseUrlFromEnv } from "~/lib/urls";
import { NOTIFICATION_CATEGORIES } from "~/server/services/notifications/emit/constants";
import { emitNotification } from "~/server/services/notifications/emit/emitNotification";

import { createClaudeWriter } from "./claudeWriter";
import type { GenerateDeps } from "./generate";
import { createTemplateWriter } from "./writer";

/**
 * Production wiring for generation, shared by the router and the cron: Claude
 * writes when an Anthropic key is configured, otherwise the deterministic
 * template does (and it is also the fallback when a Claude call fails).
 */
export function defaultGenerateDeps(
  db: PrismaClient,
  scope: { workspaceId: string; userId?: string | null },
): GenerateDeps {
  return {
    writer: process.env.ANTHROPIC_API_KEY
      ? createClaudeWriter({ log: { db, workspaceId: scope.workspaceId, userId: scope.userId ?? undefined } })
      : createTemplateWriter("ANTHROPIC_API_KEY is not set"),
    notify: (notice) =>
      emitNotification({
        db,
        category: NOTIFICATION_CATEGORIES.UPDATE_REVIEW,
        actorUserId: notice.actorUserId,
        subject: { updateId: notice.updateId, reviewerIds: notice.reviewerIds },
      }),
    baseUrl: getPublicBaseUrlFromEnv(),
  };
}
