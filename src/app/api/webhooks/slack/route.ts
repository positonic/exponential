import { type NextRequest, NextResponse } from 'next/server';
import { createHmac, randomBytes } from 'crypto';
import { db } from '~/server/db';
import { ActionProcessorFactory } from '~/server/services/processors/ActionProcessorFactory';
import { createCallerFactory } from '~/server/api/trpc';
import { appRouter } from '~/server/api/root';

// Slack API client
const SLACK_API_BASE = 'https://slack.com/api';

// Event deduplication cache
const processedEvents = new Map<string, number>();
const EVENT_CACHE_TTL = 60000; // 1 minute

// Clean up old events periodically
setInterval(() => {
  const now = Date.now();
  for (const [eventId, timestamp] of processedEvents.entries()) {
    if (now - timestamp > EVENT_CACHE_TTL) {
      processedEvents.delete(eventId);
    }
  }
}, EVENT_CACHE_TTL);

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
      payload = JSON.parse(body);
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
  
  // Check for duplicate event and mark as processing atomically
  if (event_id) {
    if (processedEvents.has(event_id)) {
      console.log(`⚠️ Duplicate event detected: ${event_id}, skipping`);
      return { success: true, message: 'Duplicate event skipped' };
    }
    // Mark this event as processed IMMEDIATELY to prevent race conditions
    processedEvents.set(event_id, Date.now());
    console.log(`📝 [Event] Processing event ${event_id} for user ${event.user}`);
  }

  // CROSS-EVENT DEDUPLICATION: Prevent same message from being processed via different event types
  // Create a content-based key that's the same regardless of event type (message.im vs app_mention)
  if (event.channel && event.ts && event.user) {
    const contentKey = `msg-${event.channel}-${event.ts}-${event.user}`;
    if (processedEvents.has(contentKey)) {
      console.log(`⚠️ Cross-event duplicate detected: ${contentKey} (event_id: ${event_id}), skipping`);
      return { success: true, message: 'Cross-event duplicate skipped' };
    }
    // Mark this content as processed to prevent duplicate responses
    processedEvents.set(contentKey, Date.now());
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
      
      case '/paddy':
      case '/p':
        // Direct shorthand for chatting with Paddy
        if (text.trim()) {
          void handleDeferredPaddyResponse(text, authenticatedUser, response_url);
          return {
            response_type: 'ephemeral',
            text: '🤖 Paddy is thinking... I\'ll respond shortly!'
          };
        } else {
          return {
            response_type: 'ephemeral',
            text: 'Hi! I\'m Paddy, your AI project manager. What can I help you with today?'
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

async function chatWithPaddyUsingTRPC(message: string, user: any): Promise<string> {
  const startTime = Date.now();
  
  try {
    // Create mock session for server-side tRPC call
    const mockSession = {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        image: user.image,
      },
      expires: new Date(Date.now() + 60 * 60 * 1000).toISOString() // 1 hour
    };

    // Create server-side tRPC caller with authentication context
    const createCaller = createCallerFactory(appRouter);
    const caller = createCaller({
      db,
      session: mockSession,
      headers: new Headers() // Mock headers for server-side call
    });

    // Get available agents
    const mastraAgents = await caller.mastra.getMastraAgents();

    // Find Paddy agent or fallback
    let targetAgentId: string;
    const paddyAgent = mastraAgents.find(agent => 
      agent.name.toLowerCase().includes('paddy') || 
      agent.name.toLowerCase().includes('project manager')
    );
    
    if (paddyAgent) {
      targetAgentId = paddyAgent.id;
    } else if (mastraAgents.length > 0) {
      // Use agent selection if Paddy not found
      const { agentId } = await caller.mastra.chooseAgent({ message });
      targetAgentId = agentId;
    } else {
      throw new Error('No agents available');
    }

    // Generate system context for Slack interaction
    const systemContext = `You are Paddy, a helpful project manager assistant integrated with Slack. 
The user is ${user.name || 'User'} (ID: ${user.id}).
Current date: ${new Date().toISOString().split('T')[0]}

You can help with:
- Creating and managing tasks/actions
- Discussing projects and priorities  
- General productivity and project management advice
- Answering questions about their work
- Accessing meeting transcriptions and project data

Keep responses concise and friendly, suitable for Slack chat. Use Slack formatting when helpful (like *bold* or _italic_).

IMPORTANT: Keep responses under 3000 characters due to Slack message limits.`;

    // Call agent through authenticated tRPC
    const result = await caller.mastra.callAgent({
      agentId: targetAgentId,
      messages: [
        { role: 'system', content: systemContext },
        { role: 'user', content: message }
      ]
    });

    const finalResponse = typeof result.response === 'string' 
      ? result.response 
      : 'Sorry, I had trouble understanding that. Can you try rephrasing?';
    
    return finalResponse;

  } catch (error) {
    const totalTime = Date.now() - startTime;
    console.error(`❌ [Paddy] Error after ${totalTime}ms:`, error);
    
    if (error instanceof Error) {
      if (error.message.toLowerCase().includes('timeout')) {
        return 'The request timed out. Please try asking something simpler or try again in a moment.';
      }
      if (error.message.toLowerCase().includes('unauthorized')) {
        return 'I had trouble accessing some features. Please try a simpler question.';
      }
    }
    
    return 'Sorry, I encountered an error. Please try a simpler question or try again later.';
  }
}


async function handleDeferredPaddyResponse(message: string, user: any, responseUrl: string) {
  try {
    const paddyResponse = await chatWithPaddyUsingTRPC(message, user);
    
    // Send the response back to Slack using the response_url
    await fetch(responseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        response_type: 'in_channel',
        text: paddyResponse
      })
    });
    
  } catch (error) {
    console.error('❌ [Deferred] Error in deferred Paddy response:', error);
    
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
  const messageKey = `${event.channel}-${event.ts}-${user.id}`;
  if (processedEvents.has(messageKey)) {
    console.log(`⚠️ Duplicate message detected: ${messageKey}, skipping`);
    return { success: true };
  }
  // Mark as processed IMMEDIATELY to prevent race conditions
  processedEvents.set(messageKey, Date.now());
  console.log(`📝 [Message] Processing message ${messageKey} for user ${user.id}`);

  // SECURITY: Double-check that user is authenticated before processing any commands
  // This prevents welcome messages from showing to unauthorized users
  if (!user || !user.id) {
    console.error('🚨 [Security] handleBotMention called without authenticated user');
    return { success: true, message: 'No authenticated user' };
  }

  // For DMs, if no text or just greeting, send welcome message
  if (isDM && (!cleanText || cleanText.toLowerCase().match(/^(hi|hello|hey|sup|yo)$/))) {
    await sendSlackResponse(
      'Hello! I\'m Paddy, your AI project manager. You can chat with me naturally here - no commands needed! \n\nTry asking me things like:\n• "What should I work on today?"\n• "What goals do I have?"\n• "Help me prioritize my tasks"\n• "Create a task to review the marketing proposal"',
      event.channel!,
      integrationData,
      event.thread_ts
    );
    return { success: true };
  }

  // Simple command parsing for backwards compatibility
  if (cleanText.toLowerCase().includes('create action') || cleanText.toLowerCase().includes('add task')) {
    const actionTitle = cleanText.replace(/create action|add task/i, '').trim();
    if (actionTitle) {
      await createActionFromSlack(actionTitle, user, event.channel!, integrationData);
      return { success: true };
    }
  }

  try {
    // Process the request and respond directly (no "thinking" message)
    const response = await chatWithPaddyUsingTRPC(cleanText, user);
    
    await sendSlackResponse(
      response,
      event.channel!,
      integrationData,
      event.thread_ts
    );
  } catch (error) {
    console.error('Error chatting with Paddy:', error);
    // Send error response
    await sendSlackResponse(
      'Sorry, I encountered an error. Please try a simpler question or try again later.',
      event.channel!,
      integrationData,
      event.thread_ts
    );
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
        void handleDeferredPaddyResponse(chatMessage, user, responseUrl);
        return {
          response_type: 'ephemeral',
          text: '🤖 Paddy is thinking... I\'ll respond shortly!'
        };
      } else {
        return {
          response_type: 'ephemeral',
          text: 'Please provide a message to chat with Paddy. Usage: `/expo chat [your message]`'
        };
      }

    case 'help':
      return {
        response_type: 'ephemeral',
        text: `Available commands:
• \`/expo create [description]\` - Create a new action
• \`/expo list\` - List your pending actions
• \`/expo projects\` - List your active projects
• \`/expo chat [message]\` - Chat with Paddy, your AI assistant
• \`/expo help\` - Show this help message

You can also mention me (@Exponential) in any channel to chat with Paddy!`
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

    // Get action processors for this user
    const processors = await ActionProcessorFactory.createProcessors(user.id);
    
    const actionItem = {
      text: title,
      priority: 'medium' as const,
      context: 'Created from Slack',
    };

    // let totalCreated = 0;
    for (const processor of processors) {
      await processor.processActionItems([actionItem]);
      // totalCreated += result.processedCount;
    }

    // Send confirmation back to Slack
    await sendSlackResponse(
      `✅ Created action: *${title}*\n_Added to your Exponential inbox_`,
      channelId,
      integrationData
    );

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
          text: 'You can use the following commands:\n• `/expo help` - Show available commands\n• `/paddy` - Chat with Paddy AI\n• `/expo list` - List your actions'
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
}