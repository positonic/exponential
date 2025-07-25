import { type NextRequest, NextResponse } from 'next/server';
import { createHmac } from 'crypto';
import { db } from '~/server/db';
import { ActionProcessorFactory } from '~/server/services/processors/ActionProcessorFactory';
import { NotificationServiceFactory } from '~/server/services/notifications/NotificationServiceFactory';

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

async function findSlackIntegrationByTeam(teamId: string) {
  try {
    const integration = await db.integration.findFirst({
      where: {
        provider: 'slack',
        status: 'ACTIVE',
        // Look for team_id in credentials
        credentials: {
          some: {
            keyType: 'TEAM_ID',
            key: teamId
          }
        }
      },
      include: {
        user: true,
        credentials: {
          where: {
            keyType: {
              in: ['BOT_TOKEN', 'SIGNING_SECRET', 'USER_TOKEN']
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
      credentials
    };
  } catch (error) {
    console.error('Error finding Slack integration:', error);
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const timestamp = request.headers.get('x-slack-request-timestamp');
    const signature = request.headers.get('x-slack-signature');
    
    console.log('🤖 Slack webhook received:', {
      signature: signature ? 'present' : 'missing',
      timestamp: timestamp ? 'present' : 'missing',
      bodyLength: body.length,
      contentType: request.headers.get('content-type')
    });

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
      console.log('🔗 Slack URL verification challenge received');
      return NextResponse.json({ challenge: payload.challenge });
    }

    // Get team ID from different payload types
    let teamId: string;
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

    // Find the integration for this team
    const integrationData = await findSlackIntegrationByTeam(teamId);
    if (!integrationData) {
      console.error('❌ No Slack integration found for team:', teamId);
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
      console.log('✅ Slack signature verified');
    }

    console.log('✅ Slack webhook verified for user:', {
      userId: integrationData.user.id,
      userEmail: integrationData.user.email,
      teamId: teamId
    });

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
      console.log('📝 Unhandled Slack payload type');
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
  const { event } = payload;
  const { user, integration } = integrationData;

  console.log('🤖 Processing Slack event:', {
    eventType: event.type,
    userId: event.user,
    channel: event.channel
  });

  switch (event.type) {
    case 'message':
      // Only process non-bot messages that mention the bot or are DMs
      if (!event.bot_id && (event.text?.includes(`<@${integration.data?.bot_user_id}>`) || event.channel?.startsWith('D'))) {
        console.log(`💬 Processing message - Channel: ${event.channel}, Is DM: ${event.channel?.startsWith('D')}, Text: "${event.text?.substring(0, 50)}..."`);
        return await handleBotMention(event, user, integrationData);
      }
      break;
    
    case 'app_mention':
      return await handleBotMention(event, user, integrationData);
    
    default:
      console.log(`📝 Unhandled event type: ${event.type}`);
  }

  return { success: true, message: 'Event processed' };
}

async function handleSlashCommand(payload: SlackSlashCommandPayload, integrationData: any) {
  const { command, text, user_id, channel_id, response_url } = payload;
  const { user } = integrationData;

  console.log('⚡ Processing slash command:', {
    command,
    text,
    userId: user_id,
    channel: channel_id
  });

  try {
    switch (command) {
      case '/expo':
      case '/exponential':
        return await handleExpoCommand(text, user, response_url, channel_id, integrationData);
      
      case '/paddy':
      case '/p':
        // Direct shorthand for chatting with Paddy
        if (text.trim()) {
          void handleDeferredPaddyResponse(text, user, response_url);
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
  const { type, actions, user: slackUser } = payload;
  const { user } = integrationData;

  console.log('🎛️ Processing interactive component:', {
    type,
    actionCount: actions?.length || 0,
    userId: slackUser.id
  });

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

async function chatWithPaddy(message: string, user: any): Promise<string> {
  const startTime = Date.now();
  
  try {
    const MASTRA_API_URL = process.env.MASTRA_API_URL;
    if (!MASTRA_API_URL) {
      throw new Error('MASTRA_API_URL not configured');
    }

    console.log(`🤖 [Paddy] Starting chat with message: "${message.substring(0, 50)}..."`);

    // Get available agents with timeout
    console.log('📡 [Paddy] Fetching agents from Mastra...');
    const agentsController = new AbortController();
    const agentsTimeout = setTimeout(() => agentsController.abort(), 10000); // 10s timeout
    
    const agentsResponse = await fetch(`${MASTRA_API_URL}/api/agents`, {
      signal: agentsController.signal
    });
    clearTimeout(agentsTimeout);
    
    if (!agentsResponse.ok) {
      throw new Error(`Failed to fetch agents: ${agentsResponse.status}`);
    }
    const agentsData = await agentsResponse.json();
    console.log(`📋 [Paddy] Found ${Object.keys(agentsData).length} agents`);

    // Choose the best agent for this message
    console.log('🎯 [Paddy] Selecting best agent...');
    const agentId = await chooseAgentForMessage(message, agentsData);
    console.log(`✨ [Paddy] Selected agent: ${agentId}`);

    // Generate system context for the agent
    const systemContext = `You are Paddy, a helpful project manager assistant integrated with Slack. 
The user is ${user.name || 'User'} (ID: ${user.id}).
Current date: ${new Date().toISOString().split('T')[0]}

You can help with:
- Creating and managing tasks/actions
- Discussing projects and priorities  
- General productivity and project management advice
- Answering questions about their work

Keep responses concise and friendly, suitable for Slack chat. Use Slack formatting when helpful (like *bold* or _italic_).

IMPORTANT: Keep responses under 3000 characters due to Slack message limits.`;

    // Call the selected agent with timeout
    console.log('🚀 [Paddy] Calling agent...');
    const generateController = new AbortController();
    const generateTimeout = setTimeout(() => generateController.abort(), 25000); // 25s timeout
    
    const response = await fetch(`${MASTRA_API_URL}/api/agents/${agentId}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: systemContext },
          { role: 'user', content: message }
        ]
      }),
      signal: generateController.signal
    });
    clearTimeout(generateTimeout);

    const responseTime = Date.now() - startTime;
    console.log(`⏱️ [Paddy] Agent response took ${responseTime}ms`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ [Paddy] Agent call failed: ${response.status} - ${errorText}`);
      throw new Error(`Agent call failed: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    const finalResponse = result.text || 'Sorry, I had trouble understanding that. Can you try rephrasing?';
    
    console.log(`✅ [Paddy] Success! Response length: ${finalResponse.length} chars`);
    return finalResponse;

  } catch (error) {
    const totalTime = Date.now() - startTime;
    console.error(`❌ [Paddy] Error after ${totalTime}ms:`, error);
    
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        return 'Sorry, that request took too long to process. Please try a simpler question or try again later.';
      }
      if (error.message.includes('timeout')) {
        return 'The request timed out. Please try asking something simpler or try again in a moment.';
      }
    }
    
    throw error;
  }
}

async function chooseAgentForMessage(message: string, agentsData: any): Promise<string> {
  try {
    // Simple agent selection logic - you can enhance this
    // For now, try to find "Paddy" agent or use the first available agent
    const agentEntries = Object.entries(agentsData);
    
    // Look for Paddy first
    const paddyAgent = agentEntries.find(([id, agent]: [string, any]) => 
      agent.name.toLowerCase().includes('paddy')
    );
    
    if (paddyAgent) {
      return paddyAgent[0];
    }
    
    // Look for project manager agent
    const pmAgent = agentEntries.find(([id, agent]: [string, any]) => 
      agent.name.toLowerCase().includes('project') || 
      agent.instructions?.toLowerCase().includes('project')
    );
    
    if (pmAgent) {
      return pmAgent[0];
    }
    
    // Fallback to first agent
    if (agentEntries.length > 0) {
      return agentEntries[0]![0];
    }
    
    throw new Error('No agents available');
  } catch (error) {
    console.error('Error choosing agent:', error);
    throw error;
  }
}

async function handleDeferredPaddyResponse(message: string, user: any, responseUrl: string) {
  try {
    console.log(`🕐 [Deferred] Starting deferred response for: "${message.substring(0, 50)}..."`);
    
    const paddyResponse = await chatWithPaddy(message, user);
    
    // Send the response back to Slack using the response_url
    await fetch(responseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        response_type: 'in_channel',
        text: paddyResponse
      })
    });
    
    console.log(`✅ [Deferred] Successfully sent deferred response`);
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

  console.log(`🗣️ ${isDM ? 'DM' : 'Mention'} with text:`, cleanText);

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
    // Send immediate "thinking" response
    await sendSlackResponse(
      '🤖 Paddy is thinking... I\'ll respond shortly!',
      event.channel!,
      integrationData,
      event.thread_ts
    );
    
    // Process in background
    const response = await chatWithPaddy(cleanText, user);
    
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
    console.log('🔍 Creating action from Slack:', {
      title,
      userId: user.id,
      userEmail: user.email,
      userName: user.name
    });

    // Get action processors for this user
    const processors = await ActionProcessorFactory.createProcessors(user.id);
    console.log(`📦 Found ${processors.length} processors for user ${user.id}`);
    
    const actionItem = {
      text: title,
      priority: 'medium' as const,
      context: 'Created from Slack',
    };

    let totalCreated = 0;
    for (const processor of processors) {
      console.log(`🔧 Processing with ${processor.name} (${processor.type})`);
      const result = await processor.processActionItems([actionItem]);
      console.log(`📝 Processor result:`, {
        processorName: processor.name,
        success: result.success,
        processedCount: result.processedCount,
        errors: result.errors,
        createdItems: result.createdItems
      });
      totalCreated += result.processedCount;
    }

    // Send confirmation back to Slack
    await sendSlackResponse(
      `✅ Created action: *${title}*\n_Added to your Exponential inbox_`,
      channelId,
      integrationData
    );

    console.log(`✅ Created ${totalCreated} actions from Slack for user ${user.id}`);
  } catch (error) {
    console.error('❌ Error creating action from Slack:', error);
    await sendSlackResponse(
      `❌ Sorry, I couldn't create that action. Please try again.`,
      channelId,
      integrationData
    );
  }
}

async function listUserActions(user: any, responseUrl: string) {
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

async function listUserProjects(user: any, responseUrl: string) {
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

// Handle GET for webhook verification
export async function GET() {
  return NextResponse.json({ 
    message: 'Slack webhook endpoint is active',
    timestamp: new Date().toISOString()
  });
}