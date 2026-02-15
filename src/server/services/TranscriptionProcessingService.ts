import { db } from '~/server/db';
import { FirefliesService } from './FirefliesService';
import { ActionExtractionService } from './ActionExtractionService';
import { ActionProcessorFactory } from './processors/ActionProcessorFactory';
import { InternalActionProcessor } from './processors/InternalActionProcessor';
import { NotificationServiceFactory } from './notifications/NotificationServiceFactory';
import { SlackChannelResolver } from './SlackChannelResolver';
import { SlackNotificationService } from './notifications/SlackNotificationService';

export interface ProcessTranscriptionResult {
  success: boolean;
  actionsCreated: number;
  slackNotificationSent: boolean;
  errors: string[];
}

export interface DraftTranscriptionActionsResult {
  success: boolean;
  actionsCreated: number;
  alreadyPublished: boolean;
  draftCount: number;
  errors: string[];
}

export class TranscriptionProcessingService {
  /**
   * Process a transcription after it has been associated with a project
   */
  static async processTranscription(
    transcriptionId: string,
    userId: string
  ): Promise<ProcessTranscriptionResult> {
    const result: ProcessTranscriptionResult = {
      success: false,
      actionsCreated: 0,
      slackNotificationSent: false,
      errors: []
    };

    try {
      // 1. Get the transcription with its project
      const transcription = await db.transcriptionSession.findUnique({
        where: { id: transcriptionId },
        include: {
          project: {
            include: { team: true }
          },
          user: true
        }
      });

      if (!transcription) {
        result.errors.push('Transcription not found');
        return result;
      }

      // 2. Verify user has access
      if (transcription.userId !== userId) {
        const hasAccess = await this.verifyUserAccess(userId, transcription.projectId);
        if (!hasAccess) {
          result.errors.push('User does not have access to this transcription');
          return result;
        }
      }

      // 3. Check if already processed
      if (transcription.processedAt) {
        console.log(`⚠️ Transcription ${transcriptionId} already processed at`, transcription.processedAt);
        result.success = true;
        return result;
      }

      // 4. Parse the transcription data
      let processedData;
      if (transcription.summary) {
        try {
          const summary = JSON.parse(transcription.summary);
          let actionItems = FirefliesService.parseActionItems(summary);
          const transcriptText = transcription.transcription || '';

          if (actionItems.length === 0 && transcriptText) {
            actionItems = await ActionExtractionService.extractFromTranscript(transcriptText);
          }

          processedData = {
            summary,
            actionItems,
            transcriptText,
          };
        } catch (parseError) {
          console.error('Failed to parse transcription summary:', parseError);
          result.errors.push('Failed to parse transcription data');
        }
      } else if (transcription.transcription) {
        const transcriptText = transcription.transcription;
        const actionItems = await ActionExtractionService.extractFromTranscript(transcriptText);
        processedData = {
          summary: {},
          actionItems,
          transcriptText,
        };
      }

      // 5. Validate parsed data
      if (!processedData) {
        console.log(`ℹ️ No summary data available for transcription ${transcriptionId}`);
        result.success = true; // Not an error, just no data
        return result;
      }

      if (!processedData.actionItems || processedData.actionItems.length === 0) {
        console.log(`ℹ️ No action items found in transcription ${transcriptionId}`);
        result.success = true;
        result.actionsCreated = 0;
        return result; // Early return, skip processing
      }

      if (!transcription.projectId) {
        result.errors.push('No project assigned to this transcription');
        return result;
      }

      // 6. Process action items
      if (processedData.actionItems && processedData.actionItems.length > 0) {
        try {
          console.log(`🎯 Processing ${processedData.actionItems.length} action items for project ${transcription.projectId}`);
          
          // Get processors filtered by project/team
          const processors = await ActionProcessorFactory.createProcessors(
            userId,
            transcription.projectId,
            transcriptionId,
            transcription.project?.teamId || undefined
          );
          
          for (const processor of processors) {
            const actionResult = await processor.processActionItems(processedData.actionItems);
            result.actionsCreated += actionResult.processedCount;
            console.log(`✅ ${processor.name}: Created ${actionResult.processedCount} actions`);
          }

          // Mark as processed
          await db.transcriptionSession.update({
            where: { id: transcriptionId },
            data: { processedAt: new Date() }
          });
          
        } catch (actionError) {
          console.error('Failed to process action items:', actionError);
          result.errors.push(`Action processing failed: ${actionError instanceof Error ? actionError.message : 'Unknown error'}`);
        }
      }

      result.success = true;
    } catch (error) {
      console.error('Error processing transcription:', error);
      result.errors.push(error instanceof Error ? error.message : 'Unknown error');
    }

    return result;
  }

  /**
   * Generate draft actions for a transcription without publishing
   */
  static async generateDraftActions(
    transcriptionId: string,
    userId: string
  ): Promise<DraftTranscriptionActionsResult> {
    const result: DraftTranscriptionActionsResult = {
      success: false,
      actionsCreated: 0,
      alreadyPublished: false,
      draftCount: 0,
      errors: [],
    };

    try {
      console.log(`[generateDraftActions] Starting for transcriptionId=${transcriptionId}`);

      const transcription = await db.transcriptionSession.findUnique({
        where: { id: transcriptionId },
        include: {
          project: {
            include: { team: true },
          },
          user: true,
        },
      });

      if (!transcription) {
        console.log("[generateDraftActions] Transcription not found");
        result.errors.push("Transcription not found");
        return result;
      }

      console.log(`[generateDraftActions] Found transcription: title="${transcription.title}", hasSummary=${!!transcription.summary}, hasTranscription=${!!transcription.transcription}, summaryLength=${transcription.summary?.length ?? 0}, transcriptionLength=${transcription.transcription?.length ?? 0}`);

      if (transcription.userId !== userId) {
        const hasAccess = await this.verifyUserAccess(
          userId,
          transcription.projectId
        );
        if (!hasAccess) {
          console.log("[generateDraftActions] User does not have access");
          result.errors.push("User does not have access to this transcription");
          return result;
        }
      }

      const existingActiveCount = await db.action.count({
        where: {
          transcriptionSessionId: transcriptionId,
          status: { notIn: ["DELETED", "DRAFT"] },
        },
      });

      if (existingActiveCount > 0) {
        console.log(`[generateDraftActions] Already has ${existingActiveCount} active actions, returning alreadyPublished`);
        result.alreadyPublished = true;
        result.success = true;
        return result;
      }

      const existingDraftCount = await db.action.count({
        where: {
          transcriptionSessionId: transcriptionId,
          status: "DRAFT",
        },
      });

      if (existingDraftCount > 0) {
        console.log(`[generateDraftActions] Already has ${existingDraftCount} drafts, returning existing`);
        result.success = true;
        result.draftCount = existingDraftCount;
        return result;
      }

      let processedData;
      if (transcription.summary) {
        try {
          console.log(`[generateDraftActions] Parsing summary JSON (first 200 chars): ${transcription.summary.slice(0, 200)}`);
          const summary = JSON.parse(transcription.summary);
          let actionItems = FirefliesService.parseActionItems(summary);
          console.log(`[generateDraftActions] FirefliesService.parseActionItems returned ${actionItems.length} items`);
          const transcriptText = transcription.transcription || "";

          if (actionItems.length === 0 && transcriptText) {
            console.log(`[generateDraftActions] No Fireflies actions, falling back to AI extraction on transcript (${transcriptText.length} chars)`);
            actionItems = await ActionExtractionService.extractFromTranscript(transcriptText);
            console.log(`[generateDraftActions] AI extraction returned ${actionItems.length} items`);
          } else if (actionItems.length === 0) {
            console.log("[generateDraftActions] No Fireflies actions and no transcript text available");
          }

          processedData = {
            summary,
            actionItems,
            transcriptText,
          };
        } catch (parseError) {
          console.error("[generateDraftActions] Failed to parse transcription summary:", parseError);
          result.errors.push("Failed to parse transcription data");
        }
      } else if (transcription.transcription) {
        const transcriptText = transcription.transcription;
        console.log(`[generateDraftActions] No summary, using AI extraction on transcript (${transcriptText.length} chars)`);
        const actionItems = await ActionExtractionService.extractFromTranscript(transcriptText);
        console.log(`[generateDraftActions] AI extraction returned ${actionItems.length} items`);
        processedData = {
          summary: {},
          actionItems,
          transcriptText,
        };
      } else {
        console.log("[generateDraftActions] No summary and no transcription text available");
      }

      if (!processedData) {
        console.log("[generateDraftActions] No processedData, returning early");
        result.success = true;
        return result;
      }

      if (!processedData.actionItems || processedData.actionItems.length === 0) {
        console.log("[generateDraftActions] processedData exists but 0 action items found");
        result.success = true;
        return result;
      }

      console.log(`[generateDraftActions] Creating ${processedData.actionItems.length} draft actions`);

      const draftProcessor = new InternalActionProcessor({
        userId,
        projectId: transcription.projectId ?? undefined,
        transcriptionId,
        actionStatus: "DRAFT",
      });

      const actionResult = await draftProcessor.processActionItems(
        processedData.actionItems
      );

      result.actionsCreated = actionResult.processedCount;
      result.draftCount = actionResult.processedCount;
      result.errors = actionResult.errors;
      result.success = actionResult.errors.length === 0;

      await db.transcriptionSession.update({
        where: { id: transcriptionId },
        data: {
          actionsSavedAt: new Date(),
          updatedAt: new Date(),
        },
      });

      return result;
    } catch (error) {
      console.error("Error generating draft actions:", error);
      result.errors.push(
        error instanceof Error ? error.message : "Unknown error"
      );
      return result;
    }
  }

  /**
   * Send Slack notification for a transcription
   */
  static async sendSlackNotification(
    transcriptionId: string,
    userId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // 1. Get the transcription with its project
      const transcription = await db.transcriptionSession.findUnique({
        where: { id: transcriptionId },
        include: {
          project: {
            include: { team: true }
          },
          actions: true
        }
      });

      if (!transcription) {
        return { success: false, error: 'Transcription not found' };
      }

      // 2. Verify user has access
      const hasAccess = await this.verifyUserAccess(userId, transcription.projectId);
      if (!hasAccess) {
        return { success: false, error: 'Access denied' };
      }

      // 3. Check if already sent
      if (transcription.slackNotificationAt) {
        console.log(`⚠️ Slack notification already sent for ${transcriptionId} at`, transcription.slackNotificationAt);
        return { success: true };
      }

      // 4. Check if there's a Slack channel configured
      const channelConfig = await SlackChannelResolver.resolveChannel(
        transcription.projectId || undefined,
        transcription.project?.teamId || undefined
      );

      if (!channelConfig.channel || !channelConfig.integrationId) {
        return { success: false, error: 'No Slack channel configured for this project/team' };
      }

      // 5. Parse summary if available
      let summary;
      if (transcription.summary) {
        try {
          summary = JSON.parse(transcription.summary);
        } catch (e) {
          console.error('Failed to parse summary:', e);
        }
      }

      // 6. Build notification message
      const notificationMessage = summary 
        ? FirefliesService.generateNotificationSummary(summary, transcription.actions.length)
        : `📋 Meeting: ${transcription.title || 'Untitled'}\n\n${transcription.actions.length} action items created`;

      const contextInfo = transcription.project 
        ? `\n\n_Project: ${transcription.project.name}${transcription.project.team ? ` (${transcription.project.team.name})` : ''}_`
        : '';

      // 7. Send via NotificationServiceFactory (which will use the correct integration)
      const results = await NotificationServiceFactory.sendToAll(userId, {
        title: `📋 Meeting Summary: ${transcription.title || 'Untitled'}`,
        message: notificationMessage + contextInfo,
        priority: 'normal',
        metadata: {
          transcriptionId,
          projectId: transcription.projectId,
          actionCount: transcription.actions.length,
          channel: channelConfig.channel
        }
      });

      // 8. Mark as sent if successful
      const slackResult = results.find(r => r.service.toLowerCase().includes('slack'));
      if (slackResult?.success) {
        await db.transcriptionSession.update({
          where: { id: transcriptionId },
          data: { slackNotificationAt: new Date() }
        });
        return { success: true };
      }

      return { 
        success: false, 
        error: slackResult?.error || 'Failed to send Slack notification'
      };

    } catch (error) {
      console.error('Error sending Slack notification:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  static async sendSlackSummary(
    transcriptionId: string,
    userId: string,
    options: {
      channel: string;
      includeSummary: boolean;
      includeActions: boolean;
    }
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // 1. Get the transcription with its project and actions
      const transcription = await db.transcriptionSession.findUnique({
        where: { id: transcriptionId },
        include: {
          project: {
            include: { team: true }
          }
        }
      });

      if (!transcription) {
        return { success: false, error: 'Transcription not found' };
      }

      // Get actions separately
      const actions = await db.action.findMany({
        where: { 
          transcriptionSessionId: transcriptionId,
          status: { not: 'COMPLETED' }
        },
        include: {
          assignees: {
            include: {
              user: {
                select: {
                  name: true,
                  email: true
                }
              }
            }
          }
        }
      });

      // 2. Verify user has access
      const hasAccess = await this.verifyUserAccess(userId, transcription.projectId);
      if (!hasAccess) {
        return { success: false, error: 'Access denied' };
      }

      // 3. Get the integration - use the custom channel's integration
      // Since user selected a specific channel, we need to find which integration it belongs to
      let integrationId: string | null = null;

      // First try to get integration from project/team if available
      if (transcription.projectId || transcription.project?.teamId) {
        const channelConfig = await SlackChannelResolver.resolveChannel(
          transcription.projectId || undefined,
          transcription.project?.teamId || undefined
        );
        integrationId = channelConfig.integrationId;
      }

      // If no integration found from project/team, get user's first active Slack integration
      if (!integrationId) {
        const userIntegration = await db.integration.findFirst({
          where: {
            userId: userId,
            provider: "slack",
            status: "ACTIVE",
          },
        });
        integrationId = userIntegration?.id || null;
      }

      if (!integrationId) {
        return { success: false, error: 'No Slack integration available' };
      }

      // 4. Build the message content
      const messageParts: string[] = [];
      
      // Header
      messageParts.push(`📋 *Meeting Summary: ${transcription.title || 'Untitled'}*`);
      
      if (transcription.project) {
        messageParts.push(`_Project: ${transcription.project.name}${transcription.project.team ? ` (${transcription.project.team.name})` : ''}_`);
      }

      // Summary content
      if (options.includeSummary && transcription.summary) {
        try {
          const summaryData = JSON.parse(transcription.summary);
          if (summaryData.shorthand_bullet) {
            messageParts.push('\n📝 *Detailed Breakdown:*');
            messageParts.push(summaryData.shorthand_bullet);
          }
        } catch (e) {
          console.error('Failed to parse summary for Slack message:', e);
        }
      }

      // Actions content
      if (options.includeActions && actions.length > 0) {
        messageParts.push('\n✅ *Action Items:*');
        actions.forEach((action, index) => {
          const firstAssignee = action.assignees[0]?.user;
          const assignedText = firstAssignee ? ` (assigned to ${firstAssignee.name ?? firstAssignee.email})` : '';
          messageParts.push(`${index + 1}. ${action.description}${assignedText}`);
        });
      }

      const finalMessage = messageParts.join('\n');

      // 5. Send directly via SlackNotificationService using specific channel and integration
      try {
        const slackService = new SlackNotificationService({
          userId: userId,
          integrationId: integrationId,
          channel: options.channel,
        });

        const slackResult = await slackService.sendNotification({
          title: `Meeting Summary: ${transcription.title || 'Untitled'}`,
          message: finalMessage,
          priority: 'normal',
          metadata: {
            transcriptionId,
            projectId: transcription.projectId,
            actionCount: actions.length
          }
        });

        if (slackResult.success) {
          return { success: true };
        } else {
          return { success: false, error: slackResult.error || 'Failed to send Slack message' };
        }
      } catch (error) {
        console.error('Error sending to Slack:', error);
        return { success: false, error: 'Failed to send Slack message' };
      }

    } catch (error) {
      console.error('Error sending Slack summary:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  /**
   * Associate a transcription with a project and optionally process it
   */
  static async associateWithProject(
    transcriptionId: string,
    projectId: string,
    userId: string,
    autoProcess = true
  ): Promise<{ success: boolean; error?: string; processed?: ProcessTranscriptionResult }> {
    try {
      // 1. Verify user has access to both transcription and project
      const transcription = await db.transcriptionSession.findUnique({
        where: { id: transcriptionId }
      });

      if (!transcription || transcription.userId !== userId) {
        return { success: false, error: 'Transcription not found or access denied' };
      }

      const hasProjectAccess = await this.verifyUserAccess(userId, projectId);
      if (!hasProjectAccess) {
        return { success: false, error: 'Access denied to project' };
      }

      // Get the project's workspace to inherit
      const project = await db.project.findUnique({
        where: { id: projectId },
        select: { workspaceId: true }
      });

      // 2. Update the transcription with the project and workspace
      await db.transcriptionSession.update({
        where: { id: transcriptionId },
        data: {
          projectId,
          workspaceId: project?.workspaceId ?? null
        }
      });

      // 3. Optionally process the transcription
      if (autoProcess) {
        const processed = await this.processTranscription(transcriptionId, userId);
        return { success: true, processed };
      }

      return { success: true };
    } catch (error) {
      console.error('Error associating transcription with project:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  /**
   * Verify user has access to a project
   */
  private static async verifyUserAccess(
    userId: string,
    projectId: string | null
  ): Promise<boolean> {
    if (!projectId) return true;

    const project = await db.project.findFirst({
      where: {
        id: projectId,
        OR: [
          { createdById: userId },
          { projectMembers: { some: { userId } } },
          { team: { members: { some: { userId } } } }
        ]
      }
    });

    return !!project;
  }
}