/**
 * The procedures the agent tools in the Mastra repo call. Their inputs make up
 * the agent procedure contract (`contracts/agent-procedures.json`).
 *
 * To add a procedure: add its path here, run `npm run contracts:generate`, and
 * commit the JSON. The Mastra suite fails on a tool that calls a path with no
 * entry, and its message points at this file.
 */

/** Routers that exist for agents. Every procedure in them is in the contract. */
export const AGENT_ROUTERS = ["mastra"] as const;

/** Procedures in other routers that an agent tool or a Mastra job calls. */
export const AGENT_PROCEDURES = [
  "action.assign",
  "action.bulkCreateFromTranscript",
  "action.bulkDefer",
  "action.bulkReschedule",
  "action.findBySource",
  "action.getAssignableUsers",
  "action.getAssignableUsersForContext",
  "action.getOverdueTriage",
  "action.getTodaysActions",
  "action.update",
  "actionComment.addComment",
  "agentGuidance.context",
  "agentGuidance.method",
  "briefing.getMorningBriefing",
  "decision.create",
  "decision.list",
  "decision.setStatus",
  "decision.update",
  "document.delete",
  "document.getDownloadUrl",
  "document.ingest",
  "document.list",
  "knowledgeChunk.ingestTranscription",
  "knowledgeChunk.semanticSearch",
  "project.getAll",
  "resource.create",
  "resource.list",
  "resource.setReadStatus",
  "sprintAnalytics.captureDailySnapshot",
  "sprintAnalytics.getActiveSprint",
  "sprintAnalytics.getGitHubActivity",
  "sprintAnalytics.getMetrics",
  "sprintAnalytics.getRiskSignals",
  "transcription.findRelated",
  "transcription.generateDraftFeatures",
  "transcription.getById",
  "transcriptionSessionParticipant.getHistory",
] as const;
