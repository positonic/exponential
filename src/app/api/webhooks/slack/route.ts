import { type NextRequest, NextResponse } from 'next/server';
import { createHmac, randomBytes } from 'crypto';
import { db } from '~/server/db';
import { ActionProcessorFactory } from '~/server/services/processors/ActionProcessorFactory';
import { createCallerFactory } from '~/server/api/trpc';
import { appRouter } from '~/server/api/root';
import { parseActionInput } from '~/server/services/parsing';
import { SlackChannelResolver } from '~/server/services/SlackChannelResolver';

// Slack API client
const SLACK_API_BASE = 'https://slack.com/api';

// Event deduplication - using database for serverless persistence
const EVENT_CACHE_TTL = 300000; // 5 minutes

async function isEventProcessed(eventKey: string): Promise<boolean> {
  try {
    // Check if event was processed in last 5 minutes using database
    const cutoff = new Date(Date.now() - EVENT_CACHE_TTL);
    const existing = await db.slackEvent.findFirst({
      where: {
        eventKey,
        processedAt: {
          gte: cutoff
        }
      }
    });
    return !!existing;
  } catch (error) {
    console.error('Error checking event deduplication:', error);
    return false; // If DB fails, allow processing to prevent blocking
  }
}

async function markEventProcessed(eventKey: string): Promise<void> {
  try {
    await db.slackEvent.create({
      data: {
        eventKey,
        processedAt: new Date()
      }
    });
    
    // Trigger cleanup of old events (fire and forget)
    void cleanupOldEvents();
  } catch (error) {
    // Ignore duplicate key errors (race condition)
    if (!(error as Error).message?.includes('Unique constraint')) {
      console.error('Error marking event as processed:', error);
    }
  }
}

async function cleanupOldEvents(): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - EVENT_CACHE_TTL);
    const deleted = await db.slackEvent.deleteMany({
      where: {
        processedAt: {
          lt: cutoff
        }
      }
    });
    
    if (deleted.count > 0) {
      console.log(`🧹 Cleaned up ${deleted.count} old Slack events`);
    }
  } catch (error) {
    console.error('Error cleaning up old events:', error);
  }
}

interface MessageLogData {
  slackEventId?: string;
  channelId: string;
  channelType: string;
  timestamp: string;
  slackUserId: string;
  systemUserId?: string;
  userName?: string;
  rawMessage: string;
  cleanMessage: string;
  messageType?: string;
  agentUsed?: string;
  responseTime?: number;
  hadError?: boolean;
  errorMessage?: string;
  category?: string;
  intent?: string;
}

async function logMessageHistory(data: MessageLogData): Promise<void> {
  try {
    await db.slackMessageHistory.create({
      data: {
        slackEventId: data.slackEventId,
        channelId: data.channelId,
        channelType: data.channelType,
        timestamp: data.timestamp,
        slackUserId: data.slackUserId,
        systemUserId: data.systemUserId,
        userName: data.userName,
        rawMessage: data.rawMessage,
        cleanMessage: data.cleanMessage,
        messageType: data.messageType,
        agentUsed: data.agentUsed,
        responseTime: data.responseTime,
        hadError: data.hadError || false,
        errorMessage: data.errorMessage,
        category: data.category,
        intent: data.intent,
      }
    });
  } catch (error) {
    console.error('Error logging message history:', error);
  }
}

function categorizeMessage(message: string): { category: string; intent: string; messageType: string } {
  const lowerMessage = message.toLowerCase().trim();
  
  // Goal-related
  if (lowerMessage.includes('goal') || lowerMessage.includes('objective')) {
    if (lowerMessage.includes('what') || lowerMessage.includes('list') || lowerMessage.includes('show')) {
      return { category: 'goals', intent: 'list_goals', messageType: 'question' };
    }
    if (lowerMessage.includes('create') || lowerMessage.includes('add') || lowerMessage.includes('new')) {
      return { category: 'goals', intent: 'create_goal', messageType: 'command' };
    }
    return { category: 'goals', intent: 'general_goals', messageType: 'question' };
  }
  
  // Project-related
  if (lowerMessage.includes('project')) {
    if (lowerMessage.includes('status') || lowerMessage.includes('progress')) {
      return { category: 'projects', intent: 'project_status', messageType: 'question' };
    }
    if (lowerMessage.includes('list') || lowerMessage.includes('show')) {
      return { category: 'projects', intent: 'list_projects', messageType: 'question' };
    }
    return { category: 'projects', intent: 'general_projects', messageType: 'question' };
  }
  
  // Action/Task-related
  if (lowerMessage.includes('task') || lowerMessage.includes('action') || lowerMessage.includes('todo')) {
    if (lowerMessage.includes('create') || lowerMessage.includes('add') || lowerMessage.includes('new')) {
      return { category: 'actions', intent: 'create_task', messageType: 'command' };
    }
    if (lowerMessage.includes('list') || lowerMessage.includes('show') || lowerMessage.includes('what')) {
      return { category: 'actions', intent: 'list_tasks', messageType: 'question' };
    }
    return { category: 'actions', intent: 'general_tasks', messageType: 'question' };
  }
  
  // Status checks
  if (lowerMessage.includes('status') || lowerMessage.includes('progress') || lowerMessage.includes('update')) {
    return { category: 'general', intent: 'status_check', messageType: 'question' };
  }
  
  // Help/General
  if (lowerMessage.includes('help') || lowerMessage.includes('how') || lowerMessage.includes('what can')) {
    return { category: 'general', intent: 'help_request', messageType: 'question' };
  }
  
  // Greetings
  if (lowerMessage.match(/^(hi|hello|hey|sup|yo)$/)) {
    return { category: 'general', intent: 'greeting', messageType: 'social' };
  }
  
  return { category: 'general', intent: 'unknown', messageType: 'question' };
}

// Slack Event API payload types
interface SlackEventPayload {
  token: string;
  team_id: string;
  api_app_id: string;
  event: SlackEvent;
  type: 'event_callback' | 'url_verification';
  event_id?: string;
  event_time?: number;
  authed_users?: string[];
  challenge?: string; // For URL verification
}

interface SlackEvent {
  type: string;
  user?: string;
  text?: string;
  ts?: string;
  channel?: string;
  thread_ts?: string;
  bot_id?: string;
  subtype?: string;
  command?: string;
  response_url?: string;
  trigger_id?: string;
  event_id?: string; // Available on some event types for deduplication
}

// Slack Interactive Components payload
interface SlackInteractivePayload {
  type: 'block_actions' | 'view_submission' | 'shortcut';
  user: {
    id: string;
    name: string;
  };
  trigger_id: string;
  team: {
    id: string;
    domain: string;
  };
  actions?: Array<{
    action_id: string;
    block_id: string;
    value?: string;
    text?: {
      type: string;
      text: string;
    };
  }>;
  view?: any;
  response_url?: string;
}

// Slack slash command payload
interface SlackSlashCommandPayload {
  token: string;
  team_id: string;
  team_domain: string;
  channel_id: string;
  channel_name: string;
  user_id: string;
  user_name: string;
  command: string;
  text: string;
  response_url: string;
  trigger_id: string;
}

function verifySlackSignature(payload: string, timestamp: string, signature: string, signingSecret: string): boolean {
  try {
    // Slack signature verification
    // https://api.slack.com/authentication/verifying-requests-from-slack
    
    const currentTime = Math.floor(Date.now() / 1000);
    const requestTime = parseInt(timestamp);
    
    // Request should be within 5 minutes
    if (Math.abs(currentTime - requestTime) > 300) {
      console.error('Slack webhook timestamp too old');
      console.error('Time difference:', Math.abs(currentTime - requestTime), 'seconds');
      return false;
    }
    
    const baseString = `v0:${timestamp}:${payload}`;
    const computedSignature = `v0=${createHmac('sha256', signingSecret)
      .update(baseString, 'utf8')
      .digest('hex')}`;
    
    
    // Constant-time comparison
    return signature === computedSignature;
  } catch (error) {
    console.error('Error verifying Slack signature:', error);
    return false;
  }
}

async function findSlackIntegrationByTeam(teamId: string, appId?: string) {
  try {
    // First, try to find by team_id and app_id if app_id is provided
    if (appId) {
      const integrationWithAppId = await db.integration.findFirst({
        where: {
          provider: 'slack',
          status: 'ACTIVE',
          AND: [
            {
              credentials: {
                some: {
                  keyType: 'TEAM_ID',
                  key: teamId
                }
              }
            },
            {
              credentials: {
                some: {
                  keyType: 'APP_ID',
                  key: appId
                }
              }
            }
          ]
        },
        include: {
          user: true,
          team: true,
          credentials: {
            where: {
              keyType: {
                in: ['BOT_TOKEN', 'SIGNING_SECRET', 'USER_TOKEN', 'APP_ID']
              }
            }
          }
        }
      });

      if (integrationWithAppId) {
        const credentials = integrationWithAppId.credentials.reduce((acc: Record<string, string>, cred: any) => {
          acc[cred.keyType as string] = cred.key;
          return acc;
        }, {} as Record<string, string>);

        return {
          integration: integrationWithAppId,
          user: integrationWithAppId.user,
          team: integrationWithAppId.team,
          credentials
        };
      }
    }

    // Fallback: find by team_id only (existing behavior)
    const integration = await db.integration.findFirst({
      where: {
        provider: 'slack',
        status: 'ACTIVE',
        credentials: {
          some: {
            keyType: 'TEAM_ID',
            key: teamId
          }
        }
      },
      include: {
        user: true,
        team: true,
        credentials: {
          where: {
            keyType: {
              in: ['BOT_TOKEN', 'SIGNING_SECRET', 'USER_TOKEN', 'APP_ID']
            }
          }
        }
      }
    });

    if (!integration) {
      return null;
    }

    const credentials = integration.credentials.reduce((acc: Record<string, string>, cred: any) => {
      acc[cred.keyType as string] = cred.key;
      return acc;
    }, {} as Record<string, string>);

    return {
      integration,
      user: integration.user,
      team: integration.team,
      credentials
    };
  } catch (error) {
    console.error('Error finding Slack integration:', error);
    return null;
  }
}

async function createSlackRegistrationToken(
  slackUserId: string, 
  integrationId: string, 
  teamId?: string
): Promise<string> {
  try {
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await db.slackRegistrationToken.create({
      data: {
        token,
        slackUserId,
        integrationId,
        teamId,
        expiresAt
      }
    });

    return token;
  } catch (error) {
    console.error('Error creating registration token:', error);
    throw error;
  }
}

async function sendAccessDeniedWithRegistration(
  slackUserId: string,
  channel: string,
  integrationData: any,
  threadTs?: string
) {
  try {
    const registrationToken = await createSlackRegistrationToken(
      slackUserId,
      integrationData.integration.id,
      integrationData.team?.id
    );

    const registrationUrl = `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/auth/slack-connect?token=${registrationToken}`;
    
    const message = `🚨 **Access denied** - You are not authorized to use this system.\n\n` +
      `To connect your Slack account to Exponential, please:\n` +
      `1. Click here: ${registrationUrl}\n` +
      `2. Sign in to your Exponential account\n` +
      `3. Complete the connection process\n\n` +
      `*This link expires in 24 hours. Contact your team administrator if you need help.*`;

    await sendSlackResponse(message, channel, integrationData, threadTs);

    console.log(`🔗 [Registration] Created registration link for Slack user ${slackUserId}: ${registrationUrl}`);
  } catch (error) {
    console.error('Error creating registration link:', error);
    
    // Fallback to basic message if registration fails
    await sendSlackResponse(
      "🚨 Access denied. You are not authorized to use this system. Please contact your team administrator to be added.",
      channel,
      integrationData,
      threadTs
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const timestamp = request.headers.get('x-slack-request-timestamp');
    const signature = request.headers.get('x-slack-signature');
    

    // Handle different content types
    let payload: SlackEventPayload | SlackSlashCommandPayload | SlackInteractivePayload;
    const contentType = request.headers.get('content-type') || '';
    
    if (contentType.includes('application/json')) {
      // Event API or other JSON payloads
      if (!body || body.trim() === '') {
        console.error('❌ Empty JSON body received');
        return new Response('Invalid JSON payload', { status: 400 });
      }
      
      try {
        payload = JSON.parse(body);
      } catch (error) {
        console.error('❌ JSON parse error:', {
          error: error instanceof Error ? error.message : 'Unknown error',
          body: body.substring(0, 100) + '...',
          contentType,
          bodyLength: body.length
        });
        return new Response('Invalid JSON payload', { status: 400 });
      }
    } else if (contentType.includes('application/x-www-form-urlencoded')) {
      // Slash commands or interactive components
      const formData = new URLSearchParams(body);
      const payloadStr = formData.get('payload');
      
      if (payloadStr) {
        // Interactive component
        payload = JSON.parse(payloadStr) as SlackInteractivePayload;
      } else {
        // Slash command - convert form data to object
        payload = Object.fromEntries(formData.entries()) as unknown as SlackSlashCommandPayload;
      }
    } else {
      console.error('❌ Unsupported content type:', contentType);
      return NextResponse.json(
        { error: 'Unsupported content type' },
        { status: 400 }
      );
    }

    // Handle URL verification for Event API
    if ('type' in payload && payload.type === 'url_verification') {
        return NextResponse.json({ challenge: payload.challenge });
    }

    // Get team ID and app ID from different payload types
    let teamId: string;
    let appId: string | undefined;
    
    if ('team_id' in payload) {
      teamId = payload.team_id;
    } else if ('team' in payload && payload.team.id) {
      teamId = payload.team.id;
    } else {
      console.error('❌ No team ID found in payload');
      return NextResponse.json(
        { error: 'No team ID found' },
        { status: 400 }
      );
    }
    
    // Get app ID if available
    if ('api_app_id' in payload) {
      appId = payload.api_app_id;
    } else if ('app_id' in payload && typeof payload.app_id === 'string') {
      appId = payload.app_id;
    }
    

    // Find the integration for this team and app
    const integrationData = await findSlackIntegrationByTeam(teamId, appId);
    if (!integrationData) {
      console.error('❌ No Slack integration found for team:', teamId, 'appId:', appId);
      return NextResponse.json(
        { error: 'Integration not found' },
        { status: 404 }
      );
    }
    

    // Verify signature if we have signing secret
    if (timestamp && signature && integrationData.credentials.SIGNING_SECRET) {
      const isValid = verifySlackSignature(body, timestamp, signature, integrationData.credentials.SIGNING_SECRET);
      if (!isValid) {
        console.error('❌ Invalid Slack signature');
        return NextResponse.json(
          { error: 'Invalid signature' },
          { status: 401 }
        );
      }
    }


    // Route to appropriate handler based on payload type
    let response;
    if ('type' in payload && payload.type === 'event_callback') {
      // Event API
      response = await handleSlackEvent(payload, integrationData);
    } else if ('command' in payload) {
      // Slash command
      response = await handleSlashCommand(payload, integrationData);
    } else if ('actions' in payload || 'view' in payload) {
      // Interactive component
      response = await handleInteractiveComponent(payload, integrationData);
    } else {
      response = { success: true, message: 'Received but not processed' };
    }

    return NextResponse.json(response);

  } catch (error) {
    console.error('❌ Error processing Slack webhook:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

async function handleSlackEvent(payload: SlackEventPayload, integrationData: any) {
  const { event, event_id } = payload;
  const { user: installerUser, integration } = integrationData;
  
  // Check for duplicate event using persistent database deduplication
  if (event_id) {
    if (await isEventProcessed(`event-${event_id}`)) {
      console.log(`⚠️ Duplicate event detected: ${event_id}, skipping`);
      return { success: true, message: 'Duplicate event skipped' };
    }
    // Mark this event as processed IMMEDIATELY to prevent race conditions
    await markEventProcessed(`event-${event_id}`);
    console.log(`📝 [Event] Processing event ${event_id} for user ${event.user}`);
  }

  // CROSS-EVENT DEDUPLICATION: Prevent same message from being processed via different event types
  // Create a content-based key that's the same regardless of event type (message.im vs app_mention)
  if (event.channel && event.ts && event.user) {
    const contentKey = `msg-${event.channel}-${event.ts}-${event.user}`;
    if (await isEventProcessed(contentKey)) {
      console.log(`⚠️ Cross-event duplicate detected: ${contentKey} (event_id: ${event_id}), skipping`);
      return { success: true, message: 'Cross-event duplicate skipped' };
    }
    // Mark this content as processed to prevent duplicate responses
    await markEventProcessed(contentKey);
    console.log(`📝 [Content] Processing message ${contentKey} via ${event.type}`);
  }

  // Resolve the actual Slack user who sent the message
  const slackUserId = event.user;
  const slackUsername = 'Unknown'; // Slack doesn't always provide username in events
  
  if (!slackUserId) {
    console.warn('⚠️ No Slack user ID in event, using integration installer');
    // Use installer as fallback
  }

  // Find the authenticated user for this Slack user
  let authenticatedUser = installerUser; // Default fallback for when slackUserId is missing
  if (slackUserId) {
    const resolvedUser = await findTeamMemberFromSlackUser(integration, slackUserId, slackUsername);
    if (resolvedUser) {
      authenticatedUser = resolvedUser;
      console.log(`🔐 [Auth] Resolved Slack user ${slackUserId} to system user ${authenticatedUser.name}`);
    } else {
      // SECURITY: Reject unauthorized users instead of falling back to installer
      console.warn(`🚨 [Security] Access denied for Slack user ${slackUserId} - not authorized`);
      authenticatedUser = null;
    }
  }

  switch (event.type) {
    case 'app_home_opened':
      console.log(`🏠 [Slack] Processing app home opened for user ${slackUserId}`);
      await handleAppHomeOpened(event, authenticatedUser, integrationData);
      break;
    
    case 'message':
      // Only process non-bot DMs (avoid duplicate processing with app_mention)
      if (!event.bot_id && event.channel?.startsWith('D')) {
        console.log(`💬 [Slack] Processing DM from user ${slackUserId}`);
        
        // Check authorization before processing
        if (!authenticatedUser) {
          if (slackUserId) {
            await sendAccessDeniedWithRegistration(
              slackUserId,
              event.channel,
              integrationData
            );
          } else {
            await sendSlackResponse(
              "🚨 Access denied. You are not authorized to use this system. Please contact your team administrator to be added.",
              event.channel,
              integrationData
            );
          }
          return { success: true, message: 'Unauthorized user denied' };
        }
        
        return await handleBotMention(event, authenticatedUser, integrationData);
      }
      break;
    
    case 'app_mention':
      // Handle channel mentions only
      console.log(`🏷️ [Slack] Processing app mention from user ${slackUserId}`);
      
      // Check authorization before processing
      if (!authenticatedUser) {
        if (slackUserId) {
          await sendAccessDeniedWithRegistration(
            slackUserId,
            event.channel!,
            integrationData,
            event.thread_ts
          );
        } else {
          await sendSlackResponse(
            "🚨 Access denied. You are not authorized to use this system. Please contact your team administrator to be added.",
            event.channel!,
            integrationData,
            event.thread_ts
          );
        }
        return { success: true, message: 'Unauthorized user denied' };
      }
      
      return await handleBotMention(event, authenticatedUser, integrationData);
    
    default:
  }

  return { success: true, message: 'Event processed' };
}

async function handleSlashCommand(payload: SlackSlashCommandPayload, integrationData: any) {
  const { command, text, user_id, user_name, channel_id, response_url } = payload;
  const { user: installerUser, integration } = integrationData;

  // Resolve the actual Slack user who sent the slash command
  const slackUserId = user_id;
  const slackUsername = user_name || 'Unknown';
  
  // Find the authenticated user for this Slack user
  let authenticatedUser = installerUser; // Default fallback
  const resolvedUser = await findTeamMemberFromSlackUser(integration, slackUserId, slackUsername);
  if (resolvedUser) {
    authenticatedUser = resolvedUser;
    console.log(`🔐 [Auth] Resolved Slack user ${slackUserId} (${slackUsername}) to system user ${authenticatedUser.name}`);
  } else {
    console.warn(`⚠️ Could not resolve Slack user ${slackUserId} (${slackUsername}), using integration installer`);
  }

  try {
    switch (command) {
      case '/expo':
      case '/exponential':
        return await handleExpoCommand(text, authenticatedUser, response_url, channel_id, integrationData);
      
      case '/zoe':
      case '/z':
        // Primary AI companion
        if (text.trim()) {
          void handleDeferredZoeResponse(text, authenticatedUser, response_url, {
            channelId: channel_id,
            integrationData,
          });
          return {
            response_type: 'ephemeral',
            text: '🔮 Zoe is thinking...'
          };
        } else {
          return {
            response_type: 'ephemeral',
            text: 'Hey! I\'m Zoe 🔮 — what\'s on your mind?'
          };
        }

      case '/paddy':
      case '/p':
        // Legacy support - redirects to Zoe
        if (text.trim()) {
          void handleDeferredZoeResponse(text, authenticatedUser, response_url, {
            channelId: channel_id,
            integrationData,
          });
          return {
            response_type: 'ephemeral',
            text: '🔮 Zoe is thinking...'
          };
        } else {
          return {
            response_type: 'ephemeral',
            text: 'Hey! I\'m Zoe 🔮 (Paddy retired) — what\'s on your mind?'
          };
        }
      
      default:
        return {
          response_type: 'ephemeral',
          text: `Unknown command: ${command}`
        };
    }
  } catch (error) {
    console.error('Error handling slash command:', error);
    return {
      response_type: 'ephemeral',
      text: 'Sorry, there was an error processing your command.'
    };
  }
}

async function handleInteractiveComponent(payload: SlackInteractivePayload, integrationData: any) {
  const { type, actions } = payload;
  const { user } = integrationData;


  if (type === 'block_actions' && actions) {
    for (const action of actions) {
      if (action.action_id.startsWith('complete_action_')) {
        const actionId = action.action_id.replace('complete_action_', '');
        await handleActionComplete(actionId, user, payload.response_url);
      } else if (action.action_id.startsWith('snooze_action_')) {
        const actionId = action.action_id.replace('snooze_action_', '');
        await handleActionSnooze(actionId, user, payload.response_url);
      }
    }
  }

  return { success: true };
}

async function findUserFromSlackIntegration(
  integrationId: string,
  slackUserId: string
): Promise<any> {
  try {
    // Look for existing mapping
    const userMapping = await db.integrationUserMapping.findFirst({
      where: {
        integrationId,
        externalUserId: slackUserId
      },
      include: {
        user: true
      }
    });
    
    if (userMapping) {
      return userMapping.user;
    }
    
    return null;
  } catch (error) {
    console.error('Error finding user from Slack integration:', error);
    return null;
  }
}

async function createSlackUserMapping(
  integrationId: string,
  slackUserId: string,
  systemUserId: string
): Promise<boolean> {
  try {
    await db.integrationUserMapping.create({
      data: {
        integrationId,
        externalUserId: slackUserId,
        userId: systemUserId
      }
    });
    return true;
  } catch (error) {
    console.error('Error creating Slack user mapping:', error);
    return false;
  }
}

async function findTeamMemberFromSlackUser(
  integration: any,
  slackUserId: string,
  slackUsername: string
): Promise<any> {
  try {
    // First, try to find existing mapping
    const mappedUser = await findUserFromSlackIntegration(integration.id, slackUserId);
    if (mappedUser) {
      return mappedUser;
    }

    // If no mapping exists and integration has a team, try to match by email/username
    if (integration.team) {
      const teamMembers = await db.teamUser.findMany({
        where: { teamId: integration.team.id },
        include: { user: true }
      });

      // Try to match by exact username or email starting with username
      // SECURITY: Use more precise matching to prevent false positives
      const matchedMember = teamMembers.find(tm => {
        const userEmail = tm.user.email?.toLowerCase() || '';
        const userName = tm.user.name?.toLowerCase() || '';
        const slackUserLower = slackUsername.toLowerCase();
        
        // Exact name match OR email starts with username followed by @ or .
        return userName === slackUserLower || 
               userEmail === `${slackUserLower}@${userEmail.split('@')[1]}` ||
               userEmail.startsWith(`${slackUserLower}.`) ||
               userEmail.startsWith(`${slackUserLower}@`);
      });

      if (matchedMember) {
        // Create mapping for future use
        await createSlackUserMapping(integration.id, slackUserId, matchedMember.user.id);
        return matchedMember.user;
      }
    }

    // SECURITY: Do NOT fall back to integration installer - this creates identity substitution vulnerability
    // Log the unauthorized access attempt for security monitoring
    console.error(`🚨 [SECURITY ALERT] Unauthorized Slack access attempt:`, {
      slackUserId,
      slackUsername, 
      integrationId: integration.id,
      teamId: integration.team?.id || 'no-team',
      timestamp: new Date().toISOString()
    });

    // Return null to reject unauthorized access
    return null;
  } catch (error) {
    console.error('Error finding team member from Slack user:', error);
    return null;
  }
}

/**
 * Build concise OKR and project summary context for a workspace.
 * Used to give the Slack bot awareness of workspace-level goals and active projects.
 */
async function buildWorkspaceOKRContext(workspaceId: string): Promise<string> {
  const [goals, projects] = await Promise.all([
    db.goal.findMany({
      where: { workspaceId },
      include: {
        keyResults: {
          select: {
            title: true,
            targetValue: true,
            currentValue: true,
            startValue: true,
            unit: true,
            status: true,
          },
        },
      },
      orderBy: { title: 'asc' },
      take: 10,
    }),
    db.project.findMany({
      where: {
        workspaceId,
        status: { in: ['ACTIVE', 'IN_PROGRESS', 'AT_RISK'] },
      },
      select: {
        id: true,
        name: true,
        status: true,
        description: true,
        actions: {
          select: { status: true, kanbanStatus: true },
        },
      },
      orderBy: { name: 'asc' },
      take: 15,
    }),
  ]);

  let context = '';

  if (goals.length > 0) {
    context += 'OKRs (Objectives & Key Results):\n';
    for (const goal of goals) {
      const krs = goal.keyResults;
      const avgProgress = krs.length > 0
        ? krs.reduce((acc, kr) => {
            const range = kr.targetValue - kr.startValue;
            const progress = range > 0 ? ((kr.currentValue - kr.startValue) / range) * 100 : 0;
            return acc + Math.min(100, Math.max(0, progress));
          }, 0) / krs.length
        : 0;

      context += `\n• Objective: "${goal.title}" (${Math.round(avgProgress)}% overall)`;
      if (goal.period) context += ` [${goal.period}]`;
      for (const kr of krs) {
        const krRange = kr.targetValue - kr.startValue;
        const krProgress = krRange > 0 ? ((kr.currentValue - kr.startValue) / krRange) * 100 : 0;
        context += `\n  - KR: "${kr.title}" — ${kr.currentValue}/${kr.targetValue} ${kr.unit} (${Math.round(Math.min(100, Math.max(0, krProgress)))}%, ${kr.status})`;
      }
    }
  }

  if (projects.length > 0) {
    context += '\n\nActive Projects:\n';
    for (const p of projects) {
      const totalActions = p.actions.length;
      const completedActions = p.actions.filter(a =>
        a.status === 'COMPLETED' || a.kanbanStatus === 'DONE'
      ).length;
      const actionProgress = totalActions > 0 ? Math.round((completedActions / totalActions) * 100) : 0;
      context += `• "${p.name}" — ${p.status ?? 'unknown'}, ${completedActions}/${totalActions} actions done (${actionProgress}%)`;
      if (p.description) context += ` — ${p.description.slice(0, 80)}`;
      context += '\n';
    }
  }

  return context;
}

async function chatWithZoeUsingTRPC(
  message: string,
  user: any,
  channelContext?: { channelId: string; integrationData: any }
): Promise<string> {
  const startTime = Date.now();
  
  try {
    // Create mock session for server-side tRPC call
    const mockSession = {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        image: user.image,
        isAdmin: user.isAdmin ?? false,
      },
      expires: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1 hour
    };

    // Create server-side tRPC caller with authentication context
    const createCaller = createCallerFactory(appRouter);
    const caller = createCaller({
      db,
      session: mockSession,
      headers: new Headers() // Mock headers for server-side call
    });

    // Get available agents
    console.log(`🔍 [Zoe] Fetching agents for user ${user.id}...`);
    const mastraAgents = await caller.mastra.getMastraAgents();
    console.log(`🔍 [Zoe] Found ${mastraAgents.length} agents: ${mastraAgents.map(a => a.id).join(', ')}`);

    // Find Zoe agent or fallback
    let targetAgentId: string;
    const zoeAgent = mastraAgents.find(agent =>
      agent.name.toLowerCase() === 'zoe' ||
      agent.id.toLowerCase() === 'zoeagent'
    );

    if (zoeAgent) {
      targetAgentId = zoeAgent.id;
    } else if (mastraAgents.length > 0) {
      // Use agent selection if Zoe not found
      const { agentId } = await caller.mastra.chooseAgent({ message });
      targetAgentId = agentId;
    } else {
      throw new Error('No agents available');
    }
    console.log(`🔍 [Zoe] Using agent: ${targetAgentId}`);

    // Resolve channel-to-project and workspace context if available
    let projectContext = '';
    let workspaceContext = '';
    let resolvedWorkspaceId: string | undefined;
    if (channelContext?.channelId && !channelContext.channelId.startsWith('D')) {
      const botToken = channelContext.integrationData?.credentials?.BOT_TOKEN;
      const integrationId = channelContext.integrationData?.integration?.id;
      if (botToken) {
        const { projects, teams, workspaces } = await SlackChannelResolver.resolveProjectFromChannelId(
          channelContext.channelId,
          botToken,
          integrationId
        );
        if (projects.length === 1) {
          const project = projects[0]!;
          projectContext = `\n\nCHANNEL PROJECT CONTEXT:
This Slack channel is linked to the project "${project.name}" (ID: ${project.id}).
Project status: ${project.status ?? 'unknown'}
${project.description ? `Project description: ${project.description}` : ''}
When the user says "this project" or "the project", they are referring to "${project.name}".
Use the project ID ${project.id} when querying for project-specific data.`;
        } else if (projects.length > 1) {
          const projectDetails = projects
            .map(p => `- "${p.name}" (ID: ${p.id}, status: ${p.status ?? 'unknown'})${p.description ? ` — ${p.description}` : ''}`)
            .join('\n');
          projectContext = `\n\nCHANNEL PROJECT CONTEXT:
This Slack channel is linked to ${projects.length} projects:
${projectDetails}
When the user says "this project", ask which one they mean or use context clues.
Use the project IDs above when querying for project-specific data.`;
        }
        for (const team of teams) {
          projectContext += `\nThis channel is associated with team "${team.name}" (ID: ${team.id}).`;
        }

        // Resolve workspace context with OKRs and project summaries
        if (workspaces.length >= 1) {
          const workspace = workspaces[0]!;
          resolvedWorkspaceId = workspace.id;
          const okrContext = await buildWorkspaceOKRContext(workspace.id);
          workspaceContext = `\n\nWORKSPACE CONTEXT:
This channel is linked to workspace "${workspace.name}" (slug: ${workspace.slug}, type: ${workspace.type}).
When the user mentions "the workspace", "our team", or asks about overall progress, they mean "${workspace.name}".
${okrContext}`;
        }
      }
    }

    // Generate system context for Slack interaction
    const systemContext = `You are Zoe 🔮, an AI companion integrated with Slack.
The user is ${user.name || 'User'} (ID: ${user.id}).
Current date: ${new Date().toISOString().split('T')[0]}

You can help with:
- Figuring out what to focus on
- Breaking down projects into actions
- Tracking progress on goals
- Thinking through decisions
- Accessing meeting transcriptions and project data

Be concise, direct, and genuinely helpful. Skip the corporate fluff.

FORMATTING: You are responding in Slack, NOT a markdown renderer. Use Slack mrkdwn format:
- Bold: *text* (single asterisks, NOT **double**)
- Italic: _text_
- Code: \`code\` or \`\`\`code block\`\`\`
- Lists: use • or numbered lists
- DO NOT use markdown headers (# or ## or ###) — they render as literal text in Slack
- DO NOT use markdown links [text](url) — use <url|text> instead
- Use line breaks and emoji to structure sections visually

IMPORTANT: Keep responses under 3000 characters due to Slack message limits.${projectContext}${workspaceContext}`;

    // Call agent through authenticated tRPC
    console.log(`🔍 [Zoe] Calling agent ${targetAgentId} with message: "${message.slice(0, 80)}..."`);
    const result = await caller.mastra.callAgent({
      agentId: targetAgentId,
      workspaceId: resolvedWorkspaceId,
      messages: [
        { role: 'system', content: systemContext },
        { role: 'user', content: message }
      ]
    });
    console.log(`✅ [Zoe] Agent responded in ${Date.now() - startTime}ms`);

    const finalResponse = typeof result.response === 'string'
      ? result.response
      : 'Sorry, I had trouble understanding that. Can you try rephrasing?';
    
    return finalResponse;

  } catch (error) {
    const totalTime = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error(`❌ [Zoe] Error after ${totalTime}ms: ${errorMsg}`, { error: errorMsg, stack: errorStack });

    if (error instanceof Error) {
      if (error.message.toLowerCase().includes('timeout')) {
        return 'The request timed out. Please try asking something simpler or try again in a moment.';
      }
      if (error.message.toLowerCase().includes('unauthorized')) {
        return 'I had trouble accessing some features. Please try a simpler question.';
      }
      if (error.message.includes('No agents available')) {
        return 'I\'m having trouble connecting to my AI backend. The team has been notified.';
      }
      if (error.message.includes('Mastra generate failed')) {
        return `I ran into an issue processing your request. Please try again in a moment.`;
      }
    }

    return `Sorry, I encountered an error. Please try again later. (Debug: ${errorMsg.slice(0, 100)})`;
  }
}

/**
 * Format AI responses for Slack's mrkdwn format.
 * Slack uses its own markup: *bold*, _italic_, ~strike~, `code`, ```code block```
 * Slack does NOT support: ## headers, **bold**, [links](url) with text, or nested formatting.
 */
function formatResponseForSlack(response: string): string {
  const formatted = response
    // Convert markdown headers (###, ##, #) to bold text with newline
    .replace(/^#{1,3}\s+(.+)$/gm, '\n*$1*')
    // Convert **bold** to *bold* for Slack
    .replace(/\*\*(.*?)\*\*/g, '*$1*')
    // Convert markdown links [text](url) to Slack format <url|text>
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<$2|$1>')
    // Convert markdown bullet dashes to bullet points
    .replace(/^(\s*)-\s+/gm, '$1• ')
    // Clean up triple asterisks from bold+italic collisions
    .replace(/\*\*\*/g, '*')
    // Clean up multiple line breaks
    .replace(/\n{3,}/g, '\n\n')
    // Remove horizontal rules (--- or ***)
    .replace(/^[-*]{3,}$/gm, '───')
    .trim();

  return formatted;
}


async function handleDeferredZoeResponse(
  message: string,
  user: any,
  responseUrl: string,
  channelContext?: { channelId: string; integrationData: any }
) {
  try {
    const zoeResponse = await chatWithZoeUsingTRPC(message, user, channelContext);
    const formattedResponse = formatResponseForSlack(zoeResponse);
    
    // Send the response back to Slack using the response_url
    await fetch(responseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        response_type: 'in_channel',
        text: formattedResponse
      })
    });
    
  } catch (error) {
    console.error('❌ [Deferred] Error in deferred Zoe response:', error);
    
    // Send error message back to Slack
    await fetch(responseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        response_type: 'ephemeral',
        text: 'Sorry, I encountered an error processing your request. Please try a simpler question or try again later.'
      })
    });
  }
}

async function handleBotMention(event: SlackEvent, user: any, integrationData: any) {
  const text = event.text || '';
  const cleanText = text.replace(/<@[A-Z0-9]+>/g, '').trim();
  const isDM = event.channel?.startsWith('D');
  
  // Create a unique key for this message to prevent duplicate processing
  // Include user ID to prevent cross-user conflicts
  const messageKey = `botmention-${event.channel}-${event.ts}-${user.id}`;
  if (await isEventProcessed(messageKey)) {
    console.log(`⚠️ Duplicate message detected: ${messageKey}, skipping`);
    return { success: true };
  }
  // Mark as processed IMMEDIATELY to prevent race conditions
  await markEventProcessed(messageKey);
  console.log(`📝 [Message] Processing message ${messageKey} for user ${user.id}`);

  // SECURITY: Double-check that user is authenticated before processing any commands
  // This prevents welcome messages from showing to unauthorized users
  if (!user || !user.id) {
    console.error('🚨 [Security] handleBotMention called without authenticated user');
    return { success: true, message: 'No authenticated user' };
  }

  // Log message history for analytics (fire and forget)
  const channelType = isDM ? 'DM' : (event.channel?.startsWith('G') ? 'group' : 'channel');
  const categorization = categorizeMessage(cleanText);
  const startTime = Date.now();
  
  void logMessageHistory({
    slackEventId: event.event_id,
    channelId: event.channel || 'unknown',
    channelType,
    timestamp: event.ts || Date.now().toString(),
    slackUserId: event.user || 'unknown',
    systemUserId: user.id,
    userName: user.name,
    rawMessage: text,
    cleanMessage: cleanText,
    messageType: categorization.messageType,
    category: categorization.category,
    intent: categorization.intent,
  });
  
  const logMessageCompletion = (agentUsed?: string, hadError = false, errorMessage?: string) => {
    const responseTime = Date.now() - startTime;
    void logMessageHistory({
      slackEventId: event.event_id,
      channelId: event.channel || 'unknown',
      channelType,
      timestamp: event.ts || Date.now().toString(),
      slackUserId: event.user || 'unknown',
      systemUserId: user.id,
      userName: user.name,
      rawMessage: text,
      cleanMessage: cleanText,
      messageType: categorization.messageType,
      category: categorization.category,
      intent: categorization.intent,
      agentUsed,
      responseTime,
      hadError,
      errorMessage,
    });
  };

  // For DMs, if no text or just greeting, send welcome message
  if (isDM && (!cleanText || cleanText.toLowerCase().match(/^(hi|hello|hey|sup|yo)$/))) {
    const welcomeMessage = `👋 *Hey! I'm Zoe 🔮*

You can chat with me naturally here - no commands needed!

🎯 *Try asking me things like:*
• "What should I work on today?"
• "What goals do I have?"
• "Help me prioritize my tasks"
• "Create a task to review the marketing proposal"
• "What projects am I working on?"
• "Show me my upcoming deadlines"

💬 _Just type your question and I'll help you stay organized and productive!_`;
    
    await sendSlackResponse(
      welcomeMessage,
      event.channel!,
      integrationData,
      event.thread_ts
    );
    logMessageCompletion('welcome');
    return { success: true };
  }

  // Simple command parsing for backwards compatibility
  if (cleanText.toLowerCase().includes('create action') || cleanText.toLowerCase().includes('add task')) {
    const actionTitle = cleanText.replace(/create action|add task/i, '').trim();
    if (actionTitle) {
      await createActionFromSlack(actionTitle, user, event.channel!, integrationData);
      logMessageCompletion('action_creator');
      return { success: true };
    }
  }

  try {
    // Process the request and respond directly (no "thinking" message)
    const response = await chatWithZoeUsingTRPC(cleanText, user, {
      channelId: event.channel!,
      integrationData,
    });
    const formattedResponse = formatResponseForSlack(response);
    
    await sendSlackResponse(
      formattedResponse,
      event.channel!,
      integrationData,
      event.thread_ts
    );
    logMessageCompletion('zoe');
  } catch (error) {
    console.error('Error chatting with Zoe:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    // Send error response
    await sendSlackResponse(
      'Sorry, I hit a snag. Try again or rephrase?',
      event.channel!,
      integrationData,
      event.thread_ts
    );
    logMessageCompletion('zoe', true, errorMessage);
  }

  return { success: true };
}

async function handleExpoCommand(text: string, user: any, responseUrl: string, channelId: string, integrationData: any) {
  const args = text.trim().split(/\s+/);
  const subcommand = args[0]?.toLowerCase();

  switch (subcommand) {
    case 'create':
    case 'add':
      const actionTitle = args.slice(1).join(' ');
      if (actionTitle) {
        await createActionFromSlack(actionTitle, user, channelId, integrationData);
        return {
          response_type: 'in_channel',
          text: `✅ Created action: "${actionTitle}"`
        };
      } else {
        return {
          response_type: 'ephemeral',
          text: 'Please provide a description for the action. Usage: `/expo create [description]`'
        };
      }

    case 'list':
      return await listUserActions(user, responseUrl);

    case 'projects':
      return await listUserProjects(user, responseUrl);

    case 'chat':
      const chatMessage = args.slice(1).join(' ');
      if (chatMessage) {
        // Immediately return acknowledgment and process in background
        void handleDeferredZoeResponse(chatMessage, user, responseUrl, {
          channelId,
          integrationData,
        });
        return {
          response_type: 'ephemeral',
          text: '🔮 Zoe is thinking...'
        };
      } else {
        return {
          response_type: 'ephemeral',
          text: 'Usage: `/expo chat [your message]`'
        };
      }

    case 'help':
      return {
        response_type: 'ephemeral',
        text: `Available commands:
• \`/expo create [description]\` - Create a new action
• \`/expo list\` - List your pending actions
• \`/expo projects\` - List your active projects
• \`/expo chat [message]\` - Chat with Zoe, your AI companion
• \`/expo help\` - Show this help message

*Smart parsing:* Add dates and projects naturally!
• \`/expo create Call John tomorrow\` - due tomorrow
• \`/expo create Review docs today\` - due today
• \`/expo create Fix bug for Acme project\` - linked to "Acme" project
• \`/expo create Send report tomorrow for Sales project\` - both!

You can also mention me (@Exponential) in any channel to chat with Zoe!`
      };

    default:
      return {
        response_type: 'ephemeral',
        text: `Unknown subcommand: ${subcommand}. Use \`/expo help\` for available commands.`
      };
  }
}

async function createActionFromSlack(title: string, user: any, channelId: string, integrationData: any) {
  try {
    // Parse natural language input for dates and project references
    const parsed = await parseActionInput(title, user.id, db);

    // Get action processors for this user (with parsed projectId if found)
    const processors = await ActionProcessorFactory.createProcessors(
      user.id,
      parsed.projectId ?? undefined
    );

    const actionItem = {
      text: parsed.name,
      priority: 'medium' as const,
      context: 'Created from Slack',
      dueDate: parsed.dueDate ?? parsed.scheduledStart ?? undefined,
    };

    for (const processor of processors) {
      await processor.processActionItems([actionItem]);
    }

    // Build confirmation message with parsing details
    let confirmationMessage = `✅ Created action: *${parsed.name}*`;

    const details: string[] = [];
    if (parsed.scheduledStart) {
      const dateStr = parsed.scheduledStart.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric'
      });
      details.push(`📅 Do: ${dateStr}`);
    } else if (parsed.dueDate) {
      const dateStr = parsed.dueDate.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric'
      });
      details.push(`📅 Due: ${dateStr}`);
    }
    if (parsed.parsingMetadata?.matchedProject) {
      details.push(`📁 Project: ${parsed.parsingMetadata.matchedProject.name}`);
    }

    if (details.length > 0) {
      confirmationMessage += '\n' + details.join(' • ');
    }
    confirmationMessage += '\n_Added to your Exponential inbox_';

    await sendSlackResponse(confirmationMessage, channelId, integrationData);

  } catch (error) {
    console.error('❌ Error creating action from Slack:', error);
    await sendSlackResponse(
      `❌ Sorry, I couldn't create that action. Please try again.`,
      channelId,
      integrationData
    );
  }
}

async function listUserActions(user: any, _responseUrl: string) {
  try {
    // Get user's pending actions
    const actions = await db.action.findMany({
      where: {
        createdById: user.id,
        status: {
          in: ['ACTIVE']
        }
      },
      orderBy: {
        id: 'desc'
      },
      take: 10
    });

    if (actions.length === 0) {
      return {
        response_type: 'ephemeral',
        text: '🎉 No pending actions! You\'re all caught up.'
      };
    }

    const actionList = actions.map(action => 
      `• ${action.name} ${action.priority === '1st Priority' ? '🔥' : action.priority === 'Someday Maybe' ? '🔹' : ''}`
    ).join('\n');

    return {
      response_type: 'ephemeral',
      text: `📋 Your pending actions:\n${actionList}\n\n_Visit your <https://exponential.im/home|Exponential> dashboard to manage these actions_`
    };
  } catch (error) {
    console.error('Error listing actions:', error);
    return {
      response_type: 'ephemeral',
      text: '❌ Sorry, I couldn\'t retrieve your actions right now.'
    };
  }
}

async function listUserProjects(user: any, _responseUrl: string) {
  try {
    // Get user's projects
    const projects = await db.project.findMany({
      where: {
        createdById: user.id,
        status: {
          in: ['ACTIVE', 'IN_PROGRESS']
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 15,
      include: {
        actions: {
          where: {
            status: 'ACTIVE'
          },
          select: {
            id: true
          }
        }
      }
    });

    if (projects.length === 0) {
      return {
        response_type: 'ephemeral',
        text: '📁 No active projects found. Create your first project in the Exponential dashboard!'
      };
    }

    const projectList = projects.map(project => {
      const statusEmoji = project.status === 'IN_PROGRESS' ? '🔄' : '📋';
      const priorityEmoji = project.priority === '1st Priority' ? '🔥' : 
                           project.priority === '2nd Priority' ? '⚡' :
                           project.priority === '3rd Priority' ? '📌' : '';
      const actionCount = project.actions.length > 0 ? ` (${project.actions.length} actions)` : '';
      
      return `${statusEmoji} ${project.name}${priorityEmoji}${actionCount}`;
    }).join('\n');

    return {
      response_type: 'ephemeral',
      text: `📁 Your active projects:\n${projectList}\n\n_Visit your <https://exponential.im/projects|Exponential> dashboard to manage these projects_`
    };
  } catch (error) {
    console.error('Error listing projects:', error);
    return {
      response_type: 'ephemeral',
      text: '❌ Sorry, I couldn\'t retrieve your projects right now.'
    };
  }
}

async function handleActionComplete(actionId: string, user: any, responseUrl?: string) {
  try {
    await db.action.update({
      where: {
        id: actionId,
        createdById: user.id
      },
      data: {
        status: 'COMPLETED'
      }
    });

    if (responseUrl) {
      await fetch(responseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          response_type: 'ephemeral',
          text: '✅ Action marked as complete!'
        })
      });
    }
  } catch (error) {
    console.error('Error completing action:', error);
  }
}

async function handleActionSnooze(actionId: string, user: any, responseUrl?: string) {
  try {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    await db.action.update({
      where: {
        id: actionId,
        createdById: user.id
      },
      data: {
        dueDate: tomorrow
      }
    });

    if (responseUrl) {
      await fetch(responseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          response_type: 'ephemeral',
          text: '⏰ Action snoozed until tomorrow!'
        })
      });
    }
  } catch (error) {
    console.error('Error snoozing action:', error);
  }
}

async function sendSlackResponse(text: string, channel: string, integrationData: any, threadTs?: string) {
  try {
    const botToken = integrationData.credentials.BOT_TOKEN;
    if (!botToken) {
      console.error('No bot token available for response');
      return;
    }

    await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel: channel,
        text: text,
        thread_ts: threadTs
      }),
    });
  } catch (error) {
    console.error('Error sending Slack response:', error);
  }
}

async function publishHomeTabView(userId: string, integrationData: any, view: any) {
  try {
    const botToken = integrationData.credentials.BOT_TOKEN;
    if (!botToken) {
      console.error('No bot token available for home tab view');
      return;
    }

    const response = await fetch(`${SLACK_API_BASE}/views.publish`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        user_id: userId,
        view: view
      }),
    });

    const result = await response.json();
    if (!result.ok) {
      console.error('Error publishing home tab view:', result.error);
    } else {
      console.log(`✅ Home tab view published for user ${userId}`);
    }
  } catch (error) {
    console.error('Error publishing home tab view:', error);
  }
}

async function handleAppHomeOpened(event: SlackEvent, user: any, integrationData: any) {
  const userId = event.user;
  if (!userId) {
    console.error('No user ID in app_home_opened event');
    return;
  }

  // Create a simple "Hello World" home tab view
  const homeView = {
    type: 'home',
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: 'Hello World! 👋',
          emoji: true
        }
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: 'Welcome to your Exponential Slack app home tab!'
        }
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: 'You can use the following commands:\n• `/expo help` - Show available commands\n• `/zoe` - Chat with Zoe 🔮\n• `/expo list` - List your actions'
        }
      },
      {
        type: 'divider'
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: '💡 Tip: Try messaging me directly or using slash commands to get started!'
          }
        ]
      }
    ]
  };

  await publishHomeTabView(userId, integrationData, homeView);
}

// Handle GET for webhook verification
export async function GET() {
  return NextResponse.json({ 
    message: 'Slack webhook endpoint is active',
    timestamp: new Date().toISOString()
  });
}// Force deployment Thu Aug  7 11:26:15 CEST 2025
