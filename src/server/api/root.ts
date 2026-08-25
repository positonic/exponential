import { postRouter } from "~/server/api/routers/post";
import { createCallerFactory, createTRPCRouter } from "~/server/api/trpc";
import { actionRouter } from "./routers/action";
import { adminRouter } from "./routers/admin";
import { adrRouter } from "./routers/adr";
import { projectRouter } from "./routers/project";
import { searchRouter } from "./routers/search";
import { toolRouter } from "./routers/tool";
import { videoRouter } from "~/server/api/routers/video";
import { goalRouter } from "./routers/goal";
import { dayRouter } from "~/server/api/routers/day";
import { lifeDomainRouter } from "./routers/lifeDomain";
import { workflowRouter } from "./routers/workflow";
import { transcriptionRouter } from "./routers/transcription";
import { githubRouter } from "./routers/github";
import { channelLinkRouter } from "./routers/channelLink";
import { noteRouter } from "./routers/note";
import { exerciseRouter } from "./routers/exercise";
import { mastraRouter } from "./routers/mastra";
import { integrationRouter } from "./routers/integration";
import { integrationPermissionRouter } from "./routers/integrationPermission";
import { teamRouter } from "./routers/team";
import { slackRouter } from "./routers/slack";
import { aiInteractionRouter } from "./routers/aiInteraction";
import { calendarRouter } from "./routers/calendar";
import { workspaceSchedulingRouter } from "./routers/workspaceScheduling";
import { feedbackRouter } from "./routers/feedback";
import { featureRequestRouter } from "./routers/featureRequest";
import { whatsappRouter } from "./routers/whatsapp";
import { whatsappGatewayRouter } from "./routers/whatsappGateway";
import { telegramGatewayRouter } from "./routers/telegramGateway";
import { matrixGatewayRouter } from "./routers/matrixGateway";
import { matrixServerRouter } from "./routers/matrixServer";
import { matrixRoomRouter } from "./routers/matrixRoom";
import { notificationRouter } from "./routers/notification";
import { pushSubscriptionRouter } from "./routers/pushSubscription";
import { weeklyPlanningRouter } from "./routers/weeklyPlanning";
import { projectWorkflowRouter } from "./routers/projectWorkflow";
import { weeklyReviewRouter } from "./routers/weeklyReview";
import { portfolioReviewRouter } from "./routers/portfolioReview";
import { userRouter } from "./routers/user";
import { welcomeRouter } from "./routers/welcome";
import { wheelOfLifeRouter } from "./routers/wheelOfLife";
import { navigationPreferenceRouter } from "./routers/navigationPreference";
import { habitRouter } from "./routers/habit";
import { workspaceRouter } from "./routers/workspace";
import { externalAgentRouter } from "./routers/externalAgent";
import { resourceRouter } from "./routers/resource";
import { knowledgeChunkRouter } from "./routers/knowledgeChunk";
import { transcriptionSessionParticipantRouter } from "./routers/transcriptionSessionParticipant";
import { crmContactRouter } from "./routers/crmContact";
import { crmOrganizationRouter } from "./routers/crmOrganization";
import { crmAutomationRouter } from "./routers/crmAutomation";
import { formRouter } from "./routers/form";
import { collectionRouter } from "./routers/collection";
import { listAutomationRouter } from "./routers/listAutomation";
import { broadcastRouter } from "./routers/broadcast";
import { tagRouter } from "./routers/tag";
import { schedulingRouter } from "./routers/scheduling";
import { taskScheduleRouter } from "./routers/taskSchedule";
import { timeEntryRouter } from "./routers/timeEntry";
import { okrCheckinRouter } from "./routers/okrCheckin";
import { viewRouter } from "./routers/view";
import { listRouter } from "./routers/list";
import { epicRouter } from "./routers/epic";
import { dailyPlanRouter } from "./routers/dailyPlan";
import { scoringRouter } from "./routers/scoring";
import { leaderboardRouter } from "./routers/leaderboard";
import { assistantRouter } from "./routers/assistant";
import { workflowPipelineRouter } from "./routers/workflowPipeline";
import { pipelineRouter } from "./routers/pipeline";
import { contentRouter } from "./routers/content";
import { sprintAnalyticsRouter } from "./routers/sprintAnalytics";
import { briefingRouter } from "./routers/briefing";
import { pmSchedulerRouter } from "./routers/pmScheduler";
import { bountyRouter } from "./routers/bounty";
import { bugReportRouter } from "./routers/bugReport";
import { actionCommentRouter } from "./routers/actionComment";
import { blogCommentRouter } from "./routers/blogComment";
import { goalCommentRouter } from "./routers/goalComment";
import { goalUpdateRouter } from "./routers/goalUpdate";
import { goalActivityRouter } from "./routers/goalActivity";
import { crmApiRouter } from "./routers/crmApi";
// Plugin system
import { pluginConfigRouter } from "./routers/pluginConfig";
import { keyResultRouter } from "~/plugins/okr/server/routers/keyResult";
import { productPluginRouter } from "~/plugins/product/server/routers";
import { favoriteRouter } from "~/server/api/routers/favorite";
import { authRouter } from "./routers/auth";
import { documentRouter } from "./routers/document";
import { voiceRouter } from "./routers/voice";
import { pageRouter } from "./routers/page";
import { pageCommentRouter } from "./routers/pageComment";
import { yourWorkRouter } from "./routers/yourWork";
/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  post: postRouter,
  project: projectRouter,
  search: searchRouter,
  action: actionRouter,
  admin: adminRouter,
  adr: adrRouter,
  tools: toolRouter,
  video: videoRouter,
  goal: goalRouter,
  day: dayRouter,
  lifeDomain: lifeDomainRouter,
  workflow: workflowRouter,
  transcription: transcriptionRouter,
  github: githubRouter,
  channelLink: channelLinkRouter,
  note: noteRouter,
  exercise: exerciseRouter,
  mastra: mastraRouter,
  integration: integrationRouter,
  integrationPermission: integrationPermissionRouter,
  team: teamRouter,
  slack: slackRouter,
  aiInteraction: aiInteractionRouter,
  calendar: calendarRouter,
  workspaceScheduling: workspaceSchedulingRouter,
  feedback: feedbackRouter,
  featureRequest: featureRequestRouter,
  whatsapp: whatsappRouter,
  whatsappGateway: whatsappGatewayRouter,
  telegramGateway: telegramGatewayRouter,
  matrixGateway: matrixGatewayRouter,
  matrixServer: matrixServerRouter,
  matrixRoom: matrixRoomRouter,
  externalAgent: externalAgentRouter,
  notification: notificationRouter,
  pushSubscription: pushSubscriptionRouter,
  weeklyPlanning: weeklyPlanningRouter,
  projectWorkflow: projectWorkflowRouter,
  weeklyReview: weeklyReviewRouter,
  portfolioReview: portfolioReviewRouter,
  user: userRouter,
  welcome: welcomeRouter,
  wheelOfLife: wheelOfLifeRouter,
  navigationPreference: navigationPreferenceRouter,
  habit: habitRouter,
  workspace: workspaceRouter,
  resource: resourceRouter,
  knowledgeChunk: knowledgeChunkRouter,
  transcriptionSessionParticipant: transcriptionSessionParticipantRouter,
  crmContact: crmContactRouter,
  crmOrganization: crmOrganizationRouter,
  crmAutomation: crmAutomationRouter,
  form: formRouter,
  collection: collectionRouter,
  listAutomation: listAutomationRouter,
  broadcast: broadcastRouter,
  tag: tagRouter,
  scheduling: schedulingRouter,
  taskSchedule: taskScheduleRouter,
  timeEntry: timeEntryRouter,
  okrCheckin: okrCheckinRouter,
  view: viewRouter,
  list: listRouter,
  epic: epicRouter,
  dailyPlan: dailyPlanRouter,
  scoring: scoringRouter,
  leaderboard: leaderboardRouter,
  assistant: assistantRouter,
  workflowPipeline: workflowPipelineRouter,
  content: contentRouter,
  pipeline: pipelineRouter,
  sprintAnalytics: sprintAnalyticsRouter,
  briefing: briefingRouter,
  pmScheduler: pmSchedulerRouter,
  bounty: bountyRouter,
  bugReport: bugReportRouter,
  actionComment: actionCommentRouter,
  blogComment: blogCommentRouter,
  goalComment: goalCommentRouter,
  goalUpdate: goalUpdateRouter,
  goalActivity: goalActivityRouter,
  crmApi: crmApiRouter,
  auth: authRouter,
  document: documentRouter,
  voice: voiceRouter,
  page: pageRouter,
  pageComment: pageCommentRouter,
  yourWork: yourWorkRouter,
  // Plugin system
  pluginConfig: pluginConfigRouter,
  okr: keyResultRouter,
  product: productPluginRouter,
  favorite: favoriteRouter,
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
