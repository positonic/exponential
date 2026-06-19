'use client';

import { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react';
import { api } from "~/trpc/react";
import { entitiesToRefresh } from "./manyChatToolRefresh";
import DOMPurify from 'dompurify';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';
import {
  Paper,
  Textarea,
  ScrollArea,
  Avatar,
  Group,
  Text,
  Box,
  ActionIcon,
  Badge,
  Button,
  Anchor,
} from '@mantine/core';
import { IconSend, IconMicrophone, IconMicrophoneOff } from '@tabler/icons-react';
import { useVoiceSession } from '~/lib/voice/useVoiceSession';
import { AgentMessageFeedback } from './agent/AgentMessageFeedback';
import { ToolActivity } from './agent/ToolActivity';
import { ThinkingStatus } from './agent/ThinkingStatus';
import { DraftActionsReviewCard } from './DraftActionsReviewCard';
import { useAgentModal, type ChatMessage, type PageContext, type ToolCall } from '~/providers/AgentModalProvider';
import { useWorkspace } from '~/providers/WorkspaceProvider';
import { trimByTokenBudget } from '~/lib/trim-conversation';

// Module-level constants to avoid re-creation on every render
const VIDEO_PATTERN = /\[Video ([a-zA-Z0-9_-]+)\]/g;
const HTML_PATTERN = /<(table|thead|tbody|tr|td|th|p|div|ul|ol|li|h[1-6]|strong|em|br|a|blockquote|pre|code)[^>]*>/i;

const HTML_SANITIZE_CONFIG = {
  ALLOWED_TAGS: [
    'p', 'div', 'span', 'br', 'a', 'strong', 'em', 'b', 'i', 'u', 's',
    'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'blockquote', 'pre', 'code',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
  ],
  ALLOWED_ATTR: ['href', 'target', 'rel'],
  ALLOW_DATA_ATTR: false,
};

const MARKDOWN_COMPONENTS: Partial<Components> = {
  h1: ({children}) => <Text size="xl" fw={700} mb="sm">{children}</Text>,
  h2: ({children}) => <Text size="lg" fw={600} mt="md" mb="xs">{children}</Text>,
  h3: ({children}) => <Text size="md" fw={500} mt="sm" mb="xs">{children}</Text>,
  h4: ({children}) => <Text size="sm" fw={500} mt="xs" mb={4}>{children}</Text>,
  p: ({children}) => <Text size="sm" mb="xs">{children}</Text>,
  strong: ({children}) => <Text component="span" fw={600}>{children}</Text>,
  em: ({children}) => <Text component="em" size="sm" fs="italic">{children}</Text>,
  ul: ({children}) => <Box component="ul" ml="md" mb="xs">{children}</Box>,
  ol: ({children}) => <Box component="ol" ml="md" mb="xs">{children}</Box>,
  li: ({children}) => <Text component="li" size="sm" mb={4}>{children}</Text>,
  hr: () => <Box component="hr" my="sm" style={{ border: 'none', borderTop: '1px solid var(--color-border-primary)' }} />,
  code: ({children}) => (
    <Text
      component="code"
      style={{
        backgroundColor: 'var(--color-surface-secondary)',
        padding: '2px 4px',
        borderRadius: '4px',
        fontSize: '12px'
      }}
    >
      {children}
    </Text>
  ),
  pre: ({children}) => (
    <Box
      component="pre"
      style={{
        backgroundColor: 'var(--color-surface-secondary)',
        padding: '8px',
        borderRadius: '4px',
        overflow: 'auto',
        fontSize: '12px'
      }}
      mb="xs"
    >
      {children}
    </Box>
  ),
  table: ({children}) => (
    <Box component="table" style={{ width: '100%', borderCollapse: 'collapse', margin: '8px 0', fontSize: '13px' }}>
      {children}
    </Box>
  ),
  thead: ({children}) => (
    <Box component="thead" style={{ borderBottom: '2px solid var(--color-border-primary)' }}>
      {children}
    </Box>
  ),
  tbody: ({children}) => <tbody>{children}</tbody>,
  tr: ({children}) => <Box component="tr">{children}</Box>,
  th: ({children}) => (
    <Box component="th" style={{
      padding: '8px 12px',
      textAlign: 'left' as const,
      fontWeight: 600,
      backgroundColor: 'var(--color-surface-secondary)',
      color: 'var(--color-text-primary)',
    }}>
      {children}
    </Box>
  ),
  td: ({children}) => (
    <Box component="td" style={{
      padding: '8px 12px',
      borderBottom: '1px solid var(--color-border-secondary)',
      color: 'var(--color-text-primary)',
    }}>
      {children}
    </Box>
  ),
  a: ({children, href}) => (
    <a href={href} style={{ color: 'var(--color-brand-primary)', textDecoration: 'none' }} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
};

const TEXT_INPUT_STYLES = {
  input: {
    backgroundColor: 'transparent',
    border: '1px solid var(--color-border-primary)',
    color: 'var(--color-text-primary)',
    paddingRight: '100px',
    fontSize: '16px',
    fontFamily: 'inherit',
    '&:focus': {
      borderColor: 'var(--color-border-focus)',
    },
    '&::placeholder': {
      color: 'var(--color-text-muted)',
    }
  }
} as const;

// Use ChatMessage from provider for consistency
type Message = ChatMessage;

function formatPageContextData(context: PageContext): string {
  const str = (val: unknown, fallback = 'None'): string => {
    if (val == null) return fallback;
    if (typeof val === 'string') return val;
    if (typeof val === 'number' || typeof val === 'boolean') return String(val);
    return JSON.stringify(val);
  };

  switch (context.pageType) {
    case 'goals-list': {
      const count = str(context.data.goalCount, '0');
      const filter = str(context.data.statusFilter, 'active');
      return `  - The user is viewing their Goals list (${count} ${filter} goals shown).
  - To read, reference, or discuss the actual goals, call the \`get-all-goals\` tool. Do NOT ask the user to paste them.`;
    }
    case 'projects-list': {
      const count = str(context.data.projectCount, '0');
      return `  - The user is viewing their Projects list (${count} projects shown).
  - To read, reference, or discuss the actual projects, call the \`get-all-projects\` tool. Do NOT ask the user to paste them.`;
    }
    case 'meetings-list': {
      const count = str(context.data.meetingCount, '0');
      return `  - The user is viewing their Meetings list (${count} meetings shown).
  - To read, reference, or discuss meetings, call the \`get-meeting-transcriptions\` tool (pass includeTranscript: false for a fast title/date list). Do NOT ask the user to paste them.`;
    }
    case 'recording': {
      const d = context.data;
      const rawSummary = str(d.summary, 'No summary');
      const summary = rawSummary.slice(0, 300) + (rawSummary.length > 300 ? '...' : '');
      return `  - Transcription ID: ${str(d.transcriptionId)}
  - Title: ${str(d.title, 'Untitled')}
  - Summary: ${summary}
  - Description: ${str(d.description)}
  - Actions created from this transcript: ${str(d.actionsCount, '0')}
  - Has transcription text: ${d.hasTranscription ? 'Yes' : 'No'}
  - Meeting date: ${d.meetingDate ? new Date(str(d.meetingDate)).toLocaleDateString() : 'Unknown'}
  - Workspace: ${str(d.workspaceName)}`;
    }
    default:
      return Object.entries(context.data)
        .filter(([, value]) => value != null)
        .map(([key, value]) => `  - ${key}: ${str(value)}`)
        .join('\n');
  }
}

// Preprocesses sanitized agent HTML to improve readability:
// 1. Splits long narration paragraphs at action boundaries (":Now ", ":Let ", etc.)
// 2. Wraps narration text preceding structured results in a collapsible <details>
function preprocessAgentHtml(html: string): string {
  // Split long narration paragraphs at agent action boundaries
  // Pattern: colon immediately followed by a new action phrase (agent narration style)
  let processed = html.replace(/<p([^>]*)>([\s\S]{250,}?)<\/p>/gi, (_match, attrs: string, content: string) => {
    const split = content.replace(
      /:(Now |Let |Great|Good|Perfect|Excellent|However, |I |The |Then |First, |Next )/g,
      (_: string, word: string) => `</p><p${attrs}>${word}`
    );
    return `<p${attrs}>${split}</p>`;
  });

  // If structured results (headings) exist, wrap preceding narration in a collapsible
  const headingMatch = processed.match(/<h[1-6][^>]*>/i);
  if (headingMatch?.index !== undefined && headingMatch.index > 80) {
    const thinkingHtml = processed.slice(0, headingMatch.index).trim();
    const resultsHtml = processed.slice(headingMatch.index);
    if (thinkingHtml.length > 100) {
      processed = `<details class="agent-thinking"><summary>View reasoning</summary><div class="agent-thinking-content">${thinkingHtml}</div></details>${resultsHtml}`;
    }
  }

  return processed;
}

// Markdown equivalent of preprocessAgentHtml's paragraph splitting:
// inserts `\n\n` at agent action boundaries so streamed narration renders
// as separate paragraphs instead of one giant <Text>. Keep action-word
// list in sync with preprocessAgentHtml above.
function preprocessAgentMarkdown(content: string): string {
  return content.replace(
    /:(Now |Let |Great|Good|Perfect|Excellent|However, |I |The |Then |First, |Next )/g,
    (_: string, word: string) => `:\n\n${word}`,
  );
}

// Render message content with markdown/video support
function renderMessageContent(content: string, messageType: string) {
  // Handle video links first — reset lastIndex since VIDEO_PATTERN is a global regex
  const hasVideoLinks = VIDEO_PATTERN.test(content);
  VIDEO_PATTERN.lastIndex = 0;

  if (hasVideoLinks) {
    const parts = content.split(VIDEO_PATTERN);
    VIDEO_PATTERN.lastIndex = 0;
    return parts.map((part, index) => {
      if (index % 2 === 1) {
        return (
          <a
            key={index}
            href={`/video/${part}`}
            style={{
              color: 'inherit',
              textDecoration: 'underline'
            }}
          >
            {`Video ${part}`}
          </a>
        );
      }
      return part;
    });
  }

  // Detect HTML content from AI responses (tables, formatted paragraphs, etc.)
  if (messageType === 'ai' && HTML_PATTERN.test(content)) {
    const sanitizedHtml = DOMPurify.sanitize(content, HTML_SANITIZE_CONFIG);
    const processedHtml = preprocessAgentHtml(sanitizedHtml);
    return (
      <div
        className="chat-html-content"
        dangerouslySetInnerHTML={{ __html: processedHtml }}
      />
    );
  }

  // For AI messages, check if content looks like markdown and render accordingly
  if (messageType === 'ai' && (content.includes('###') || content.includes('**') || content.includes('- ') || content.includes('| ') || content.includes('```'))) {
    const processed = preprocessAgentMarkdown(content);
    return (
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={MARKDOWN_COMPONENTS}
      >
        {processed}
      </ReactMarkdown>
    );
  }

  // For regular text, return as-is
  return content;
}

// Memoized message list — isolates message rendering from input state changes
interface MessageListProps {
  messages: ChatMessage[];
  conversationId: string;
  isStreaming: boolean;
}

const MessageList = memo(function MessageList({ messages, conversationId, isStreaming }: MessageListProps) {
  const viewport = useRef<HTMLDivElement>(null);

  const visibleMessages = useMemo(
    () => messages.filter(m => m.type !== 'system'),
    [messages]
  );

  useEffect(() => {
    if (viewport.current) {
      viewport.current.scrollTo({ top: viewport.current.scrollHeight, behavior: 'smooth' });
    }
  }, [messages]);

  return (
    <div className="flex-1 h-full overflow-hidden relative">
      <ScrollArea className="h-full" viewportRef={viewport} p="lg" scrollbars="y">
        <div className="space-y-6">
          {visibleMessages.map((message, index) => (
            <div
              key={message.interactionId ?? `${message.type}-${index}`}
              className={`flex ${message.type === 'human' ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-3 duration-500`}
              style={{ animationDelay: `${index * 50}ms` }}
            >
              {message.type === 'ai' ? (
                <div className="max-w-[85%]">
                  {message.toolCalls && message.toolCalls.length > 0 && (
                    <ToolActivity calls={message.toolCalls} />
                  )}
                  {isStreaming &&
                    index === visibleMessages.length - 1 &&
                    message.content === '' && (
                      <ThinkingStatus
                        toolCalls={message.toolCalls}
                        requestText={
                          [...visibleMessages]
                            .reverse()
                            .find((m) => m.type === 'human')?.content
                        }
                      />
                    )}
                  <div className="text-text-primary text-sm leading-relaxed">
                    {message.marker === 'voice' && (
                      <span title="Spoken via voice mode" aria-label="voice" className="mr-1">🎙</span>
                    )}
                    {renderMessageContent(message.content, message.type)}
                  </div>
                  {message.card?.kind === 'draft-actions' && (
                    <DraftActionsReviewCard transcriptionId={message.card.transcriptionId} />
                  )}
                  {message.interactionId && (
                    <AgentMessageFeedback
                      aiInteractionId={message.interactionId}
                      conversationId={conversationId}
                      agentName={message.agentName}
                    />
                  )}
                </div>
              ) : (
                <Paper
                  p="sm"
                  radius="xl"
                  className="bg-surface-tertiary"
                >
                  <div className="text-text-primary whitespace-pre-wrap text-sm">
                    {message.marker === 'voice' && (
                      <span title="Spoken via voice mode" aria-label="voice" className="mr-1">🎙</span>
                    )}
                    {renderMessageContent(message.content, message.type)}
                  </div>
                </Paper>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
});

interface ManyChatProps {
  initialMessages?: Message[];
  githubSettings?: {
    owner: string;
    repo: string;
    validAssignees: string[];
  };
  buttons?: React.ReactNode[];
  projectId?: string;
  workspaceId?: string;
  initialInput?: string;
  defaultAgentId?: string | null;
}

export default function ManyChat({ initialMessages, githubSettings, buttons, projectId: projectIdProp, workspaceId: workspaceIdProp, initialInput, defaultAgentId }: ManyChatProps) {
  // Get messages, conversationId, and page context from context to persist across navigation
  const { messages, setMessages, conversationId, setConversationId, pageContext, isOpen, pendingPrompt, pendingContext, consumePendingPrompt } = useAgentModal();
  const { workspaceId: urlWorkspaceId } = useWorkspace();
  const workspaceId = workspaceIdProp ?? urlWorkspaceId;
  const utils = api.useUtils();

  // Fetch the user's custom assistant (if configured)
  const { data: customAssistant } = api.assistant.getDefault.useQuery(
    { workspaceId: workspaceId ?? '' },
    { enabled: !!workspaceId }
  );

  // Use prop if provided, otherwise fall back to pageContext (auto-detected from current page)
  const projectId = projectIdProp ?? (pageContext?.data?.projectId as string | undefined);

  // Fetch project's Slack channel config so agent knows which channel to search
  const { data: projectSlackConfig } = api.slack.getChannelConfig.useQuery(
    { projectId: projectId! },
    { enabled: !!projectId }
  );

  // Function to generate initial messages with project context
  const generateInitialMessages = useCallback((projectData?: any, projectActions?: any[], transcriptions?: any[]): Message[] => {
    // Format transcription context
    const transcriptionContext = transcriptions && transcriptions.length > 0 ? `

      📝 RECENT MEETING TRANSCRIPTIONS (${transcriptions.length} meetings):
      ${transcriptions.map(t => {
        const dateStr = t.meetingDate
          ? new Date(t.meetingDate).toLocaleDateString()
          : t.processedAt
            ? new Date(t.processedAt).toLocaleDateString()
            : 'Unknown date';

        let summaryInfo = '';
        if (t.summary) {
          try {
            const summary = JSON.parse(t.summary);
            if (summary.overview) {
              summaryInfo = `\n        Summary: ${summary.overview.slice(0, 200)}${summary.overview.length > 200 ? '...' : ''}`;
            }
            if (summary.action_items?.length) {
              summaryInfo += `\n        Action items discussed: ${summary.action_items.length}`;
            }
          } catch {
            // Summary not JSON, include as-is if short
            if (t.summary.length < 300) {
              summaryInfo = `\n        Summary: ${t.summary}`;
            }
          }
        }

        const actionsFromMeeting = t.actions?.length
          ? `\n        Created actions: ${t.actions.map((a: any) => a.name).join(', ')}`
          : '';

        return `
      ### ${t.title || 'Untitled Meeting'} (${dateStr})${summaryInfo}${actionsFromMeeting}`;
      }).join('\n')}
    ` : '';

    const slackChannelContext = projectSlackConfig?.slackChannel
      ? `
      - Slack Channel: ${projectSlackConfig.slackChannel}${projectSlackConfig.slackChannelId ? ` (ID: ${projectSlackConfig.slackChannelId})` : ''}
      - IMPORTANT: When searching Slack for this project, use channel${projectSlackConfig.slackChannelId ? ` ID "${projectSlackConfig.slackChannelId}"` : ` "${projectSlackConfig.slackChannel}"`} to target the project's dedicated channel`
      : '';

    const projectContext = projectData && projectActions ? `

      📋 CURRENT PROJECT CONTEXT (Authorized User Data Only):
      - Project: ${projectData.name} (ID: ${projectId})
      - Owner: Authenticated user (secure context)
      - Description: ${projectData.description || 'No description'}
      - Status: ${projectData.status}
      - Priority: ${projectData.priority}
      - Progress: ${projectData.progress || 0}%${slackChannelContext}
      - Active Tasks Shown: ${projectActions.length} (use retrieveActionsTool for complete history)
      ${projectActions.length > 0 ?
        projectActions.map(action => `  • ${action.name} (${action.status}, ${action.priority})`).join('\n      ') :
        '  • No active tasks'}
      ${transcriptionContext}
      🎯 ACTIONS REQUIRED:
      - When creating actions: automatically assign to project ID: ${projectId}
      - When asked about tasks: refer to context above or use tools for complete data
      - Always specify project ID in tool calls for security
      - For historical data beyond current context, explicitly use retrieveActionsTool
      - When asked about meetings or transcriptions: refer to the meeting context above${projectSlackConfig?.slackChannel ? `\n      - When asked about Slack or project communications: search in channel${projectSlackConfig.slackChannelId ? ` ID "${projectSlackConfig.slackChannelId}"` : ` "${projectSlackConfig.slackChannel}"`}` : ''}
    ` : '';

    const goalTitle = typeof pageContext?.data?.goalTitle === 'string' ? pageContext.data.goalTitle : '';
    const goalId = typeof pageContext?.data?.goalId === 'number' ? pageContext.data.goalId : null;
    const goalDescription = typeof pageContext?.data?.goalDescription === 'string' ? pageContext.data.goalDescription : '';
    const goalWhy = typeof pageContext?.data?.goalWhy === 'string' ? pageContext.data.goalWhy : '';
    const goalStatus = typeof pageContext?.data?.goalStatus === 'string' ? pageContext.data.goalStatus : '';
    const goalHealth = typeof pageContext?.data?.goalHealth === 'string' ? pageContext.data.goalHealth : '';
    const goalContext = pageContext?.pageType === 'goal' ? `

      🎯 CURRENT GOAL CONTEXT:
      - Goal: ${goalTitle} (ID: ${goalId})
      - Description: ${goalDescription || 'No description'}
      - Why: ${goalWhy || 'Not specified'}
      - Status: ${goalStatus || 'Unknown'}
      - Current health: ${goalHealth || 'no-update'}
      🎯 ACTIONS:
      - When creating actions or outcomes, link to this goal where appropriate
      - When asked about progress, refer to this goal's description and why
      - When posting an Objective update whose health is unclear, default to this Current health so the status badge does not silently change
    ` : '';

    // Extract workspace info from page context for the system prompt
    const wsName = typeof pageContext?.data?.workspaceName === 'string' ? pageContext.data.workspaceName : '';
    const wsId = typeof pageContext?.data?.workspaceId === 'string' ? pageContext.data.workspaceId : '';

    return [
      {
        type: 'system',
        content: `Your name is ${customAssistant?.name ?? 'Zoe'}, an AI companion. You are a coordinator managing a multi-agent conversation.
                  Route user requests to the appropriate specialized agent if necessary.
                  Keep track of the conversation flow between the user and multiple AI agents.

                  🔒 SECURITY & DATA SCOPE:
                  ${wsId ? `- You are operating in workspace context: "${wsName}" (ID: ${wsId})
                  - Only show data from this workspace. Do not reference projects or actions from other workspaces.` : `- You are operating in single-project context only
                  - Only data from the current project is available in context`}
                  - Never reference or access data from other users
                  ${projectId ? `- Current project ID: ${projectId}` : ''}
                  
                  🛠️ TOOL USAGE PROTOCOLS:
                  - ALWAYS report tool failures to user (never fail silently)
                  - Use format: "⚠️ Tool Error: [action] failed - [reason]. Working with available context instead."
                  - Context shows current/recent data only - use tools for historical/complete data
                  - Available tools: createAction, updateAction, retrieveActions, createGitHubIssue, get_project_context, get-meeting-transcriptions, query-meeting-context, get-meeting-insights, firefliesCheckExisting, firefliesTestApiKey, firefliesCreateIntegration, firefliesGenerateWebhookToken, firefliesGetWebhookUrl
                  - For project goals and outcomes: use get_project_context tool with the project ID
                  - If authentication fails, inform user and suggest checking token validity

                  🔧 FIREFLIES INTEGRATION WIZARD:
                  When user wants to connect Fireflies, set up meeting transcription, or asks about Fireflies configuration:

                  1. CHECK EXISTING: First use firefliesCheckExisting tool to see if they already have Fireflies
                     - If exists: Inform them and ask if they want to set up a new integration or configure webhooks

                  2. GUIDE API KEY SETUP: If no integration exists, guide user to get their API key:
                     - Tell them: "To connect Fireflies, you'll need your API key from the Fireflies dashboard"
                     - Provide link: https://app.fireflies.ai/integrations/custom
                     - Wait for them to share the key

                  3. TEST THE KEY: When user provides an API key (long string, often starts with "ff_"):
                     - Use firefliesTestApiKey tool to validate it
                     - CRITICAL: NEVER echo the API key back to the user - this is a security requirement
                     - On success: Proceed to integration creation
                     - On failure: Explain the error and ask them to check the key

                  4. CREATE INTEGRATION: After successful test:
                     - Ask user to name their integration (suggest: "My Fireflies" or their workspace name)
                     - Ask about scope: "Should this be just for you (personal), or available workspace-wide?"
                     - Use firefliesCreateIntegration with the tested key, name, and scope

                  5. WEBHOOK SETUP (after integration created):
                     - Use firefliesGenerateWebhookToken to create a webhook secret
                     - Use firefliesGetWebhookUrl to get the correct webhook URL
                     - Provide CLEAR step-by-step instructions:
                       a. Go to https://app.fireflies.ai/integrations/custom
                       b. Click "Add Webhook" or find the webhook settings
                       c. Enter the webhook URL provided
                       d. Set authentication method to "Signature"
                       e. Use the secret token provided
                       f. Select event: "Transcription completed"
                       g. Save the webhook

                  6. CONFIRMATION: After setup, explain:
                     - New meeting transcriptions will automatically appear in the app
                     - They can test by having a short meeting or triggering a test from Fireflies
                     - Offer to help with anything else

                  📝 TRANSCRIPTION SEARCH (RAG):
                  - The transcription summaries in context show recent meetings - use them for quick reference
                  - For DEEPER questions about meeting content, USE THE SEARCH TOOLS:
                    • "What did we discuss about [topic]?" → use 'query-meeting-context' to search full transcription text
                    • "What decisions were made?" → use 'get-meeting-insights' for structured extraction
                    • "What happened in meeting [name]?" → use 'get-meeting-transcriptions' with filters
                  - ALWAYS search when: user asks about specific topics, quotes, or details not visible in summaries
                  - The search tools access FULL transcription text, not just the summaries shown in context

                  📊 CONTEXT LIMITATIONS:
                  - Project data: Current snapshot only (real-time via tools)
                  - Actions: Active actions shown (use retrieveActionsTool for historical)
                  - Transcriptions: Summaries shown in context (use search tools for full text and specific topics)
                  - For complete datasets or older data, explicitly use tools
                  - Always mention when working with limited context vs complete data
                  
                  ${githubSettings ? `When creating GitHub issues, use repo: "${githubSettings.repo}" and owner: "${githubSettings.owner}". Valid assignees are: ${githubSettings.validAssignees.join(", ")}` : ''}
                  ${projectContext}
                  ${goalContext}
                  ${pageContext ? `
                  📍 CURRENT PAGE CONTEXT:
                  The user is currently viewing this page:
                  - Page: ${pageContext.pageTitle}
                  - Type: ${pageContext.pageType}
                  - Path: ${pageContext.pagePath}
                  ${formatPageContextData(pageContext)}

                  When the user says "this", "the", or refers to content on their current page, they mean the above context.
                  Use this data to understand what the user is looking at right now.
                  ` : ''}
                  The current date is: ${new Date().toISOString().split('T')[0]}`
      },
      {
        type: 'ai',
        agentName: customAssistant?.name ?? 'Zoe',
        content: customAssistant
          ? (projectData
              ? `Hey! I'm ${customAssistant.name}${customAssistant.emoji ? ` ${customAssistant.emoji}` : ''} — your companion for the "${projectData.name}" project.\n\nI know your projects, actions, and goals. Ask me what to focus on, break down a vague idea, or just think through something. You can also tag other agents with @ if you need specialists.\n\nWhat's on your mind?`
              : `Hey! I'm ${customAssistant.name}${customAssistant.emoji ? ` ${customAssistant.emoji}` : ''}\n\nI'm here to help you move forward — whether that's figuring out what to focus on today, breaking down a project, or just thinking something through. Tag other agents with @ if you need a specialist.\n\nWhat's up?`)
          : (projectData
              ? `Hey! I'm Zoe 🔮 — your companion for the "${projectData.name}" project.\n\nI know your projects, actions, and goals. Ask me what to focus on, break down a vague idea, or just think through something. You can also tag other agents with @ if you need specialists.\n\nWhat's on your mind?`
              : `Hey! I'm Zoe 🔮\n\nI'm here to help you move forward — whether that's figuring out what to focus on today, breaking down a project, or just thinking something through. Tag other agents with @ if you need a specialist.\n\nWhat's up?`)
      }
    ];
  }, [projectId, githubSettings, pageContext, customAssistant, projectSlackConfig]);

  const [input, setInput] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [showAgentDropdown, setShowAgentDropdown] = useState(false);
  const [cursorPosition, setCursorPosition] = useState(0);
  const [selectedAgentIndex, setSelectedAgentIndex] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [isStreaming, setIsStreaming] = useState(false);
  const transcribeAudio = api.tools.transcribe.useMutation();
  const chooseAgent = api.mastra.chooseAgent.useMutation();
  // Server-side /api/chat/stream now logs interactions (with full token/cache
  // data) and surfaces the row id back via the meta frame. The previous
  // client-side logInteraction.mutateAsync was removed to fix double-logging.
  const startConversation = api.aiInteraction.startConversation.useMutation();

  // ── Voice mode (live WebRTC speech-to-speech) ──────────────────────
  // A separate, deliberate mode alongside the dictation mic below — that
  // record→transcribe→fill-textarea flow stays untouched.
  const voiceTokenRef = useRef<string | null>(null);
  const createVoiceSession = api.voice.createSession.useMutation();
  const persistVoiceTurn = api.voice.persistTurn.useMutation();

  // The most recent spoken user turn, kept so an assistant turn can be logged as
  // a paired exchange (userMessage + reply latency) to AiInteractionHistory.
  const lastVoiceUserTurnRef = useRef<{ text: string; at: number } | null>(null);

  // A committed voice turn: show it in the thread (marked 🎙) and persist it to
  // the voice-scoped memory thread so the session stays continuous.
  const recordVoiceTurn = useCallback(
    (type: 'human' | 'ai', content: string) => {
      const token = voiceTokenRef.current;

      if (type === 'human') {
        setMessages(prev => [...prev, { type, content, marker: 'voice' }]);
        if (!token) return;
        lastVoiceUserTurnRef.current = { text: content, at: Date.now() };
        persistVoiceTurn.mutate({ token, role: 'user', text: content });
        return;
      }

      // Assistant turn: tag the rendered message with a stable client id so the
      // async-returned interactionId attaches to THIS turn (matching on content
      // would misfire when Zoe repeats a short reply like "Done." in a session).
      const voiceTurnId = crypto.randomUUID();
      setMessages(prev => [...prev, { type, content, marker: 'voice', voiceTurnId }]);
      if (!token) return;

      // Persist + log the paired exchange, then attach the returned interactionId
      // to the tagged message so the rating widget appears for voice too (mirrors
      // the typed-stream meta-frame path).
      const paired = lastVoiceUserTurnRef.current;
      lastVoiceUserTurnRef.current = null;
      persistVoiceTurn
        .mutateAsync({
          token,
          role: 'assistant',
          text: content,
          ...(paired?.text ? { userMessage: paired.text } : {}),
          ...(paired ? { responseTime: Date.now() - paired.at } : {}),
        })
        .then(res => {
          if (!res.interactionId) return;
          setMessages(prev =>
            prev.map(m =>
              m.voiceTurnId === voiceTurnId
                ? { ...m, interactionId: res.interactionId }
                : m,
            ),
          );
        })
        .catch(err => {
          console.error('[ManyChat] voice turn persistence failed:', err);
        });
    },
    [setMessages, persistVoiceTurn],
  );

  const voice = useVoiceSession({
    createSession: async () => {
      // Bind the voice session to the active text-chat conversation so typing
      // and talking share one memory thread (ADR-0006). The server bakes this
      // into the voice-session token as an authoritative claim.
      const res = await createVoiceSession.mutateAsync({
        ...(workspaceId ? { workspaceId } : {}),
        ...(conversationId ? { conversationId } : {}),
      });
      voiceTokenRef.current = res.voiceSessionToken;
      return res;
    },
    onUserTranscript: (text) => recordVoiceTurn('human', text),
    onAssistantTranscript: (text) => recordVoiceTurn('ai', text),
  });
  const voiceActive = voice.state !== 'idle';

  // Release the mic when the drawer closes. ZoeDrawer toggles visibility via
  // CSS and never unmounts ManyChat, so without this the WebRTC session and the
  // live mic keep running invisibly behind a closed drawer. A drawer close is a
  // deliberate end — voice.stop() also clears any "tap to resume" prompt.
  const stopVoice = voice.stop;
  useEffect(() => {
    if (!isOpen && voiceActive) stopVoice();
  }, [isOpen, voiceActive, stopVoice]);

  // Only mint a voice session once the conversation thread exists. The session
  // token pins conversationId for its whole ~30-min TTL, so starting before
  // conversationId is set would bind the entire session to no thread and it
  // could never join the text chat (ADR-0006). conversationId is set on mount
  // (or a fallback id if init fails), so this gate clears within a tick.
  const startVoice = voice.start;
  const canStartVoice = !!conversationId;
  const handleVoiceToggle = useCallback(() => {
    if (voiceActive) {
      stopVoice();
    } else if (canStartVoice) {
      void startVoice();
    }
  }, [voiceActive, canStartVoice, stopVoice, startVoice]);

  // Fetch project context when projectId is provided
  const { data: projectData } = api.project.getById.useQuery(
    { id: projectId! },
    { enabled: !!projectId }
  );
  
  const { data: projectActions } = api.action.getProjectActions.useQuery(
    { projectId: projectId! },
    { enabled: !!projectId }
  );

  // Fetch project transcriptions for agent context
  const { data: projectTranscriptions } = api.transcription.getProjectTranscriptions.useQuery(
    { projectId: projectId! },
    { enabled: !!projectId }
  );

  // Fetch Mastra agents
  const { data: mastraAgents } =
    api.mastra.getMastraAgents.useQuery(
      undefined, // No input needed for this query
      {
        staleTime: 10 * 60 * 1000, // Cache for 10 minutes
        refetchOnWindowFocus: false, // Don't refetch just on focus
      }
    );
  
  // Initialize conversation ID when component mounts
  // Use a ref to prevent duplicate calls during rapid re-renders
  // (useMutation returns a new ref each render, which would retrigger the effect)
  const isInitializingConversation = useRef(false);
  useEffect(() => {
    if (conversationId || isInitializingConversation.current) return;
    isInitializingConversation.current = true;

    const initConversation = async () => {
      try {
        const result = await startConversation.mutateAsync({
          platform: "manychat",
          projectId: projectId,
        });
        setConversationId(result.conversationId);
      } catch (error) {
        console.error("Failed to start conversation:", error);
        // Generate a fallback conversation ID
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 15);
        setConversationId(`conv_fallback_${timestamp}_${random}`);
      } finally {
        isInitializingConversation.current = false;
      }
    };

    void initConversation();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- startConversation is a mutation hook (new ref each render); projectId intentionally excluded to avoid re-init on project switch
  }, [conversationId]);
  
  // Update system message with project/page context when data loads, page changes, or custom assistant loads
  // This preserves conversation history while adding context
  useEffect(() => {
    const hasProjectContext = projectData && projectActions;
    const hasPageContext = !!pageContext;
    const hasCustomAssistant = !!customAssistant;

    if ((hasProjectContext || hasPageContext || hasCustomAssistant) && !initialMessages) {
      // Generate updated system + welcome messages with all available context
      const updatedMessages = generateInitialMessages(
        hasProjectContext ? projectData : undefined,
        hasProjectContext ? projectActions : undefined,
        projectTranscriptions
      );
      const newSystemMessage = updatedMessages[0];
      const newWelcomeMessage = updatedMessages[1];

      if (newSystemMessage) {
        setMessages(prev => {
          // If first message is system, replace it; otherwise prepend
          const withSystem = prev.length > 0 && prev[0]?.type === 'system'
            ? [newSystemMessage, ...prev.slice(1)]
            : [newSystemMessage, ...prev];

          // Also update the welcome message if it's the only AI message (fresh chat)
          if (newWelcomeMessage && withSystem.length === 2 && withSystem[1]?.type === 'ai') {
            return [withSystem[0]!, newWelcomeMessage];
          }
          return withSystem;
        });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- setMessages is stable from context, messages.length would cause infinite loop
  }, [projectData, projectActions, projectTranscriptions, pageContext, customAssistant, initialMessages, generateInitialMessages, conversationId]);
  
  // Parse agent mentions from input
  const parseAgentMention = (text: string): { agentId: string | null; cleanMessage: string } => {
    const mentionRegex = /@(\w+)/;
    const match = text.match(mentionRegex);
    
    if (match && mastraAgents) {
      const mentionedName = match[1];
      const agent = mastraAgents.find(a => a.name.toLowerCase() === mentionedName?.toLowerCase());
      if (agent) {
        return {
          agentId: agent.id,
          cleanMessage: text.replace(mentionRegex, '').trim()
        };
      }
    }
    
    return { agentId: null, cleanMessage: text };
  };

  // Check if cursor is after @ symbol for autocomplete
  const checkForMention = (text: string, position: number): boolean => {
    const beforeCursor = text.substring(0, position);
    const lastAtIndex = beforeCursor.lastIndexOf('@');
    if (lastAtIndex === -1) return false;
    
    const afterAt = beforeCursor.substring(lastAtIndex + 1);
    return !afterAt.includes(' ') && afterAt.length >= 0;
  };

  // Filter agents based on partial mention
  const getFilteredAgentsForMention = (text: string, position: number) => {
    if (!mastraAgents) return [];

    const beforeCursor = text.substring(0, position);
    const lastAtIndex = beforeCursor.lastIndexOf('@');
    if (lastAtIndex === -1) return [];

    const searchTerm = beforeCursor.substring(lastAtIndex + 1).toLowerCase();
    return mastraAgents.filter(agent =>
      agent.name.toLowerCase().startsWith(searchTerm)
    );
  };

  // Cache filtered agents to avoid recomputing on every render
  const filteredAgentsForMention = useMemo(
    () => getFilteredAgentsForMention(input, cursorPosition),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- getFilteredAgentsForMention depends on mastraAgents
    [input, cursorPosition, mastraAgents]
  );

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node) &&
          inputRef.current && !inputRef.current.contains(event.target as Node)) {
        setShowAgentDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle initialInput prop for agent selection from sidebar
  useEffect(() => {
    if (initialInput) {
      setInput(initialInput);
      // Focus the input after setting value
      setTimeout(() => {
        inputRef.current?.focus();
      }, 0);
    }
  }, [initialInput]);

  // Auto-submit when the drawer opens with a pending prompt seeded from
  // another surface (e.g. the home-page Zoe input). Runs once per open.
  const didSeedRef = useRef(false);
  useEffect(() => {
    if (!isOpen) {
      didSeedRef.current = false;
      return;
    }
    if (!pendingPrompt || didSeedRef.current) return;
    didSeedRef.current = true;
    const seeded = pendingPrompt;
    const seededContext = pendingContext ?? undefined;
    consumePendingPrompt();
    // Defer one tick so any mount-phase work settles before we fire the submit.
    setTimeout(() => {
      void handleSubmit(null, seeded, seededContext);
    }, 0);
    // handleSubmit intentionally omitted — it's a stable closure over current state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, pendingPrompt, pendingContext, consumePendingPrompt]);

  // Handle input changes and autocomplete
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    const position = e.target.selectionStart || 0;

    setInput(value);
    setCursorPosition(position);
    setSelectedAgentIndex(0);

    const shouldShowDropdown = checkForMention(value, position);
    setShowAgentDropdown(shouldShowDropdown);
  };

  // Handle keyboard navigation in dropdown + Enter to submit / Shift+Enter for newline
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showAgentDropdown) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedAgentIndex(prev =>
          prev < filteredAgentsForMention.length - 1 ? prev + 1 : 0
        );
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedAgentIndex(prev =>
          prev > 0 ? prev - 1 : filteredAgentsForMention.length - 1
        );
      } else if (e.key === 'Enter' && filteredAgentsForMention.length > 0) {
        e.preventDefault();
        selectAgent(filteredAgentsForMention[selectedAgentIndex]!);
      } else if (e.key === 'Escape') {
        setShowAgentDropdown(false);
      }
      return;
    }

    // Submit on Enter (or Cmd/Ctrl+Enter). Shift+Enter inserts a newline.
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const form = e.currentTarget.closest('form');
      if (form) form.requestSubmit();
    }
  };

  // Handle agent selection from dropdown
  const selectAgent = (agent: { id: string; name: string }) => {
    if (!inputRef.current) return;
    
    const beforeCursor = input.substring(0, cursorPosition);
    const afterCursor = input.substring(cursorPosition);
    const lastAtIndex = beforeCursor.lastIndexOf('@');
    
    if (lastAtIndex !== -1) {
      const newInput = beforeCursor.substring(0, lastAtIndex) + `@${agent.name} ` + afterCursor;
      setInput(newInput);
      setShowAgentDropdown(false);
      
      // Focus back to input
      setTimeout(() => {
        if (inputRef.current) {
          const newPosition = lastAtIndex + agent.name.length + 2;
          inputRef.current.focus();
          inputRef.current.setSelectionRange(newPosition, newPosition);
        }
      }, 0);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
        stream.getTracks().forEach(track => track.stop());
        
        try {
          const reader = new FileReader();
          reader.readAsDataURL(audioBlob);
          reader.onloadend = async () => {
            const base64Audio = typeof reader.result === 'string' 
              ? reader.result.split(',')[1]
              : '';
            if (base64Audio) {
              const result = await transcribeAudio.mutateAsync({ audio: base64Audio });
              if (result.text) {
                setInput(result.text);
              }
            }
          };
        } catch (error) {
          console.error('Transcription error:', error);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error('Error accessing microphone:', err);
      alert('Could not access microphone. Please check your permissions.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const handleMicClick = async () => {
    if (isRecording) {
      stopRecording();
    } else {
      await startRecording();
    }
  };

  const handleSubmit = async (e: React.FormEvent | null, overrideText?: string, extraContext?: string) => {
    e?.preventDefault();
    const text = overrideText ?? input;
    // Voice mode and typed streaming are mutually exclusive on this surface: the
    // typed stream mutates the last AI message in place, which would race with
    // voice transcripts being appended to the same thread. End voice mode to type.
    if (!text.trim() || voiceActive) return;

    const userMessage: Message = { type: 'human', content: text };
    setMessages(prev => [...prev, userMessage]);

    // Parse for agent mentions
    const { agentId: mentionedAgentId, cleanMessage } = parseAgentMention(text);
    const messageToSend = mentionedAgentId ? cleanMessage : text;

    setInput('');
    setShowAgentDropdown(false);

    let targetAgentId: string | undefined;

    try {

      // Security audit logging for agent calls
      console.log('🔒 [SECURITY AUDIT] Agent call initiated:', {
        projectId,
        messageLength: text.length,
        hasMentionedAgent: !!mentionedAgentId,
        timestamp: new Date().toISOString(),
        contextScope: 'single-project-only'
      });
      
      if (mentionedAgentId) {
        // Use the mentioned agent directly
        targetAgentId = mentionedAgentId;
        console.log('🔒 [SECURITY AUDIT] Using mentioned agent:', { agentId: mentionedAgentId });
      } else if (defaultAgentId) {
        // Use the persistently selected agent from dropdown
        targetAgentId = defaultAgentId;
      } else if (customAssistant) {
        // If user has a custom assistant, route to the blank-canvas assistantAgent
        targetAgentId = 'assistantAgent';
        console.log('🤖 [AGENT] Using custom assistant:', { assistantId: customAssistant.id, name: customAssistant.name });
      } else {
        // Fallback to Zoe unless another agent is specifically mentioned
        const zoeAgent = mastraAgents?.find(agent =>
          agent.name.toLowerCase() === 'zoe' ||
          agent.id.toLowerCase() === 'zoeagent'
        );

        if (zoeAgent) {
          targetAgentId = zoeAgent.id;
          console.log('🔮 [AGENT] Defaulting to Zoe:', { agentId: zoeAgent.id });
        } else {
          // Fallback: Use AI to choose if Zoe not found
          console.warn('⚠️ Zoe agent not found, using AI selection');
          const { agentId } = await chooseAgent.mutateAsync({ message: text });
          targetAgentId = agentId;
          console.log('🔮 [AGENT] AI selected agent:', { agentId });
        }
      }
      
      const startTime = Date.now();

      // Get agent name for display — use custom assistant name if active
      const agentName = customAssistant && targetAgentId === 'assistantAgent'
        ? customAssistant.name
        : mastraAgents?.find(a => a.id === targetAgentId)?.name ?? 'Agent';

      // Add empty AI message that will be filled by streaming
      setMessages(prev => [...prev, { type: 'ai', agentName, content: '' }]);
      setIsStreaming(true);

      // Build full conversation history so the agent has context from prior messages
      const coreMessages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [];

      const systemContent = messages.find(m => m.type === 'system')?.content;
      if (systemContent) {
        coreMessages.push({ role: 'system', content: systemContent });
      }

      // Include all prior user/assistant messages (skip system, skip the empty AI placeholder we just added)
      for (const msg of messages) {
        if (msg.type === 'human') {
          coreMessages.push({ role: 'user', content: msg.content });
        } else if (msg.type === 'ai' && msg.content) {
          coreMessages.push({ role: 'assistant', content: msg.content });
        }
      }

      // Add the current user message
      coreMessages.push({ role: 'user', content: messageToSend });

      // Trim by estimated token budget rather than raw message count so a
      // few verbose tool-result turns can't blow past the context window.
      // Mastra memory on the server will surface older turns via semantic
      // recall / lastMessages when the agent actually needs them.
      const HISTORY_TOKEN_BUDGET = 20_000;
      const trimmed = trimByTokenBudget(coreMessages, HISTORY_TOKEN_BUDGET);
      if (trimmed.droppedCount > 0) {
        console.log('✂️ [ManyChat] Trimmed conversation history', {
          droppedCount: trimmed.droppedCount,
          estimatedTokens: trimmed.estimatedTokens,
          budgetTokens: HISTORY_TOKEN_BUDGET,
        });
      }
      coreMessages.splice(0, coreMessages.length, ...trimmed.messages);

      // One-shot context seeded from the calling surface (e.g. the Week in
      // Review "Ask agent to summarize" button). Sent as a system message so
      // the server strips it and re-injects it demoted as [CLIENT CONTEXT] —
      // the right trust level for supplementary activity data. Added after
      // trimming so it can never be dropped by the token budget.
      if (extraContext?.trim()) {
        coreMessages.unshift({ role: 'system', content: extraContext.trim() });
      }

      const streamPayload = {
        messages: coreMessages,
        agentId: targetAgentId,
        assistantId: customAssistant?.id,
        workspaceId,
        projectId,
        conversationId,
        platform: "manychat" as const,
      };

      // Debug: always log what we're sending to Mastra
      console.log('📤 [ManyChat → Mastra] Request payload:', {
        agentId: streamPayload.agentId,
        assistantId: streamPayload.assistantId,
        workspaceId: streamPayload.workspaceId,
        projectId: streamPayload.projectId,
        conversationId: streamPayload.conversationId,
        messageCount: coreMessages.length,
        messages: coreMessages.map(m => ({
          role: m.role,
          contentPreview: m.content.slice(0, 200) + (m.content.length > 200 ? '...' : ''),
        })),
      });

      // Idle-timeout watchdog: abort if no chunk arrives for IDLE_TIMEOUT_MS.
      // Prevents the stuck-isStreaming state when the server stream stalls silently.
      const abortController = new AbortController();
      const IDLE_TIMEOUT_MS = 60_000;
      let idleTimer: ReturnType<typeof setTimeout> | null = null;
      const clearIdleTimer = () => {
        if (idleTimer) {
          clearTimeout(idleTimer);
          idleTimer = null;
        }
      };
      const resetIdleTimer = () => {
        clearIdleTimer();
        idleTimer = setTimeout(() => {
          abortController.abort(new DOMException('stream-idle-timeout', 'AbortError'));
        }, IDLE_TIMEOUT_MS);
      };
      resetIdleTimer();

      const response = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(streamPayload),
        signal: abortController.signal,
      });

      if (!response.ok) {
        clearIdleTimer();
        throw new Error('Stream request failed');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullResponse = '';
      // Server emits a final  __exp_meta__:{...}\n frame carrying
      // { interactionId, modelId } — strip it from rendered text.
      // U+001E is virtually never present in normal AI output.
      const META_RE = /\n?__exp_meta__:([^\n]*)\n?/;
      // Mid-stream __exp_tool__:{...}\n frames carry structured tool-call
      // events (call/result/error). Multiple per stream; only fully
      // terminated frames match. Incomplete tail is stripped separately.
      const TOOL_RE = /\n?__exp_tool__:([^\n]*)\n/g;
      const TOOL_PREFIX = '__exp_tool__:';
      let interactionId: string | undefined;
      // Keyed by tool-call id; rebuilt from scratch each iteration since we
      // re-parse `fullResponse` cumulatively. setMessages overwrites the
      // toolCalls array on every chunk so the UI reflects the latest state.
      const toolCallsById = new Map<string, ToolCall>();

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          resetIdleTimer();

          const chunk = decoder.decode(value, { stream: true });
          fullResponse += chunk;

          // If the meta frame has arrived (possibly mid-chunk), peel it off
          // before rendering so the user never briefly sees the sentinel.
          let displayResponse = fullResponse;
          const metaMatch = META_RE.exec(fullResponse);
          if (metaMatch) {
            displayResponse = fullResponse.slice(0, metaMatch.index);
            try {
              const meta = JSON.parse(metaMatch[1] ?? "") as {
                interactionId?: string;
              };
              if (meta.interactionId) interactionId = meta.interactionId;
            } catch {
              // Frame split across chunks: try again next iteration.
            }
          }
          // Extract every complete tool frame and update the call map.
          // Idempotent: re-parsing the same frame just re-sets the same value.
          displayResponse = displayResponse.replace(TOOL_RE, (_match, json: string) => {
            try {
              const payload = JSON.parse(json) as
                | { phase: 'call'; id: string; name: string; args?: Record<string, unknown> }
                | { phase: 'result'; id: string; name: string }
                | { phase: 'error'; id: string; name: string; msg?: string };
              if (payload.phase === 'call') {
                toolCallsById.set(payload.id, {
                  id: payload.id,
                  name: payload.name,
                  args: payload.args,
                  status: 'running',
                });
              } else if (payload.phase === 'result') {
                const existing = toolCallsById.get(payload.id);
                toolCallsById.set(payload.id, {
                  id: payload.id,
                  name: payload.name,
                  args: existing?.args,
                  status: 'success',
                });
              } else {
                const existing = toolCallsById.get(payload.id);
                toolCallsById.set(payload.id, {
                  id: payload.id,
                  name: payload.name,
                  args: existing?.args,
                  status: 'error',
                  errorMsg: payload.msg,
                });
              }
            } catch {
              // Malformed frame — drop it from the display anyway.
            }
            return '';
          });
          TOOL_RE.lastIndex = 0;

          // Hide a partial frame at the tail (e.g. "...__exp_tool__:{partia")
          // so the sentinel doesn't briefly leak into the bubble.
          const incompleteAt = displayResponse.lastIndexOf(TOOL_PREFIX);
          if (incompleteAt !== -1 && !displayResponse.slice(incompleteAt).includes('\n')) {
            displayResponse = displayResponse.slice(0, incompleteAt).replace(/\n$/, '');
          }

          // Strip zero-width-space keepalives the server emits on
          // non-text chunks (see route.ts). They reset the idle timer
          // above (every reader.read() resets) but must not appear in
          // the rendered text.
          displayResponse = displayResponse.replace(/​/g, '');

          const toolCallsSnapshot = Array.from(toolCallsById.values());

          setMessages(prev => {
            const updated = [...prev];
            const lastMessage = updated[updated.length - 1];
            if (lastMessage && lastMessage.type === 'ai') {
              updated[updated.length - 1] = {
                ...lastMessage,
                content: displayResponse,
                ...(toolCallsSnapshot.length > 0 ? { toolCalls: toolCallsSnapshot } : {}),
              };
            }
            return updated;
          });
        }
      }

      // Final strip: ensure fullResponse used downstream (length checks,
      // emptyResponse logic) excludes the meta sentinel.
      const finalMatch = META_RE.exec(fullResponse);
      if (finalMatch) {
        fullResponse = fullResponse.slice(0, finalMatch.index);
        try {
          const meta = JSON.parse(finalMatch[1] ?? "") as { interactionId?: string };
          interactionId ??= meta.interactionId;
        } catch {
          // Unparseable meta frame — interactionId stays undefined; feedback
          // UI handles missing IDs by not rendering the rating affordance.
        }
      }
      // Strip any remaining __exp_tool__ frames so they don't pollute the
      // log preview or trigger length checks based on metadata bytes.
      TOOL_RE.lastIndex = 0;
      fullResponse = fullResponse.replace(TOOL_RE, '');
      // Also strip server-side zero-width-space keepalives so they don't
      // count toward emptyResponse / length checks.
      fullResponse = fullResponse.replace(/​/g, '');

      clearIdleTimer();
      setIsStreaming(false);

      // Agent writes leave sibling views (each with its own React Query cache)
      // stale until reload. The rule registry maps the tools that just ran to the
      // entities whose mounted views need invalidating (see manyChatToolRefresh /
      // ADR-0023). Procedure-wide (no args) invalidation keeps it robust against
      // arg source/coercion drift and only refetches mounted observers.
      const executedToolNames = Array.from(toolCallsById.values())
        .filter((tc) => tc.status === 'success')
        .map((tc) => tc.name);
      const toRefresh = entitiesToRefresh(executedToolNames, pageContext?.pageType);

      if (toRefresh.has('goalActivity')) {
        // Goal feed + count + the goal itself (for the health badge).
        void utils.goalActivity.getFeed.invalidate();
        void utils.goalActivity.getCount.invalidate();
        void utils.goal.getById.invalidate();
      }
      if (toRefresh.has('action')) {
        // Full canonical Action set, mirroring the hand-written create/update/bulk
        // invalidation sets so create, update, move, and delete refresh every
        // surface (today list, project board, calendar, score widgets).
        void utils.action.getAll.invalidate();
        void utils.action.getToday.invalidate();
        void utils.action.getScheduledByDate.invalidate();
        void utils.action.getScheduledByDateRange.invalidate();
        void utils.action.getProjectActions.invalidate();
        void utils.scoring.getTodayScore.invalidate();
        void utils.scoring.getProductivityStats.invalidate();
      }
      if (toRefresh.has('okr')) {
        // Objective cards, hero stats, the year/period counts, and the
        // create-KR objective picker — the full set the OKR dashboard mounts,
        // so agent-created objectives/KRs and (un)links appear without reload.
        void utils.okr.getByObjective.invalidate();
        void utils.okr.getStats.invalidate();
        void utils.okr.getCountsByYear.invalidate();
        void utils.okr.getAvailableGoals.invalidate();
      }

      const responseTime = Date.now() - startTime;
      // A turn that did tool work but produced no prose is NOT empty —
      // the user sees those calls in the ToolActivity row.
      const isEmptyResponse = fullResponse.trim() === '' && toolCallsById.size === 0;

      // Debug: log what we received back
      console.log('📥 [Mastra → ManyChat] Response:', {
        responseLength: fullResponse.length,
        responsePreview: fullResponse.slice(0, 300) + (fullResponse.length > 300 ? '...' : ''),
        responseTime,
        agentId: targetAgentId,
        isEmpty: isEmptyResponse,
        conversationId,
      });

      // Treat empty response as an error so the user sees a concrete message
      // instead of a blank bubble with a "Rate this response" prompt beneath it.
      if (isEmptyResponse) {
        console.error('[ManyChat] Empty response from agent — stream closed with zero text', {
          conversationId,
          agentId: targetAgentId,
          responseTime,
        });
        const emptyMessage = `⚠️ **No response from the assistant.**\n\nThe agent started but produced no output — this usually means a tool failed silently or the step budget was exhausted. Try rephrasing, or ask again in smaller pieces. Server logs (search \`[chat/stream]\`) have the details.`;
        setMessages(prev => {
          const updated = [...prev];
          const lastMessage = updated[updated.length - 1];
          if (lastMessage && lastMessage.type === 'ai') {
            updated[updated.length - 1] = {
              ...lastMessage,
              content: emptyMessage,
            };
          }
          return updated;
        });
      }

      // The server logs the interaction in /api/chat/stream's onFinish path
      // (with full token + cache + cost data) and surfaces the row's id back
      // via the meta frame parsed above. Attach it to the rendered message
      // so the feedback (thumbs-up/down) flow can target the right row.
      if (interactionId) {
        setMessages(prev => {
          const updated = [...prev];
          const lastMessage = updated[updated.length - 1];
          if (lastMessage && lastMessage.type === 'ai') {
            updated[updated.length - 1] = {
              ...lastMessage,
              interactionId,
            };
          }
          return updated;
        });
      }

    } catch (error) {
      setIsStreaming(false);
      console.error('Chat error:', error);

      // Enhanced error detection and reporting
      let errorMessage = 'Sorry, I encountered an error processing your request.';
      let errorType = 'Unknown';
      
      if (error instanceof Error) {
        const errorText = error.message.toLowerCase();

        // Detect specific error types
        if (error.name === 'AbortError' || errorText.includes('stream-idle-timeout')) {
          errorType = 'Idle Timeout';
          errorMessage = `⏱ **Connection stalled**: The assistant sent no data for 60 seconds and the stream was aborted. The agent is likely stuck on a tool call. Please try again — smaller requests tend to succeed.`;
        } else if (errorText.includes('unauthorized') || errorText.includes('401')) {
          errorType = 'Authentication';
          errorMessage = `🔐 **Authentication Error**: Agent tools are not accessible due to expired or invalid authentication. Please check your API tokens in the /settings/api-keys page. Working with available context only.`;
        } else if (errorText.includes('forbidden') || errorText.includes('403')) {
          errorType = 'Authorization';
          errorMessage = `🚫 **Authorization Error**: Agent doesn't have permission to access the requested data. This might be a security issue. Working with available context only.`;
        } else if (errorText.includes('not found') || errorText.includes('404')) {
          errorType = 'Resource Not Found';
          errorMessage = `📂 **Resource Error**: The requested project or data was not found. This might be a security restriction or the data may not exist. Working with available context only.`;
        } else if (errorText.includes('timeout') || errorText.includes('network') || errorText.includes('failed to fetch') || error.name === 'TypeError') {
          errorType = 'Network';
          errorMessage = `🌐 **Network Error**: The connection to the AI service was interrupted (possibly a timeout). Please try again. Working with available context only.`;
        } else if (errorText.includes('mastra') || errorText.includes('agent')) {
          errorType = 'Agent Communication';
          errorMessage = `🤖 **Agent Error**: Failed to communicate with the AI agent system. The agent service might be unavailable. Working with available context only.`;
        } else {
          errorMessage = `⚠️ **System Error**: ${error.message}. Working with available context only.`;
        }
        
        // Log detailed error info for debugging
        console.error(`[ManyChat] ${errorType} Error:`, {
          message: error.message,
          projectId,
          timestamp: new Date().toISOString(),
          userAgent: navigator.userAgent
        });

        // Note: stream errors are not persisted to aiInteractionHistory.
        // The server's catch block at /api/chat/stream logs them to console;
        // operationally we rely on Sentry/server logs for stream failures.
        // (Client-side log was removed to fix the double-logging bug — it
        // was writing rows without tokenUsage that polluted aggregate stats.)
      }
      
      setMessages(prev => [...prev, { 
        type: 'ai', 
        agentName: 'System Error',
        content: `${errorMessage}\n\n_Error Type: ${errorType}_\n_Time: ${new Date().toLocaleTimeString()}_\n\n**Next Steps:**\n• Try rephrasing your request\n• Check /settings/api-keys page for authentication issues\n• Report persistent issues to support` 
      }]);
    }
  };

  const getInitials = (name = '') => name.split(' ').map(n => n[0]).join('').toUpperCase();

  return (
    <div
      className="relative flex flex-col h-full"
      style={{ fontFamily: 'ui-sans-serif, -apple-system, "system-ui", "Segoe UI", Helvetica, "Apple Color Emoji", Arial, sans-serif, "Segoe UI Emoji", "Segoe UI Symbol"' }}
    >
      {buttons && buttons.length > 0 && (
        <div className="px-4 py-2 border-b border-border-primary">
          <Group justify="flex-end">
            {buttons}
          </Group>
        </div>
      )}

      {/* Messages Area */}
      <MessageList messages={messages} conversationId={conversationId} isStreaming={isStreaming} />
      
      {/* Enhanced Input Area */}
      <div className="flex-shrink-0 bg-surface-primary backdrop-blur-lg border-t border-border-primary p-4">
        {(voiceActive || voice.permissionDenied || voice.lastError || voice.needsResume) && (
          <div className="mb-2">
            {voice.permissionDenied ? (
              <Text size="xs" c="red">
                Microphone access is blocked.{' '}
                <Anchor
                  href="https://support.google.com/chrome/answer/2693767"
                  target="_blank"
                  rel="noopener noreferrer"
                  size="xs"
                >
                  Fix browser permissions
                </Anchor>{' '}
                then click 🎙 again.
              </Text>
            ) : voiceActive ? (
              <Group gap="xs">
                {/* Live-mic indicator: a pulsing filled-red badge shown for the
                    whole lifetime of an active session, gone the moment it ends. */}
                <Badge
                  color="red"
                  variant="filled"
                  className="animate-pulse"
                  aria-label="Microphone is live"
                >
                  ● Mic live · {voice.state}
                </Badge>
                <Button size="compact-xs" variant="subtle" color="red" onClick={() => voice.stop()}>
                  End voice
                </Button>
              </Group>
            ) : voice.needsResume ? (
              // Involuntary end (refresh, network drop, or silence timeout): offer
              // an explicit resume instead of silence. Resuming mints a fresh
              // session on the same conversationId (ADR-0006) — never auto-mic.
              <Group gap="xs">
                <Text size="xs" c="dimmed">Voice ended.</Text>
                <Button
                  size="compact-xs"
                  variant="light"
                  color="blue"
                  disabled={!canStartVoice}
                  onClick={handleVoiceToggle}
                >
                  Tap to resume
                </Button>
              </Group>
            ) : voice.lastError ? (
              <Text size="xs" c="red">{voice.lastError}</Text>
            ) : null}
          </div>
        )}
        <form onSubmit={handleSubmit}>
          <div className="relative">
            <Textarea
              ref={inputRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything"
              radius="md"
              size="lg"
              autosize
              minRows={1}
              maxRows={6}
              styles={TEXT_INPUT_STYLES}
            />
            <div className="absolute right-3 bottom-2 flex items-center gap-2">
              <ActionIcon
                onClick={handleVoiceToggle}
                disabled={!voiceActive && !canStartVoice}
                variant={voiceActive ? "filled" : "subtle"}
                color={voiceActive ? "blue" : undefined}
                size="lg"
                radius="xl"
                title={!voiceActive && !canStartVoice ? "Preparing conversation…" : "Voice mode — talk to zoe"}
                aria-label="Toggle voice mode"
                className={`${voice.state === 'listening' ? "animate-pulse" : "text-text-primary hover:bg-surface-hover"}`}
              >
                🎙
              </ActionIcon>
              <ActionIcon
                onClick={handleMicClick}
                variant={isRecording ? "filled" : "subtle"}
                color={isRecording ? "red" : undefined}
                size="lg"
                radius="xl"
                title="Dictate — fill the message box"
                className={`${isRecording ? "animate-pulse" : "text-text-primary hover:bg-surface-hover"}`}
              >
                {isRecording ? (
                  <IconMicrophoneOff size={18} />
                ) : (
                  <IconMicrophone size={18} />
                )}
              </ActionIcon>
              <ActionIcon
                type="submit"
                variant="subtle"
                size="lg"
                radius="xl"
                disabled={(!input.trim() && !isRecording) || voiceActive}
                className="text-text-primary hover:bg-surface-hover"
              >
                <IconSend size={18} />
              </ActionIcon>
            </div>
            
            {/* Enhanced Agent Autocomplete Dropdown */}
            {showAgentDropdown && (
              <Paper
                ref={dropdownRef}
                className="absolute bottom-full left-0 right-0 mb-2 bg-surface-primary backdrop-blur-lg border border-border-primary rounded-xl shadow-2xl shadow-background-primary/50 overflow-hidden animate-in slide-in-from-bottom-2 duration-200"
                style={{ zIndex: 1000 }}
              >
                <div className="max-h-48 overflow-y-auto">
                  {filteredAgentsForMention.map((agent, index) => (
                    <div
                      key={agent.id}
                      onClick={() => selectAgent(agent)}
                      onMouseEnter={() => setSelectedAgentIndex(index)}
                      className={`flex items-center gap-3 p-3 cursor-pointer transition-all duration-200 ${
                        index === selectedAgentIndex
                          ? 'bg-brand-primary/20 border-l-2 border-brand-primary'
                          : 'hover:bg-surface-hover'
                      }`}
                    >
                      <Avatar size="sm" radius="xl" className="ring-1 ring-border-primary">
                        {getInitials(agent.name)}
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <Text size="sm" fw={500} className="text-text-primary">
                          @{agent.name}
                        </Text>
                      </div>
                      {index === selectedAgentIndex && (
                        <div className="w-2 h-2 bg-brand-primary rounded-full animate-pulse"></div>
                      )}
                    </div>
                  ))}
                  {filteredAgentsForMention.length === 0 && (
                    <div className="p-4 text-center">
                      <Text size="sm" c="dimmed">
                        🔍 No agents found matching your search
                      </Text>
                    </div>
                  )}
                </div>
              </Paper>
            )}
          </div>
        </form>
        
        {/* Typing Indicator */}
        {(isStreaming || chooseAgent.isPending) && (
          <div className="mt-2 flex items-center gap-1">
            <div className="w-1.5 h-1.5 bg-text-muted rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
            <div className="w-1.5 h-1.5 bg-text-muted rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
            <div className="w-1.5 h-1.5 bg-text-muted rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
          </div>
        )}
      </div>

    </div>
  );
} 