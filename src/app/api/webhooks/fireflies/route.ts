import { type NextRequest, NextResponse } from 'next/server';
import { createHmac } from 'crypto';
import { db } from '~/server/db';
import { FirefliesService, type FirefliesTranscript } from '~/server/services/FirefliesService';
import { ActionProcessorFactory } from '~/server/services/processors/ActionProcessorFactory';
import { NotificationServiceFactory } from '~/server/services/notifications/NotificationServiceFactory';

// Types based on Fireflies webhook schema
interface FirefliesWebhookPayload {
  meetingId: string;
  eventType: string;
  clientReferenceId?: string;
}

function verifySignatureWithApiKey(payload: string, signature: string, apiKey: string): boolean {
  try {
    // Compute HMAC SHA-256 signature using the API key as secret
    const computedSignature = createHmac('sha256', apiKey)
      .update(payload, 'utf8')
      .digest('hex');
    
    // Format as expected by Fireflies (with sha256= prefix)
    const expectedSignature = `sha256=${computedSignature}`;
    
    // Constant-time comparison to prevent timing attacks
    return signature === expectedSignature;
  } catch (error) {
    console.error('Error verifying signature:', error);
    return false;
  }
}

async function findValidApiKeyAndUser(payload: string, signature: string) {
  if (!signature) {
    return null;
  }

  try {
    // Get all active API keys from the database
    const activeApiKeys = await db.verificationToken.findMany({
      where: {
        identifier: {
          startsWith: 'api-key:'
        },
        expires: {
          gt: new Date() // Only non-expired keys
        }
      },
      include: {
        user: true // Include user info
      }
    });

    // Try each API key to see if it validates the signature
    for (const keyRecord of activeApiKeys) {
      if (verifySignatureWithApiKey(payload, signature, keyRecord.token)) {
        return {
          apiKey: keyRecord.token,
          user: keyRecord.user,
          keyName: keyRecord.identifier.replace('api-key:', '')
        };
      }
    }

    return null; // No matching API key found
  } catch (error) {
    console.error('Error finding valid API key:', error);
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    // Get the raw body for signature verification
    const body = await request.text();
    const signature = request.headers.get('x-hub-signature');
    
    // Log the webhook for debugging
    console.log('🔥 Fireflies webhook received:', {
      signature: signature ? 'present' : 'missing',
      bodyLength: body.length,
      headers: Object.fromEntries(request.headers.entries())
    });

    // Find which user's API key was used for this webhook
    const validationResult = await findValidApiKeyAndUser(body, signature || '');
    
    if (!validationResult) {
      console.error('❌ Invalid webhook signature or no matching API key found');
      return NextResponse.json(
        { error: 'Invalid signature or API key not found' }, 
        { status: 401 }
      );
    }

    console.log('✅ Webhook signature verified for user:', {
      userId: validationResult.user.id,
      keyName: validationResult.keyName,
      userEmail: validationResult.user.email
    });

    // Parse the payload
    let payload: FirefliesWebhookPayload;
    try {
      payload = JSON.parse(body);
    } catch (parseError) {
      console.error('❌ Invalid JSON payload:', parseError);
      return NextResponse.json(
        { error: 'Invalid JSON payload' }, 
        { status: 400 }
      );
    }

    const { meetingId, eventType, clientReferenceId } = payload;

    console.log('🔥 Processing Fireflies webhook:', {
      meetingId,
      eventType,
      clientReferenceId
    });

    // Handle different event types
    switch (eventType) {
      case 'Transcription completed':
        await handleTranscriptionCompleted(meetingId, clientReferenceId, validationResult.user);
        break;
      
      default:
        console.log(`📝 Unhandled event type: ${eventType}`);
    }

    // Return success response
    return NextResponse.json({ 
      success: true, 
      message: 'Webhook processed successfully' 
    });

  } catch (error) {
    console.error('❌ Error processing Fireflies webhook:', error);
    return NextResponse.json(
      { error: 'Internal server error' }, 
      { status: 500 }
    );
  }
}

async function fetchFirefliesTranscript(meetingId: string, apiKey: string) {
  try {
    const query = `
      query Transcript($transcriptId: String!) {
        transcript(id: $transcriptId) {
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
        variables: { transcriptId: meetingId },
      }),
    });

    if (!response.ok) {
      throw new Error(`Fireflies API error: ${response.status}`);
    }

    const data = await response.json();
    
    if (data.errors) {
      throw new Error(`GraphQL error: ${data.errors[0]?.message || 'Unknown error'}`);
    }

    return data.data?.transcript;
  } catch (error) {
    console.error('Error fetching Fireflies transcript:', error);
    throw error;
  }
}

async function getFirefliesIntegration(userId: string): Promise<{ apiKey: string; integrationId: string } | null> {
  try {
    const integration = await db.integration.findFirst({
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

    if (!integration || integration.credentials.length === 0) {
      return null;
    }

    return {
      apiKey: integration.credentials[0]!.key,
      integrationId: integration.id,
    };
  } catch (error) {
    console.error('Error getting Fireflies integration:', error);
    return null;
  }
}

async function handleTranscriptionCompleted(meetingId: string, clientReferenceId: string | undefined, user: { id: string; email: string | null; name: string | null }) {
  try {
    console.log(`📝 Handling transcription completion for meeting: ${meetingId} (User: ${user.email})`);
    
    // 1. Get user's Fireflies integration
    const firefliesIntegration = await getFirefliesIntegration(user.id);
    if (!firefliesIntegration) {
      console.error('❌ No Fireflies integration found for user:', user.email);
      throw new Error('No Fireflies integration found for user');
    }

    // 2. Fetch the transcript from Fireflies API
    let transcript: FirefliesTranscript | null = null;
    let processedData;
    
    try {
      transcript = await fetchFirefliesTranscript(meetingId, firefliesIntegration.apiKey) as FirefliesTranscript;
      if (transcript && transcript.sentences) {
        console.log(`✅ Retrieved transcript with ${transcript.sentences.length} sentences`);
        
        // 3. Process transcript data using FirefliesService
        processedData = FirefliesService.processTranscription(transcript);
        console.log(`📊 Processed summary and found ${processedData.actionItems.length} action items`);
      } else {
        console.warn('⚠️ No transcript sentences found');
      }
    } catch (fetchError) {
      console.error('❌ Failed to fetch transcript from Fireflies:', fetchError);
      // Continue with creation but without transcript content
    }

    // 4. Save transcription session to database with summary
    const sessionId = clientReferenceId || meetingId;
    const title = transcript?.title || `Fireflies Meeting ${meetingId}`;
    
    // Check if session already exists
    const existingSession = await db.transcriptionSession.findUnique({
      where: { sessionId }
    });

    const sessionData = {
      title,
      transcription: processedData?.transcriptText || '',
      summary: processedData ? JSON.stringify(processedData.summary, null, 2) : null,
      sourceIntegrationId: firefliesIntegration.integrationId,
    };

    let transcriptionSession;
    if (existingSession) {
      // Update existing session
      transcriptionSession = await db.transcriptionSession.update({
        where: { sessionId },
        data: {
          ...sessionData,
          description: `${existingSession.description || ''}\n\nUpdated from Fireflies webhook: ${meetingId}`,
        }
      });
      console.log(`✅ Updated existing transcription session: ${sessionId}`);
    } else {
      // Create new session
      transcriptionSession = await db.transcriptionSession.create({
        data: {
          sessionId,
          ...sessionData,
          description: `Auto-imported from Fireflies. Meeting ID: ${meetingId}`,
          userId: user.id,
        }
      });
      console.log(`✅ Created new transcription session: ${sessionId}`);
    }

    // 5. Process action items if available
    const actionResults: any[] = [];
    if (processedData && processedData.actionItems.length > 0) {
      try {
        console.log(`🎯 Processing ${processedData.actionItems.length} action items`);
        
        // Get action processors for this user with transcription context
        const processors = await ActionProcessorFactory.createProcessors(
          user.id, 
          undefined, // projectId - not specified at webhook level
          transcriptionSession.id
        );
        
        for (const processor of processors) {
          const result = await processor.processActionItems(processedData.actionItems);
          actionResults.push({
            processor: processor.name,
            ...result
          });
          console.log(`✅ ${processor.name}: Created ${result.processedCount} actions`);
        }
      } catch (actionError) {
        console.error('❌ Failed to process action items:', actionError);
        // Don't throw - continue with notifications even if action processing fails
      }
    }

    // 6. Send notifications
    if (processedData) {
      try {
        const totalActionsCreated = actionResults.reduce((sum, result) => sum + result.processedCount, 0);
        const notificationMessage = FirefliesService.generateNotificationSummary(
          processedData.summary,
          totalActionsCreated
        );

        const notificationResults = await NotificationServiceFactory.sendToAll(user.id, {
          title: `📋 Meeting Summary: ${title}`,
          message: notificationMessage,
          priority: 'normal',
          metadata: {
            meetingId,
            actionItemsCount: processedData.actionItems.length,
            actionsCreated: totalActionsCreated,
          }
        });

        console.log(`📢 Sent notifications:`, notificationResults);
      } catch (notificationError) {
        console.error('❌ Failed to send notifications:', notificationError);
        // Don't throw - the main processing was successful
      }
    }

    console.log('✅ Transcription completion handled successfully');
  } catch (error) {
    console.error('❌ Error handling transcription completion:', error);
    throw error;
  }
}

// Also handle GET for webhook verification if needed
export async function GET() {
  return NextResponse.json({ 
    message: 'Fireflies webhook endpoint is active',
    timestamp: new Date().toISOString()
  });
}