import { type NextRequest, NextResponse } from 'next/server';
import { api } from '~/trpc/server';
import crypto from 'crypto';
import { db } from '~/server/db';
import { ChatOpenAI } from "@langchain/openai";
import { SystemMessage, AIMessage, HumanMessage, ToolMessage } from "@langchain/core/messages";
import { createActionTools } from "~/server/tools/actionTools";
import { createVideoSearchTool } from "~/server/tools/videoSearchTool";
import { WhatsAppErrorHandlingService, WhatsAppErrorType } from "~/server/services/whatsapp/ErrorHandlingService";
import { circuitBreakers } from "~/server/services/whatsapp/CircuitBreaker";
import { messageQueue } from "~/server/services/whatsapp/MessageQueue";
import { cacheService } from "~/server/services/whatsapp/CacheService";
import { OptimizedQueries } from "~/server/services/whatsapp/OptimizedQueries";
import { WhatsAppPermissionService, WhatsAppPermission } from "~/server/services/whatsapp/PermissionService";
import { WhatsAppSecurityAuditService, SecurityEventType } from "~/server/services/whatsapp/SecurityAuditService";
import type { User } from '@prisma/client';

// WhatsApp webhook verification
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const mode = searchParams.get('hub.mode');
    const token = searchParams.get('hub.verify_token');
    const challenge = searchParams.get('hub.challenge');

    console.log('WhatsApp webhook verification request:', { mode, token, challenge });

    if (mode && token) {
      // Check if mode is 'subscribe' and the token matches
      if (mode === 'subscribe') {
        // Verify the token against stored webhook tokens in database
        const validToken = await db.integrationCredential.findFirst({
          where: {
            key: token,
            keyType: 'WEBHOOK_TOKEN',
            integration: {
              provider: 'whatsapp',
              status: 'ACTIVE'
            }
          }
        });
        
        if (validToken && challenge) {
          console.log('✅ WhatsApp webhook verified successfully');
          return new NextResponse(challenge, { status: 200 });
        }
      }
    }

    console.error('❌ WhatsApp webhook verification failed');
    WhatsAppErrorHandlingService.createErrorResponse(
      WhatsAppErrorType.WEBHOOK_VERIFICATION_FAILED,
      new Error('Invalid webhook verification parameters'),
      { userMessage: `mode: ${mode}, token: ${token}` }
    );
    return new NextResponse('Forbidden', { status: 403 });
  } catch (error) {
    console.error('WhatsApp webhook verification error:', error);
    WhatsAppErrorHandlingService.createErrorResponse(
      WhatsAppErrorType.UNKNOWN_ERROR,
      error,
      { userMessage: 'Webhook verification failed' }
    );
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}

// Handle incoming WhatsApp messages
export async function POST(request: NextRequest) {
  try {
    const bodyText = await request.text();
    const body = JSON.parse(bodyText);
    
    // Check if we should use async processing
    const useAsyncProcessing = process.env.WHATSAPP_ASYNC_PROCESSING === 'true';
    
    // Extract the signature from headers for verification
    const signature = request.headers.get('x-hub-signature-256');
    
    if (!signature) {
      console.error('No signature provided in WhatsApp webhook');
      await WhatsAppSecurityAuditService.logSecurityEvent(
        SecurityEventType.INVALID_API_KEY,
        {
          ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
          userAgent: request.headers.get('user-agent') || 'unknown',
          reason: 'Missing webhook signature',
        },
        'high'
      );
      return new NextResponse('Unauthorized', { status: 401 });
    }

    // Get phone number ID from the webhook data to find the right integration
    const phoneNumberId = body.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id;
    
    if (!phoneNumberId) {
      console.error('No phone number ID in webhook data');
      return new NextResponse('Bad Request', { status: 400 });
    }

    // Get the app secret from the integration credentials
    const config = await api.integration.getWhatsAppConfigByPhoneNumberId({ phoneNumberId });
    
    if (!config) {
      console.error('No WhatsApp configuration found for phone number:', phoneNumberId);
      return new NextResponse('Configuration not found', { status: 404 });
    }

    // Get the app secret (access token) for signature verification
    const accessToken = await db.integrationCredential.findFirst({
      where: {
        integrationId: config.integrationId,
        keyType: 'ACCESS_TOKEN'
      }
    });

    if (!accessToken) {
      console.error('No access token found for integration');
      return new NextResponse('Unauthorized', { status: 401 });
    }

    // Verify the signature
    const expectedSignature = crypto
      .createHmac('sha256', accessToken.key)
      .update(bodyText)
      .digest('hex');
    
    const receivedSignature = signature.replace('sha256=', '');
    
    if (expectedSignature !== receivedSignature) {
      console.error('Invalid webhook signature');
      await WhatsAppSecurityAuditService.logSecurityEvent(
        SecurityEventType.INVALID_API_KEY,
        {
          integrationId: config.integrationId,
          ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
          userAgent: request.headers.get('user-agent') || 'unknown',
          reason: 'Invalid webhook signature',
        },
        'critical'
      );
      return new NextResponse('Unauthorized', { status: 401 });
    }
    
    console.log('WhatsApp webhook received:', JSON.stringify(body, null, 2));

    // WhatsApp sends events in this structure
    if (body.entry && Array.isArray(body.entry)) {
      for (const entry of body.entry) {
        if (entry.changes && Array.isArray(entry.changes)) {
          for (const change of entry.changes) {
            // Handle different types of changes
            if (change.field === 'messages') {
              if (useAsyncProcessing) {
                // Queue for async processing
                await messageQueue.enqueue(config.id, change.value);
              } else {
                // Process synchronously
                await handleIncomingMessage(change.value, config.id, config.integrationId);
              }
            } else if (change.field === 'message_template_status_update') {
              await handleTemplateStatusUpdate(change.value, config.id, config.integrationId);
            } else if (change.field === 'statuses') {
              await handleMessageStatusUpdate(change.value, config.id, config.integrationId);
            }
          }
        }
      }
    }

    // Always return 200 OK to acknowledge receipt
    return new NextResponse('OK', { status: 200 });
  } catch (error) {
    console.error('WhatsApp webhook processing error:', error);
    // Still return 200 to prevent WhatsApp from retrying
    return new NextResponse('OK', { status: 200 });
  }
}

// Handle incoming messages
async function handleIncomingMessage(value: any, configId: string, integrationId: string) {
  try {
    if (!value.messages || !Array.isArray(value.messages)) {
      return;
    }

    const metadata = value.metadata;
    const phoneNumberId = metadata?.phone_number_id;
    
    for (const message of value.messages) {
      console.log(`📱 Incoming WhatsApp message from ${message.from}:`, {
        id: message.id,
        type: message.type,
        timestamp: message.timestamp,
      });

      // Process different message types
      switch (message.type) {
        case 'text':
          await processTextMessage(configId, message);
          break;
        case 'image':
        case 'document':
        case 'audio':
        case 'video':
          await processMediaMessage(configId, message);
          break;
        case 'location':
          await processLocationMessage(configId, message);
          break;
        case 'contacts':
          await processContactMessage(configId, message);
          break;
        default:
          console.log('Unsupported message type:', message.type);
      }

      // Mark message as read
      await markMessageAsRead(integrationId, phoneNumberId, message.id);
    }
  } catch (error) {
    console.error('Error handling incoming message:', error);
  }
}

// Process text messages
async function processTextMessage(configId: string, message: any) {
  try {
    // Validate message first
    const validation = WhatsAppErrorHandlingService.validateMessage(message);
    if (!validation.valid) {
      console.error('Invalid message format:', validation.error);
      return;
    }

    const text = message.text?.body;
    if (!text) return;

    console.log(`Processing text message: "${text}"`);

    // Check for suspicious patterns
    const isSuspicious = await WhatsAppSecurityAuditService.checkSuspiciousPatterns(
      message.from,
      text,
      configId
    );
    
    if (isSuspicious) {
      console.warn(`Suspicious message detected from ${message.from}`);
      await sendWhatsAppMessage(configId, message.from, 
        "Your message has been flagged for security review. Please avoid sharing sensitive information via WhatsApp."
      );
      return;
    }

    // Check rate limiting
    const rateLimitOk = await WhatsAppErrorHandlingService.handleRateLimit(
      message.from,
      configId
    );
    
    if (!rateLimitOk) {
      const fallbackMsg = WhatsAppErrorHandlingService.getFallbackMessage(
        WhatsAppErrorType.RATE_LIMIT_EXCEEDED
      );
      await sendWhatsAppMessage(configId, message.from, fallbackMsg);
      return;
    }

    // Store inbound message in database with retry
    await WhatsAppErrorHandlingService.retryWithBackoff(async () => {
      await api.integration.storeWhatsAppMessage({
        configId,
        messageId: message.id,
        phoneNumber: message.from,
        direction: 'INBOUND',
        messageType: 'TEXT',
        content: { text },
        status: 'RECEIVED',
      });
    });

    // Get user mapping with caching
    const phoneMapping = await OptimizedQueries.getUserMapping(message.from, configId);

    if (!phoneMapping) {
      console.log(`No user mapping found for phone number: ${message.from}`);
      
      // Check if phone number is blocked
      const isBlocked = await WhatsAppSecurityAuditService.isPhoneNumberBlocked(
        message.from,
        configId
      );
      
      if (isBlocked) {
        console.log(`Blocked phone number attempted access: ${message.from}`);
        return; // Silently ignore blocked numbers
      }
      
      // Log unauthorized access
      await WhatsAppSecurityAuditService.logSecurityEvent(
        SecurityEventType.UNAUTHORIZED_ACCESS,
        {
          phoneNumber: message.from,
          configId,
          reason: 'Phone number not registered',
          userMessage: text.substring(0, 100), // Log first 100 chars for context
        },
        'medium'
      );
      
      // Log this as an error for tracking
      WhatsAppErrorHandlingService.createErrorResponse(
        WhatsAppErrorType.CONFIG_NOT_FOUND,
        new Error('User not registered'),
        { 
          phoneNumber: message.from, 
          configId,
          userMessage: text 
        }
      );
      
      await sendWhatsAppMessage(configId, message.from, 
        "Hello! I don't recognize your phone number. Please contact an administrator to register your account."
      );
      return;
    }

    // Get integration details for permission checks
    const config = await db.whatsAppConfig.findUnique({
      where: { id: configId },
      include: { integration: true }
    });

    if (!config) {
      console.error('WhatsApp configuration not found');
      return;
    }

    // Check if user has permission to send/receive messages
    const hasPermission = await WhatsAppPermissionService.checkPermission(
      phoneMapping.userId,
      config.integrationId,
      WhatsAppPermission.RECEIVE_MESSAGES
    );

    if (!hasPermission) {
      console.log(`User ${phoneMapping.userId} does not have permission to receive messages`);
      
      // Log permission denied event
      await WhatsAppSecurityAuditService.logSecurityEvent(
        SecurityEventType.PERMISSION_DENIED,
        {
          phoneNumber: message.from,
          userId: phoneMapping.userId,
          integrationId: config.integrationId,
          configId,
          reason: 'User lacks RECEIVE_MESSAGES permission',
          action: 'receive_message',
        },
        'medium'
      );
      
      await sendWhatsAppMessage(configId, message.from,
        "You don't have permission to use this WhatsApp integration. Please contact your administrator."
      );
      return;
    }

    // Route to AI assistant with circuit breaker
    const aiResponse = await circuitBreakers.aiProcessing.execute(
      async () => processAIMessage(
        phoneMapping.user, 
        text, 
        message.from, 
        configId
      )
    );
    
    // Send AI response back to WhatsApp
    if (aiResponse) {
      await WhatsAppErrorHandlingService.retryWithBackoff(
        async () => sendWhatsAppMessage(configId, message.from, aiResponse),
        2 // Only retry twice for sending messages
      );
    }
  } catch (error) {
    console.error('Error processing text message:', error);
    
    // Log the error with context
    WhatsAppErrorHandlingService.createErrorResponse(
      WhatsAppErrorType.MESSAGE_PROCESSING_FAILED,
      error,
      { 
        phoneNumber: message.from, 
        configId,
        userMessage: message.text?.body 
      }
    );
    
    // Send appropriate fallback message to user
    try {
      const fallbackMsg = WhatsAppErrorHandlingService.getFallbackMessage(
        WhatsAppErrorType.MESSAGE_PROCESSING_FAILED
      );
      await sendWhatsAppMessage(configId, message.from, fallbackMsg);
    } catch (sendError) {
      console.error('Failed to send error message:', sendError);
      // Log this critical failure
      WhatsAppErrorHandlingService.createErrorResponse(
        WhatsAppErrorType.MESSAGE_SEND_FAILED,
        sendError,
        { phoneNumber: message.from, configId }
      );
    }
  }
}

// Process media messages
async function processMediaMessage(configId: string, message: any) {
  try {
    const mediaType = message.type;
    const media = message[mediaType];
    
    console.log(`Processing ${mediaType} message:`, media);

    // Store message in database
    await api.integration.storeWhatsAppMessage({
      configId,
      messageId: message.id,
      phoneNumber: message.from,
      direction: 'INBOUND',
      messageType: mediaType.toUpperCase(),
      content: { 
        mediaId: media.id,
        mimeType: media.mime_type,
        caption: media.caption,
      },
      status: 'RECEIVED',
    });
  } catch (error) {
    console.error('Error processing media message:', error);
  }
}

// Process location messages
async function processLocationMessage(configId: string, message: any) {
  try {
    const location = message.location;
    
    console.log('Processing location message:', location);

    // Store message in database
    await api.integration.storeWhatsAppMessage({
      configId,
      messageId: message.id,
      phoneNumber: message.from,
      direction: 'INBOUND',
      messageType: 'LOCATION',
      content: { 
        latitude: location.latitude,
        longitude: location.longitude,
        name: location.name,
        address: location.address,
      },
      status: 'RECEIVED',
    });
  } catch (error) {
    console.error('Error processing location message:', error);
  }
}

// Process contact messages
async function processContactMessage(configId: string, message: any) {
  try {
    const contacts = message.contacts;
    
    console.log('Processing contact message:', contacts);

    // Store message in database
    await api.integration.storeWhatsAppMessage({
      configId,
      messageId: message.id,
      phoneNumber: message.from,
      direction: 'INBOUND',
      messageType: 'CONTACTS',
      content: { contacts },
      status: 'RECEIVED',
    });
  } catch (error) {
    console.error('Error processing contact message:', error);
  }
}

// Mark message as read
async function markMessageAsRead(integrationId: string, phoneNumberId: string, messageId: string) {
  try {
    // TODO: Implement marking message as read via WhatsApp API
    console.log(`Marking message ${messageId} as read`);
  } catch (error) {
    console.error('Error marking message as read:', error);
  }
}

// Handle template status updates
async function handleTemplateStatusUpdate(value: any, configId: string, integrationId: string) {
  try {
    console.log('Template status update:', value);
    
    // TODO: Update template status in database
  } catch (error) {
    console.error('Error handling template status update:', error);
  }
}

// Handle message status updates (delivery receipts)
async function handleMessageStatusUpdate(value: any, configId: string, integrationId: string) {
  try {
    if (!value.statuses || !Array.isArray(value.statuses)) {
      return;
    }

    for (const status of value.statuses) {
      console.log(`📬 Message status update:`, {
        messageId: status.id,
        status: status.status,
        timestamp: status.timestamp,
        recipient: status.recipient_id,
        errors: status.errors,
      });

      // Update message status in database
      const messageStatus = mapWhatsAppStatus(status.status);
      
      // Store status update
      await api.integration.updateWhatsAppMessageStatus({
        messageId: status.id,
        status: messageStatus,
        statusDetails: {
          timestamp: new Date(parseInt(status.timestamp) * 1000).toISOString(),
          recipient: status.recipient_id,
          errors: status.errors,
        },
      });
    }
  } catch (error) {
    console.error('Error handling message status update:', error);
  }
}

// Map WhatsApp status to our internal status
function mapWhatsAppStatus(whatsappStatus: string): string {
  switch (whatsappStatus) {
    case 'sent':
      return 'SENT';
    case 'delivered':
      return 'DELIVERED';
    case 'read':
      return 'READ';
    case 'failed':
      return 'FAILED';
    default:
      return 'UNKNOWN';
  }
}

// Process AI message
async function processAIMessage(user: User, message: string, phoneNumber: string, configId: string): Promise<string | null> {
  const startTime = Date.now();
  
  try {
    // Get or create conversation history from database
    let history = await getConversationHistory(phoneNumber, configId);
    
    // If no history, add system message
    if (history.length === 0) {
      history.push({
        type: 'system',
        content: `You are a personal assistant who helps manage tasks in our Task Management System. 
                  You never give IDs to the user since those are just for you to keep track of. 
                  When a user asks to create a task and you don't know the project to add it to for sure, clarify with the user.
                  The current date is: ${new Date().toISOString().split('T')[0]}
                  You are communicating via WhatsApp, so keep responses concise and mobile-friendly.`
      });
    }

    // Add user message to history
    history.push({
      type: 'human',
      content: message
    });

    // Create AI model with tools
    const model = new ChatOpenAI({ 
      modelName: process.env.LLM_MODEL || 'gpt-3.5-turbo',
      modelKwargs: { "tool_choice": "auto" }
    });

    // Get user's projects with caching
    const projects = await OptimizedQueries.getUserProjects(user.id);

    // Create tools for this user
    const actionTools = createActionTools({ db, session: { user } });
    const videoSearchTool = await createVideoSearchTool({ db, session: { user } });
    
    const tools = [
      ...Object.values(actionTools),
      videoSearchTool
    ];

    // Bind tools to model
    const modelWithTools = model.bind({ tools });

    // Convert history to Langchain messages
    const messages = history.map(msg => {
      switch (msg.type) {
        case 'system':
          return new SystemMessage(msg.content);
        case 'human':
          return new HumanMessage(msg.content);
        case 'ai':
          return new AIMessage(msg.content);
        case 'tool':
          return new ToolMessage({
            content: msg.content,
            tool_call_id: msg.tool_call_id || '',
            name: msg.name || ''
          });
        default:
          return new HumanMessage(msg.content);
      }
    });

    // Get AI response
    const response = await modelWithTools.invoke(messages);
    
    // Handle tool calls if any
    let finalResponse = response.content as string;
    
    if ('tool_calls' in response && response.tool_calls && response.tool_calls.length > 0) {
      // Process tool calls
      const toolMessages = [];
      
      for (const toolCall of response.tool_calls) {
        const tool = tools.find(t => t.name === toolCall.name);
        if (tool) {
          try {
            const toolResult = await tool.invoke(toolCall.args as any);
            toolMessages.push(new ToolMessage({
              content: typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult),
              tool_call_id: toolCall.id || '',
              name: toolCall.name
            }));
          } catch (error) {
            console.error(`Tool ${toolCall.name} failed:`, error);
            toolMessages.push(new ToolMessage({
              content: `Error: ${error instanceof Error ? error.message : 'Tool execution failed'}`,
              tool_call_id: toolCall.id || '',
              name: toolCall.name
            }));
          }
        }
      }
      
      // Get final response after tool execution
      const finalMessages = [...messages, response, ...toolMessages];
      const finalAIResponse = await model.invoke(finalMessages);
      finalResponse = finalAIResponse.content as string;
    }

    // Add AI response to history
    history.push({
      type: 'ai',
      content: finalResponse
    });

    // Save conversation history to database
    await saveConversationHistory(phoneNumber, configId, history, user.id);

    // Store AI interaction for analytics
    try {
      await db.aiInteractionHistory.create({
        data: {
          platform: 'whatsapp',
          sourceId: configId,
          systemUserId: user.id,
          externalUserId: phoneNumber,
          userName: user.name,
          userMessage: message,
          cleanMessage: message,
          aiResponse: finalResponse,
          agentName: 'Paddy AI',
          model: process.env.LLM_MODEL || 'gpt-3.5-turbo',
          conversationId: `whatsapp-${phoneNumber}-${configId}`,
          messageType: 'message',
          category: 'general', // Could be enhanced with intent classification
          responseTime: Date.now() - startTime,
          hadError: false,
          toolsUsed: 'tool_calls' in response && response.tool_calls ? response.tool_calls.map(tc => tc.name) : []
        }
      });
    } catch (error) {
      console.error('Failed to store AI interaction history:', error);
    }

    return finalResponse;
  } catch (error) {
    console.error('Error processing AI message:', error);
    
    // Log AI processing error
    WhatsAppErrorHandlingService.createErrorResponse(
      WhatsAppErrorType.AI_PROCESSING_FAILED,
      error,
      { 
        phoneNumber, 
        userId: user.id,
        configId,
        userMessage: message,
        responseTime: Date.now() - startTime
      }
    );
    
    // Determine appropriate fallback based on error type
    let fallbackType = WhatsAppErrorType.AI_PROCESSING_FAILED;
    
    if (error instanceof Error) {
      if (error.message.includes('rate limit') || error.message.includes('429')) {
        fallbackType = WhatsAppErrorType.RATE_LIMIT_EXCEEDED;
      } else if (error.message.includes('database') || error.message.includes('prisma')) {
        fallbackType = WhatsAppErrorType.DATABASE_ERROR;
      }
    }
    
    return WhatsAppErrorHandlingService.getFallbackMessage(fallbackType);
  }
}

// Send WhatsApp message with circuit breaker
async function sendWhatsAppMessage(configId: string, to: string, message: string): Promise<void> {
  return circuitBreakers.whatsappApi.execute(async () => {
    try {
    // Get WhatsApp config
    const config = await db.whatsAppConfig.findUnique({
      where: { id: configId },
      include: {
        integration: {
          include: {
            credentials: true
          }
        }
      }
    });

    if (!config) {
      throw new Error('WhatsApp configuration not found');
    }

    // Get access token
    const accessToken = config.integration.credentials.find(c => c.keyType === 'ACCESS_TOKEN');
    if (!accessToken) {
      throw new Error('Access token not found');
    }

    // Send message via WhatsApp API
    const response = await fetch(
      `https://graph.facebook.com/v18.0/${config.phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: to,
          type: 'text',
          text: {
            preview_url: true,
            body: message,
          },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to send WhatsApp message');
    }

    const data = await response.json();
    
    // Store outbound message
    if (data.messages?.[0]?.id) {
      await api.integration.storeWhatsAppMessage({
        configId,
        messageId: data.messages[0].id,
        phoneNumber: to,
        direction: 'OUTBOUND',
        messageType: 'TEXT',
        content: { text: message },
        status: 'SENT',
      });
    }
    } catch (error) {
      console.error('Failed to send WhatsApp message:', error);
      throw error;
    }
  });
}

// Get conversation history with caching
async function getConversationHistory(phoneNumber: string, configId: string): Promise<any[]> {
  try {
    const conversation = await OptimizedQueries.getConversation(phoneNumber, configId);

    if (!conversation || !conversation.messages) {
      return [];
    }

    // Check if conversation is stale (older than 24 hours)
    const hoursSinceLastMessage = (Date.now() - conversation.lastMessageAt.getTime()) / (1000 * 60 * 60);
    if (hoursSinceLastMessage > 24) {
      // Start fresh conversation after 24 hours of inactivity
      return [];
    }

    // Parse messages from JSON
    const messages = conversation.messages as any[];
    return messages;
  } catch (error) {
    console.error('Error getting conversation history:', error);
    return [];
  }
}

// Save conversation history to database
async function saveConversationHistory(
  phoneNumber: string, 
  configId: string, 
  history: any[],
  userId?: string
): Promise<void> {
  try {
    // Keep only last 50 messages
    const trimmedHistory = history.slice(-50);

    await db.whatsAppConversation.upsert({
      where: {
        phoneNumber_whatsappConfigId: {
          phoneNumber,
          whatsappConfigId: configId
        }
      },
      update: {
        messages: trimmedHistory,
        lastMessageAt: new Date(),
        messageCount: trimmedHistory.length,
        userId: userId || undefined
      },
      create: {
        phoneNumber,
        whatsappConfigId: configId,
        userId: userId || undefined,
        messages: trimmedHistory,
        messageCount: trimmedHistory.length
      }
    });
    
    // Clear conversation cache after update
    OptimizedQueries.clearUserCache(phoneNumber, configId);
  } catch (error) {
    console.error('Error saving conversation history:', error);
  }
}

