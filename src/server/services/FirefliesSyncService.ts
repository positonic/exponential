import { db } from '~/server/db';
import { FirefliesService, type FirefliesTranscript } from './FirefliesService';
import { ActionProcessorFactory } from './processors/ActionProcessorFactory';
import { NotificationServiceFactory } from './notifications/NotificationServiceFactory';

interface FirefliesSyncResult {
  success: boolean;
  totalProcessed: number;
  newTranscripts: number; 
  updatedTranscripts: number;
  skippedTranscripts: number;
  actionsCreated: number;
  error?: string;
}

interface FirefliesIntegrationInfo {
  id: string;
  name: string;
  apiKey: string;
  lastSyncAt: Date | null;
}

export class FirefliesSyncService {
  /**
   * Get Fireflies integration info for a user
   */
  static async getFirefliesIntegration(userId: string, integrationId: string): Promise<FirefliesIntegrationInfo | null> {
    try {
      const integration = await db.integration.findFirst({
        where: {
          id: integrationId,
          userId: userId,
          provider: 'fireflies',
          status: 'ACTIVE',
        },
        include: {
          credentials: {
            where: {
              keyType: 'API_KEY',
            },
            take: 1,
          },
        },
      });

      if (!integration || integration.credentials.length === 0) {
        return null;
      }

      return {
        id: integration.id,
        name: integration.name,
        apiKey: integration.credentials[0]!.key,
        lastSyncAt: integration.lastSyncAt,
      };
    } catch (error) {
      console.error('Error getting Fireflies integration:', error);
      return null;
    }
  }

  /**
   * Get user's Fireflies integrations for sync status
   */
  static async getUserFirefliesIntegrations(userId: string) {
    return await db.integration.findMany({
      where: {
        userId: userId,
        provider: 'fireflies',
        status: 'ACTIVE',
      },
      include: {
        credentials: {
          where: {
            keyType: 'API_KEY',
          },
          take: 1,
        },
      },
    });
  }

  /**
   * Fetch recent transcripts from Fireflies API
   */
  static async fetchRecentTranscripts(apiKey: string, sinceDays: number = 7): Promise<FirefliesTranscript[]> {
    try {
      const sinceDate = new Date();
      sinceDate.setDate(sinceDate.getDate() - sinceDays);
      const sinceISOString = sinceDate.toISOString();

      // Use the correct Fireflies API schema - remove date_created field that doesn't exist
      const query = `
        query GetRecentTranscripts {
          transcripts(limit: 50) {
            id
            title
            sentences {
              text
              speaker_name
              start_time
              end_time
            }
            summary {
              keywords
              action_items
              outline
              shorthand_bullet
              overview
              bullet_gist
              gist
              short_summary
              short_overview
              meeting_type
              topics_discussed
              transcript_chapters
            }
          }
        }
      `;

      const response = await fetch('https://api.fireflies.ai/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          query,
          variables: {},
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Fireflies API error response:', errorText);
        throw new Error(`Fireflies API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      if (data.errors) {
        console.error('Fireflies GraphQL errors:', data.errors);
        throw new Error(`GraphQL error: ${data.errors[0]?.message || 'Unknown error'}`);
      }

      const allTranscripts = data.data?.transcripts || [];
      
      // Since we can't filter by date from the API, return recent transcripts (up to limit)
      // The API returns them in reverse chronological order by default
      return allTranscripts;
    } catch (error) {
      console.error('Error fetching Fireflies transcripts:', error);
      throw error;
    }
  }

  /**
   * Estimate number of new transcripts available
   */
  static async estimateNewTranscripts(userId: string, integrationId: string): Promise<number> {
    try {
      const integration = await this.getFirefliesIntegration(userId, integrationId);
      if (!integration) {
        return 0;
      }

      // If never synced, look at last 7 days
      const daysSinceLastSync = integration.lastSyncAt 
        ? Math.ceil((Date.now() - integration.lastSyncAt.getTime()) / (1000 * 60 * 60 * 24))
        : 7;

      const recentTranscripts = await this.fetchRecentTranscripts(
        integration.apiKey, 
        Math.min(daysSinceLastSync, 30) // Cap at 30 days
      );

      // Count how many don't exist in our database
      let newCount = 0;
      for (const transcript of recentTranscripts) {
        const existingSession = await db.transcriptionSession.findUnique({
          where: { sessionId: transcript.id }
        });
        if (!existingSession) {
          newCount++;
        }
      }

      return newCount;
    } catch (error) {
      console.error('Error estimating new transcripts:', error);
      return 0;
    }
  }

  /**
   * Bulk sync transcripts from a Fireflies integration
   */
  static async bulkSyncFromFireflies(
    userId: string, 
    integrationId: string,
    syncSinceDays?: number
  ): Promise<FirefliesSyncResult> {
    const result: FirefliesSyncResult = {
      success: false,
      totalProcessed: 0,
      newTranscripts: 0,
      updatedTranscripts: 0,
      skippedTranscripts: 0,
      actionsCreated: 0,
    };

    try {
      // 1. Get integration info
      const integration = await this.getFirefliesIntegration(userId, integrationId);
      if (!integration) {
        result.error = 'Fireflies integration not found or inactive';
        return result;
      }

      // 2. Determine sync window
      const daysSinceLastSync = syncSinceDays || (
        integration.lastSyncAt 
          ? Math.ceil((Date.now() - integration.lastSyncAt.getTime()) / (1000 * 60 * 60 * 24))
          : 7
      );

      // 3. Fetch recent transcripts
      const recentTranscripts = await this.fetchRecentTranscripts(
        integration.apiKey, 
        Math.min(daysSinceLastSync, 30) // Cap at 30 days
      );

      result.totalProcessed = recentTranscripts.length;

      // 4. Process each transcript
      let totalActionsCreated = 0;
      
      for (const transcript of recentTranscripts) {
        try {
          // Check if already exists
          const existingSession = await db.transcriptionSession.findUnique({
            where: { sessionId: transcript.id }
          });

          const processedData = FirefliesService.processTranscription(transcript);
          
          const sessionData = {
            title: transcript.title || `Fireflies Meeting ${transcript.id}`,
            transcription: processedData.transcriptText || '',
            summary: processedData ? JSON.stringify(processedData.summary, null, 2) : null,
            sourceIntegrationId: integrationId,
          };

          let transcriptionSession;
          if (existingSession) {
            // Update existing
            transcriptionSession = await db.transcriptionSession.update({
              where: { sessionId: transcript.id },
              data: {
                ...sessionData,
                updatedAt: new Date(),
              }
            });
            result.updatedTranscripts++;
          } else {
            // Create new
            transcriptionSession = await db.transcriptionSession.create({
              data: {
                sessionId: transcript.id,
                ...sessionData,
                description: `Auto-synced from Fireflies integration: ${integration.name}`,
                userId: userId,
              }
            });
            result.newTranscripts++;
          }

          // 5. Process action items if available
          if (processedData && processedData.actionItems.length > 0) {
            try {
              const processors = await ActionProcessorFactory.createProcessors(
                userId, 
                undefined, // projectId - not specified at sync level
                transcriptionSession.id
              );
              
              for (const processor of processors) {
                const actionResult = await processor.processActionItems(processedData.actionItems);
                totalActionsCreated += actionResult.processedCount;
              }
            } catch (actionError) {
              console.error(`Failed to process action items for ${transcript.id}:`, actionError);
              // Continue processing other transcripts
            }
          }

        } catch (sessionError) {
          console.error(`Failed to process transcript ${transcript.id}:`, sessionError);
          result.skippedTranscripts++;
        }
      }

      result.actionsCreated = totalActionsCreated;

      // 6. Update integration last sync time
      await db.integration.update({
        where: { id: integrationId },
        data: { lastSyncAt: new Date() }
      });

      result.success = true;

      // 7. Send notification summary
      if (result.newTranscripts > 0 || result.updatedTranscripts > 0) {
        try {
          await NotificationServiceFactory.sendToAll(userId, {
            title: `📋 Fireflies Sync Complete`,
            message: `Synced ${result.newTranscripts} new and ${result.updatedTranscripts} updated meetings from ${integration.name}. Created ${result.actionsCreated} action items.`,
            priority: 'normal',
            metadata: {
              integrationName: integration.name,
              newTranscripts: result.newTranscripts,
              updatedTranscripts: result.updatedTranscripts,
              actionsCreated: result.actionsCreated,
            }
          });
        } catch (notificationError) {
          console.error('Failed to send sync notification:', notificationError);
          // Don't fail the whole sync for notification issues
        }
      }

    } catch (error) {
      console.error('Error in bulk sync:', error);
      result.error = error instanceof Error ? error.message : 'Unknown error occurred';
    }

    return result;
  }
}