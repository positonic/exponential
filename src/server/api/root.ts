import { postRouter } from "~/server/api/routers/post";
import { createCallerFactory, createTRPCRouter } from "~/server/api/trpc";
import { actionRouter } from "./routers/action";
import { projectRouter } from "./routers/project";
import { toolRouter } from "./routers/tool";
import { videoRouter } from "~/server/api/routers/video";
import { goalRouter } from "./routers/goal";
import { dayRouter } from "~/server/api/routers/day";
import { outcomeRouter } from "./routers/outcome";
import { lifeDomainRouter } from "./routers/lifeDomain";
import { workflowRouter } from "./routers/workflow";
import { transcriptionRouter } from "./routers/transcription";
import { githubRouter } from "./routers/github";
import { noteRouter } from "./routers/note";
import { exerciseRouter } from "./routers/exercise";
import { mastraRouter } from "./routers/mastra";
import { integrationRouter } from "./routers/integration";
import { integrationPermissionRouter } from "./routers/integrationPermission";
import { teamRouter } from "./routers/team";
import { slackRouter } from "./routers/slack";
import { aiInteractionRouter } from "./routers/aiInteraction";
import { calendarRouter } from "./routers/calendar";
import { feedbackRouter } from "./routers/feedback";
/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  post: postRouter,
  project: projectRouter,
  action: actionRouter,
  tools: toolRouter,
  video: videoRouter,
  goal: goalRouter,
  day: dayRouter,
  outcome: outcomeRouter,
  lifeDomain: lifeDomainRouter,
  workflow: workflowRouter,
  transcription: transcriptionRouter,
  github: githubRouter,
  note: noteRouter,
  exercise: exerciseRouter,
  mastra: mastraRouter,
  integration: integrationRouter,
  integrationPermission: integrationPermissionRouter,
  team: teamRouter,
  slack: slackRouter,
  aiInteraction: aiInteractionRouter,
  calendar: calendarRouter,
  feedback: feedbackRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;

/**
 * Create a server-side caller for the tRPC API.
 * @example
 * const trpc = createCaller(createContext);
 * const res = await trpc.post.all();
 *       ^? Post[]
 */
export const createCaller = createCallerFactory(appRouter);
