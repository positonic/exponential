import { createTRPCRouter } from "~/server/api/trpc";
import { productRouter } from "./product";
import { featureRouter } from "./feature";
import { ticketRouter } from "./ticket";
import { researchRouter } from "./research";
import { cycleRouter } from "./cycle";
import { retrospectiveRouter } from "./retrospective";

export const productPluginRouter = createTRPCRouter({
  product: productRouter,
  feature: featureRouter,
  ticket: ticketRouter,
  research: researchRouter,
  cycle: cycleRouter,
  retrospective: retrospectiveRouter,
});

export type ProductPluginRouter = typeof productPluginRouter;
