import { db } from '~/server/db';
import { FirefliesService } from './FirefliesService';
import { ActionProcessorFactory } from './processors/ActionProcessorFactory';
import { NotificationServiceFactory } from './notifications/NotificationServiceFactory';
import { SlackChannelResolver } from './SlackChannelResolver';

export interface ProcessTranscriptionResult {
  success: boolean;
  actionsCreated: number;
  slackNotificationSent: boolean;
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
          const actionItems = FirefliesService.parseActionItems(summary);
          processedData = {
            summary,
            actionItems,
            transcriptText: transcription.transcription || ''
          };
        } catch (parseError) {
          console.error('Failed to parse transcription summary:', parseError);
          result.errors.push('Failed to parse transcription data');
        }
      }

      // 5. Process action items if available and project is set
      if (processedData?.actionItems && processedData.actionItems.length > 0 && transcription.projectId) {
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

      // 2. Update the transcription with the project
      await db.transcriptionSession.update({
        where: { id: transcriptionId },
        data: { projectId }
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