import { createTRPCRouter } from "~/server/api/trpc";
import { productRouter } from "./product";
import { featureRouter } from "./feature";
import { featureCommentRouter } from "./featureComment";
import { ticketRouter } from "./ticket";
import { researchRouter } from "./research";
import { cycleRouter } from "./cycle";
import { retrospectiveRouter } from "./retrospective";
import { insightRouter } from "./insight";
import { problemRouter } from "./problem";

export const productPluginRouter = createTRPCRouter({
  product: productRouter,
  feature: featureRouter,
  featureComment: featureCommentRouter,
  ticket: ticketRouter,
  research: researchRouter,
  insight: insightRouter,
  problem: problemRouter,
  cycle: cycleRouter,
  retrospective: retrospectiveRouter,
});

export type ProductPluginRouter = typeof productPluginRouter;
