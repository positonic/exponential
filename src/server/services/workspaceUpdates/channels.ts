import type { PrismaClient } from "@prisma/client";

import { EmailService } from "~/server/services/EmailService";

import { publicChannel, type DistributeChannels } from "./distribute";
import { createEmailChannel } from "./emailChannel";
import { renderUpdateHtml } from "./html";
import { createMatrixChannel } from "./matrixChannel";

/** Production channels for distributing an approved Workspace update. */
export function defaultDistributeChannels(db: PrismaClient): DistributeChannels {
  return {
    public: publicChannel,
    email: createEmailChannel(db, {
      send: EmailService.sendWorkspaceUpdateEmail,
      renderHtml: renderUpdateHtml,
    }),
    matrix: createMatrixChannel(db, { renderHtml: renderUpdateHtml }),
  };
}
