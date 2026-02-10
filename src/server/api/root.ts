import { postRouter } from "~/server/api/routers/post";
import { createCallerFactory, createTRPCRouter } from "~/server/api/trpc";
import { actionRouter } from "./routers/action";
import { adminRouter } from "./routers/admin";
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
import { featureRequestRouter } from "./routers/featureRequest";
import { whatsappRouter } from "./routers/whatsapp";
import { whatsappGatewayRouter } from "./routers/whatsappGateway";
import { notificationRouter } from "./routers/notification";
import { onboardingRouter } from "./routers/onboarding";
import { weeklyPlanningRouter } from "./routers/weeklyPlanning";
import { projectWorkflowRouter } from "./routers/projectWorkflow";
import { weeklyReviewRouter } from "./routers/weeklyReview";
import { userRouter } from "./routers/user";
import { wheelOfLifeRouter } from "./routers/wheelOfLife";
import { navigationPreferenceRouter } from "./routers/navigationPreference";
import { habitRouter } from "./routers/habit";
import { workspaceRouter } from "./routers/workspace";
import { resourceRouter } from "./routers/resource";
import { crmContactRouter } from "./routers/crmContact";
import { crmOrganizationRouter } from "./routers/crmOrganization";
import { tagRouter } from "./routers/tag";
import { schedulingRouter } from "./routers/scheduling";
import { taskScheduleRouter } from "./routers/taskSchedule";
import { okrCheckinRouter } from "./routers/okrCheckin";
import { viewRouter } from "./routers/view";
import { listRouter } from "./routers/list";
import { dailyPlanRouter } from "./routers/dailyPlan";
import { scoringRouter } from "./routers/scoring";
import { leaderboardRouter } from "./routers/leaderboard";
import { assistantRouter } from "./routers/assistant";
// Plugin system
import { pluginConfigRouter } from "./routers/pluginConfig";
import { keyResultRouter } from "~/plugins/okr/server/routers/keyResult";
/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  post: postRouter,
  project: projectRouter,
  action: actionRouter,
  admin: adminRouter,
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
  featureRequest: featureRequestRouter,
  whatsapp: whatsappRouter,
  whatsappGateway: whatsappGatewayRouter,
  notification: notificationRouter,
  onboarding: onboardingRouter,
  weeklyPlanning: weeklyPlanningRouter,
  projectWorkflow: projectWorkflowRouter,
  weeklyReview: weeklyReviewRouter,
  user: userRouter,
  wheelOfLife: wheelOfLifeRouter,
  navigationPreference: navigationPreferenceRouter,
  habit: habitRouter,
  workspace: workspaceRouter,
  resource: resourceRouter,
  crmContact: crmContactRouter,
  crmOrganization: crmOrganizationRouter,
  tag: tagRouter,
  scheduling: schedulingRouter,
  taskSchedule: taskScheduleRouter,
  okrCheckin: okrCheckinRouter,
  view: viewRouter,
  list: listRouter,
  dailyPlan: dailyPlanRouter,
  scoring: scoringRouter,
  leaderboard: leaderboardRouter,
  assistant: assistantRouter,
  // Plugin system
  pluginConfig: pluginConfigRouter,
  okr: keyResultRouter,
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
