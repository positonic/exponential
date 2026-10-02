import type { PrismaClient } from "@prisma/client";

import { outcome, publicChannel, type DistributeChannels } from "./distribute";

/** Production channels for distributing an approved Workspace update. */
export function defaultDistributeChannels(_db: PrismaClient): DistributeChannels {
  return {
    public: publicChannel,
    email: () => Promise.resolve(outcome("skipped", "no newsletter List configured")),
    matrix: () => Promise.resolve(outcome("skipped", "no team Matrix room configured")),
  };
}
