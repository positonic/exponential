import type { PrismaClient } from "@prisma/client";

import { EmailService } from "~/server/services/EmailService";

import { outcome, publicChannel, type DistributeChannels } from "./distribute";
import { createEmailChannel } from "./emailChannel";
import { renderUpdateHtml } from "./html";

/** Production channels for distributing an approved Workspace update. */
export function defaultDistributeChannels(db: PrismaClient): DistributeChannels {
  return {
    public: publicChannel,
    email: createEmailChannel(db, {
      send: EmailService.sendWorkspaceUpdateEmail,
      renderHtml: renderUpdateHtml,
    }),
    matrix: () => Promise.resolve(outcome("skipped", "no team Matrix room configured")),
  };
}
