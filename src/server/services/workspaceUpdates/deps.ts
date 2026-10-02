import type { PrismaClient } from "@prisma/client";

import { getPublicBaseUrlFromEnv } from "~/lib/urls";

import { createClaudeWriter } from "./claudeWriter";
import type { GenerateDeps } from "./generate";
import { templateWriter } from "./writer";

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
      : templateWriter,
    notify: () => Promise.resolve(),
    baseUrl: getPublicBaseUrlFromEnv(),
  };
}
