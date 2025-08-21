'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from "~/trpc/react";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { 
  Paper, 
  TextInput, 
  Button, 
  ScrollArea, 
  Avatar, 
  Group, 
  Text,
  Box,
  ActionIcon,
  Tooltip
} from '@mantine/core';
import { IconSend, IconMicrophone, IconMicrophoneOff } from '@tabler/icons-react';

interface Message {
    type: 'system' | 'human' | 'ai' | 'tool';
    content: string;
    tool_call_id?: string;
    name?: string; // Used for tool responses
    agentName?: string; // Added: Name of the AI agent sending the message
}

interface ManyChatProps {
  initialMessages?: Message[];
  githubSettings?: {
    owner: string;
    repo: string;
    validAssignees: string[];
  };
  buttons?: React.ReactNode[];
  projectId?: string;
}

export default function ManyChat({ initialMessages, githubSettings, buttons, projectId }: ManyChatProps) {
  // Function to generate initial messages with project context
  const generateInitialMessages = useCallback((projectData?: any, projectActions?: any[]): Message[] => {
    const projectContext = projectData && projectActions ? `
      
      📋 CURRENT PROJECT CONTEXT (Authorized User Data Only):
      - Project: ${projectData.name} (ID: ${projectId})
      - Owner: Authenticated user (secure context)
      - Description: ${projectData.description || 'No description'}
      - Status: ${projectData.status}
      - Priority: ${projectData.priority}
      - Progress: ${projectData.progress || 0}%
      - Active Tasks Shown: ${projectActions.length} (use retrieveActionsTool for complete history)
      ${projectActions.length > 0 ? 
        projectActions.map(action => `  • ${action.name} (${action.status}, ${action.priority})`).join('\n      ') : 
        '  • No active tasks'}
      
      🎯 ACTIONS REQUIRED:
      - When creating actions: automatically assign to project ID: ${projectId}
      - When asked about tasks: refer to context above or use tools for complete data
      - Always specify project ID in tool calls for security
      - For historical data beyond current context, explicitly use retrieveActionsTool
    ` : '';

    return [
      {
        type: 'system',
        content: `Your name is Paddy the project manager. You are a coordinator managing a multi-agent conversation. 
                  Route user requests to the appropriate specialized agent if necessary.
                  Keep track of the conversation flow between the user and multiple AI agents.
                  
                  🔒 SECURITY & DATA SCOPE:
                  - You are operating in single-project context only
                  - Only data from the current project is available in context
                  - Never reference or access data from other projects or users
                  ${projectId ? `- Current project ID: ${projectId}` : ''}
                  
                  🛠️ TOOL USAGE PROTOCOLS:
                  - ALWAYS report tool failures to user (never fail silently)
                  - Use format: "⚠️ Tool Error: [action] failed - [reason]. Working with available context instead."
                  - Context shows current/recent data only - use tools for historical/complete data
                  - Available tools: createAction, updateAction, retrieveActions, createGitHubIssue
                  - If authentication fails, inform user and suggest checking token validity
                  
                  📊 CONTEXT LIMITATIONS:
                  - Project data: Current snapshot only (real-time via tools)
                  - Actions: Active actions shown (use retrieveActionsTool for historical)
                  - For complete datasets or older data, explicitly use tools
                  - Always mention when working with limited context vs complete data
                  
                  ${githubSettings ? `When creating GitHub issues, use repo: "${githubSettings.repo}" and owner: "${githubSettings.owner}". Valid assignees are: ${githubSettings.validAssignees.join(", ")}` : ''}
                  ${projectContext}
                  The current date is: ${new Date().toISOString().split('T')[0]}`
      },
      {
        type: 'ai',
        agentName: 'Paddy',
        content: projectData ? 
          `Hello! I'm Paddy, your project manager. I'll be your default assistant for the "${projectData.name}" project (ID: ${projectId}). \n\nI'm here to help with project management, task coordination, and can connect you with other specialized agents when needed. Just mention them with @ (like @designer or @developer) to speak with them directly.\n\nHow can I help you today?` :
          'Hello! I\'m Paddy, your project manager. I\'ll be your default assistant here. \n\nI can help with project management, task coordination, and can connect you with other specialized agents when needed. Just mention them with @ to speak with them directly.\n\nHow can I help you today?'
      }
    ];
  }, [projectId, githubSettings]);

  const [messages, setMessages] = useState<Message[]>(
    initialMessages ?? generateInitialMessages()
  );
  const [input, setInput] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const viewport = useRef<HTMLDivElement>(null);
  const [agentFilter, setAgentFilter] = useState<string>('');
  const [showAgentDropdown, setShowAgentDropdown] = useState(false);
  const [cursorPosition, setCursorPosition] = useState(0);
  const [selectedAgentIndex, setSelectedAgentIndex] = useState(0);
  const [conversationId, setConversationId] = useState<string>("");
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const transcribeAudio = api.tools.transcribe.useMutation();
  const callAgent = api.mastra.callAgent.useMutation();
  const chooseAgent = api.mastra.chooseAgent.useMutation();
  const logInteraction = api.aiInteraction.logInteraction.useMutation();
  const startConversation = api.aiInteraction.startConversation.useMutation();
  
  // Fetch project context when projectId is provided
  const { data: projectData } = api.project.getById.useQuery(
    { id: projectId! },
    { enabled: !!projectId }
  );
  
  const { data: projectActions } = api.action.getProjectActions.useQuery(
    { projectId: projectId! },
    { enabled: !!projectId }
  );

  // Fetch Mastra agents
  const { data: mastraAgents, isLoading: isLoadingAgents, error: agentsError } = 
    api.mastra.getMastraAgents.useQuery(
      undefined, // No input needed for this query
      {
        staleTime: 10 * 60 * 1000, // Cache for 10 minutes
        refetchOnWindowFocus: false, // Don't refetch just on focus
      }
    );
  console.log("mastraAgents is ", mastraAgents);
  
  // Initialize conversation ID when component mounts
  useEffect(() => {
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
      }
    };
    
    if (!conversationId) {
      void initConversation();
    }
  }, [projectId, startConversation, conversationId]);
  
  // Update messages when project data is loaded - but only if messages are still initial
  useEffect(() => {
    if (projectData && projectActions && !initialMessages && messages.length <= 2) {
      // Only reset messages if we still have just the initial welcome messages
      // Security audit logging
      console.log('🔒 [SECURITY AUDIT] Generating agent context:', {
        projectId: projectData.id,
        projectName: projectData.name,
        actionsCount: projectActions.length,
        timestamp: new Date().toISOString(),
        hasInitialMessages: !!initialMessages,
        contextScope: 'single-project-only',
        currentMessageCount: messages.length
      });
      
      const newMessages = generateInitialMessages(projectData, projectActions);
      setMessages(newMessages);
    }
  }, [projectData, projectActions, initialMessages, generateInitialMessages, messages.length]); // Added missing deps
  
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

  useEffect(() => {
    if (viewport.current) {
      viewport.current.scrollTo({ top: viewport.current.scrollHeight, behavior: 'smooth' });
    }
  }, [messages]);

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

  // Handle input changes and autocomplete
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const position = e.target.selectionStart || 0;
    
    setInput(value);
    setCursorPosition(position);
    setSelectedAgentIndex(0);
    
    const shouldShowDropdown = checkForMention(value, position);
    setShowAgentDropdown(shouldShowDropdown);
  };

  // Handle keyboard navigation in dropdown
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showAgentDropdown) return;
    
    const filteredAgents = getFilteredAgentsForMention(input, cursorPosition);
    
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedAgentIndex(prev => 
        prev < filteredAgents.length - 1 ? prev + 1 : 0
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedAgentIndex(prev => 
        prev > 0 ? prev - 1 : filteredAgents.length - 1
      );
    } else if (e.key === 'Enter' && filteredAgents.length > 0) {
      e.preventDefault();
      selectAgent(filteredAgents[selectedAgentIndex]!);
    } else if (e.key === 'Escape') {
      setShowAgentDropdown(false);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMessage: Message = { type: 'human', content: input };
    setMessages(prev => [...prev, userMessage]);
    
    // Parse for agent mentions
    const { agentId: mentionedAgentId, cleanMessage } = parseAgentMention(input);
    const messageToSend = mentionedAgentId ? cleanMessage : input;
    
    setInput('');
    setShowAgentDropdown(false);

    let targetAgentId: string | undefined;
    
    try {
      
      // Security audit logging for agent calls
      console.log('🔒 [SECURITY AUDIT] Agent call initiated:', {
        projectId,
        messageLength: input.length,
        hasMentionedAgent: !!mentionedAgentId,
        timestamp: new Date().toISOString(),
        contextScope: 'single-project-only'
      });
      
      if (mentionedAgentId) {
        // Use the mentioned agent directly
        targetAgentId = mentionedAgentId;
        console.log('🔒 [SECURITY AUDIT] Using mentioned agent:', { agentId: mentionedAgentId });
      } else {
        // Always default to Paddy the project manager unless another agent is specifically mentioned
        // First, find Paddy's agent ID
        const paddyAgent = mastraAgents?.find(agent => 
          agent.name.toLowerCase() === 'paddy' || 
          agent.name.toLowerCase().includes('project manager') ||
          agent.name.toLowerCase().includes('paddy')
        );
        
        if (paddyAgent) {
          targetAgentId = paddyAgent.id;
          console.log('🔒 [SECURITY AUDIT] Defaulting to Paddy:', { agentId: paddyAgent.id });
        } else {
          // Fallback: Use AI to choose if Paddy not found (shouldn't happen)
          console.warn('⚠️ Paddy agent not found, using AI selection');
          const { agentId } = await chooseAgent.mutateAsync({ message: input });
          targetAgentId = agentId;
          console.log('🔒 [SECURITY AUDIT] AI selected agent:', { agentId });
        }
      }
      
      const startTime = Date.now();
      
      const result = await callAgent.mutateAsync({
        agentId: targetAgentId,
        messages: [
          { role: 'system', content: messages.find(m => m.type === 'system')?.content || '' },
          { role: 'user', content: messageToSend }
        ],
      });

      const responseTime = Date.now() - startTime;
      const aiResponseText = typeof result.response === 'string' 
        ? result.response 
        : JSON.stringify(result.response);

      const aiResponse: Message = {
        type: 'ai', 
        agentName: result.agentName || 'Agent',
        content: aiResponseText
      };
      setMessages(prev => [...prev, aiResponse]);

      // Log the successful interaction
      try {
        await logInteraction.mutateAsync({
          platform: "manychat",
          conversationId: conversationId || undefined,
          userMessage: input,
          cleanMessage: messageToSend !== input ? messageToSend : undefined,
          aiResponse: aiResponseText,
          agentId: targetAgentId,
          agentName: result.agentName || undefined,
          model: "mastra-agents",
          messageType: mentionedAgentId ? "command" : "question",
          responseTime,
          projectId: projectId || undefined,
          toolsUsed: result.toolCalls?.map((tool: any) => tool.name || tool.function?.name).filter(Boolean) || [],
          actionsTaken: result.toolResults?.map((result: any) => ({
            action: result.name || "unknown",
            result: result.success ? "success" : "error",
            data: result.content || result.text,
          })) || [],
          hadError: false,
        });
      } catch (logError) {
        console.warn("Failed to log AI interaction:", logError);
        // Don't throw error to avoid breaking the chat flow
      }

    } catch (error) {
      console.error('Chat error:', error);
      
      // Enhanced error detection and reporting
      let errorMessage = 'Sorry, I encountered an error processing your request.';
      let errorType = 'Unknown';
      
      if (error instanceof Error) {
        const errorText = error.message.toLowerCase();
        
        // Detect specific error types
        if (errorText.includes('unauthorized') || errorText.includes('401')) {
          errorType = 'Authentication';
          errorMessage = `🔐 **Authentication Error**: Agent tools are not accessible due to expired or invalid authentication. Please check your API tokens in the /tokens page. Working with available context only.`;
        } else if (errorText.includes('forbidden') || errorText.includes('403')) {
          errorType = 'Authorization';  
          errorMessage = `🚫 **Authorization Error**: Agent doesn't have permission to access the requested data. This might be a security issue. Working with available context only.`;
        } else if (errorText.includes('not found') || errorText.includes('404')) {
          errorType = 'Resource Not Found';
          errorMessage = `📂 **Resource Error**: The requested project or data was not found. This might be a security restriction or the data may not exist. Working with available context only.`;
        } else if (errorText.includes('timeout') || errorText.includes('network')) {
          errorType = 'Network';
          errorMessage = `🌐 **Network Error**: Agent communication failed due to network issues. Please try again. Working with available context only.`;
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

        // Log the failed interaction
        try {
          await logInteraction.mutateAsync({
            platform: "manychat",
            conversationId: conversationId || undefined,
            userMessage: input,
            cleanMessage: messageToSend !== input ? messageToSend : undefined,
            aiResponse: errorMessage,
            agentId: targetAgentId,
            model: "mastra-agents",
            messageType: mentionedAgentId ? "command" : "question",
            projectId: projectId || undefined,
            hadError: true,
            errorMessage: error.message,
          });
        } catch (logError) {
          console.warn("Failed to log error interaction:", logError);
        }
      }
      
      setMessages(prev => [...prev, { 
        type: 'ai', 
        agentName: 'System Error',
        content: `${errorMessage}\n\n_Error Type: ${errorType}_\n_Time: ${new Date().toLocaleTimeString()}_\n\n**Next Steps:**\n• Try rephrasing your request\n• Check /tokens page for authentication issues\n• Report persistent issues to support` 
      }]);
    }
  };

  const renderMessageContent = (content: string, messageType: string) => {
    // Handle video links first
    const videoPattern = /\[Video ([a-zA-Z0-9_-]+)\]/g;
    const hasVideoLinks = videoPattern.test(content);
    
    if (hasVideoLinks) {
      const parts = content.split(videoPattern);
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

    // For AI messages, check if content looks like markdown and render accordingly
    if (messageType === 'ai' && (content.includes('###') || content.includes('**') || content.includes('- '))) {
      return (
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            h1: ({children}) => <Text size="xl" fw={700} mb="sm">{children}</Text>,
            h2: ({children}) => <Text size="lg" fw={600} mb="sm">{children}</Text>,
            h3: ({children}) => <Text size="md" fw={500} mb="xs">{children}</Text>,
            h4: ({children}) => <Text size="sm" fw={500} mb="xs">{children}</Text>,
            p: ({children}) => <Text size="sm" mb={2}>{children}</Text>,
            strong: ({children}) => <Text component="span" fw={600}>{children}</Text>,
            ul: ({children}) => <Box component="ul" ml="md" mb={2}>{children}</Box>,
            ol: ({children}) => <Box component="ol" ml="md" mb={2}>{children}</Box>,
            li: ({children}) => <Text component="li" size="sm">{children}</Text>,
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
          }}
        >
          {content}
        </ReactMarkdown>
      );
    }

    // For regular text, return as-is
    return content;
  };

  const getInitials = (name = '') => name.split(' ').map(n => n[0]).join('').toUpperCase();

  const renderAgentAvatars = () => {
    if (isLoadingAgents) {
      return (
        <div className="flex gap-3">
          <div className="flex items-center gap-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="w-9 h-9 rounded-full bg-surface-secondary animate-pulse"></div>
            ))}
          </div>
          <div className="flex items-center text-xs text-text-muted animate-pulse">
            Loading agents...
          </div>
        </div>
      );
    }
    if (agentsError) {
      return (
        <div className="flex items-center gap-2 p-3 bg-error-bg border border-error-border rounded-lg">
          <div className="w-2 h-2 bg-brand-error rounded-full"></div>
          <Text size="xs" c="red">Error loading agents</Text>
        </div>
      );
    }
    if (!mastraAgents || mastraAgents.length === 0) {
      return (
        <div className="flex items-center gap-2 p-3 bg-warning-bg border border-warning-border rounded-lg">
          <div className="w-2 h-2 bg-brand-warning rounded-full"></div>
          <Text size="xs" c="yellow">No agents available</Text>
        </div>
      );
    }

    // Filter agents by name or instructions
    const filteredAgents = mastraAgents.filter(agent => {
      const term = agentFilter.trim().toLowerCase();
      if (!term) return true;
      const nameMatch = agent.name.toLowerCase().includes(term);
      const instr = (agent as any).instructions as string | undefined;
      const instructionsMatch = instr?.toLowerCase().includes(term) ?? false;
      return nameMatch || instructionsMatch;
    });
    
    if (filteredAgents.length === 0) {
      return (
        <div className="flex items-center gap-2 p-3 bg-surface-secondary border border-border-primary rounded-lg">
          <div className="w-2 h-2 bg-text-muted rounded-full"></div>
          <Text size="xs" c="dimmed">No agents match &quot;{agentFilter}&quot;</Text>
        </div>
      );
    }

    return (
      <div className="flex flex-wrap gap-3 py-2">
        {filteredAgents.map((agent, index) => (
          <Tooltip 
            key={agent.id} 
            label={
              <div className="p-2">
                <div className="font-semibold text-sm text-secondary">{agent.name}</div>
                <div className="text-xs opacity-75 mt-1 text-secondary">
                  {(agent as any).instructions ? 
                    (agent as any).instructions.slice(0, 100) + '...' : 
                    'AI Agent'
                  }
                </div>
              </div>
            } 
            position="bottom" 
            withArrow
            styles={{
              tooltip: {
                backgroundColor: 'var(--color-background-primary)',
                backdropFilter: 'blur(8px)',
                border: '1px solid var(--color-border-primary)',
                // maxWidth: '200px'
              }
            }}
          >
            <div 
              className="relative group cursor-pointer transform transition-all duration-300 hover:scale-110"
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <Avatar 
                size="md" 
                radius="xl"
                className="ring-2 ring-border-primary transition-all duration-300 group-hover:ring-brand-primary group-hover:shadow-lg group-hover:shadow-brand-primary/25"
                styles={{
                  root: {
                    background: `linear-gradient(135deg, 
                      ${index % 4 === 0 ? 'var(--color-brand-primary), var(--color-brand-info), var(--color-brand-info)' : 
                        index % 4 === 1 ? 'var(--color-brand-primary), var(--color-brand-primary), var(--color-brand-primary)' :
                        index % 4 === 2 ? 'var(--color-brand-error), var(--color-brand-error), var(--color-brand-error)' :
                        'var(--color-brand-success), var(--color-brand-success), var(--color-brand-success)'})`,
                  }
                }}
              >
                {getInitials(agent.name)}
              </Avatar>
              <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-brand-success rounded-full ring-1 ring-background-primary opacity-90"></div>
              <div className="absolute inset-0 rounded-full bg-gradient-to-t from-transparent to-white/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            </div>
          </Tooltip>
        ))}
        
        {/* Agent Count Badge */}
        <div className="flex items-center ml-2">
          <div className="px-2 py-1 bg-brand-primary/20 border border-brand-primary/30 rounded-full">
            <Text size="xs" fw={600} c="blue">
              {filteredAgents.length} online
            </Text>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="relative flex flex-col h-full">
      {/* Enhanced Agent Discovery Header */}
      <div className="bg-surface-secondary backdrop-blur-sm border-b border-border-primary p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-2 h-2 bg-brand-success rounded-full animate-pulse"></div>
          <Text size="sm" fw={600} c="blue">
            Available Agents
          </Text>
        </div>
        <TextInput
          placeholder="🔍 Filter agents by name or skill..."
          size="sm"
          value={agentFilter}
          onChange={e => setAgentFilter(e.currentTarget.value)}
          mb="sm"
          styles={{
            input: {
              backgroundColor: 'var(--color-surface-secondary)',
              border: '1px solid var(--color-border-primary)',
              color: 'var(--color-text-primary)',
              '&:focus': {
                borderColor: 'var(--color-brand-primary)',
                boxShadow: '0 0 0 3px var(--color-brand-primary-opacity)'
              },
              '&::placeholder': {
                color: 'var(--color-text-muted)'
              }
            }
          }}
        />
        <div className="space-y-3">
          <div className="overflow-x-auto">
            {renderAgentAvatars()}
          </div>
          
          {/* Enhanced Agent List */}
          {mastraAgents && mastraAgents.length > 0 && (
            <div className="space-y-2 max-h-32 overflow-y-auto">
              {mastraAgents
                .filter(agent => {
                  const term = agentFilter.trim().toLowerCase();
                  if (!term) return true;
                  const nameMatch = agent.name.toLowerCase().includes(term);
                  const instr = (agent as any).instructions as string | undefined;
                  const instructionsMatch = instr?.toLowerCase().includes(term) ?? false;
                  return nameMatch || instructionsMatch;
                })
                .map((agent, index) => (
                  <div 
                    key={agent.id}
                    className="flex items-center gap-3 p-2 rounded-lg bg-surface-secondary border border-border-primary transition-all duration-200 hover:bg-surface-hover hover:border-brand-primary group"
                    style={{ animationDelay: `${index * 30}ms` }}
                  >
                    <div className="relative">
                      <Avatar 
                        size="xs" 
                        radius="xl"
                        className="ring-1 ring-border-primary group-hover:ring-brand-primary transition-all duration-200"
                        styles={{
                          root: {
                            background: `linear-gradient(135deg, 
                              ${index % 4 === 0 ? 'var(--color-brand-primary), var(--color-brand-info)' : 
                                index % 4 === 1 ? 'var(--color-brand-primary), var(--color-brand-primary)' :
                                index % 4 === 2 ? 'var(--color-brand-error), var(--color-brand-error)' :
                                'var(--color-brand-success), var(--color-brand-success)'})`,
                          }
                        }}
                      >
                        {getInitials(agent.name)}
                      </Avatar>
                      <div className="absolute -bottom-0.5 -right-0.5 w-1.5 h-1.5 bg-brand-success rounded-full ring-1 ring-background-primary"></div>
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Text size="xs" fw={600} className="text-text-primary group-hover:text-brand-primary transition-colors">
                          {agent.name}
                        </Text>
                        <div className="px-1.5 py-0.5 bg-brand-success/20 border border-brand-success/30 rounded text-xs font-medium text-brand-success">
                          online
                        </div>
                      </div>
                      <Text size="xs" c="dimmed" className="truncate mt-0.5">
                        {(agent as any).instructions ? 
                          (agent as any).instructions.slice(0, 60) + '...' : 
                          'AI Agent ready to assist'
                        }
                      </Text>
                    </div>
                    
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Text size="xs" c="blue" fw={500}>
                        @{agent.name.toLowerCase()}
                      </Text>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>
      
      {buttons && buttons.length > 0 && (
        <div className="px-4 py-2 border-b border-gray-700/30">
          <Group justify="flex-end">
            {buttons}
          </Group>
        </div>
      )}
      
      {/* Enhanced Messages Area */}
      <div className="flex-1 h-full overflow-hidden relative">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background-primary/20 to-transparent pointer-events-none"></div>
        <ScrollArea className="h-full" viewportRef={viewport} p="lg" scrollbars="y">
          <div className="space-y-6">
            {messages.filter(message => message.type !== 'system').map((message, index) => (
              <div
                key={index}
                className={`flex ${message.type === 'human' ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-3 duration-500`}
                style={{ animationDelay: `${index * 50}ms` }}
              >
                {message.type === 'ai' ? (
                  <div className="flex items-start gap-3 max-w-[85%] group">
                    <Tooltip 
                      label={message.agentName || 'Agent'} 
                      position="left" 
                      withArrow
                      styles={{
                        tooltip: {
                          backgroundColor: 'var(--color-background-primary)',
                          backdropFilter: 'blur(8px)',
                          border: '1px solid var(--color-border-primary)'
                        }
                      }}
                    >
                      <div className="relative">
                        <Avatar 
                          size="md" 
                          radius="xl" 
                          alt={message.agentName || 'AI'}
                          className="ring-2 ring-brand-primary/20 transition-all duration-300 group-hover:ring-brand-primary/40 group-hover:scale-105"
                          styles={{
                            root: {
                              background: 'linear-gradient(135deg, var(--color-brand-primary) 0%, var(--color-brand-info) 50%, var(--color-brand-info) 100%)',
                            }
                          }}
                        >
                          {getInitials(message.agentName || 'AI')}
                        </Avatar>
                        <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-brand-success rounded-full ring-2 ring-background-primary"></div>
                      </div>
                    </Tooltip>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Text size="xs" fw={500} c="blue">
                          {message.agentName || 'Agent'}
                        </Text>
                        <div className="w-1 h-1 bg-text-muted rounded-full"></div>
                        <Text size="xs" c="dimmed">
                          just now
                        </Text>
                      </div>
                      <Paper
                        p="md"
                        radius="xl"
                        className="bg-surface-secondary backdrop-blur-sm border border-border-primary shadow-lg transition-all duration-300 hover:shadow-xl hover:scale-[1.01]"
                      >
                        <div
                          className="text-text-primary whitespace-pre-wrap text-sm leading-relaxed"
                        >
                          {renderMessageContent(message.content, message.type)}
                        </div>
                      </Paper>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-3 max-w-[85%] group">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-end gap-2 mb-1">
                        <Text size="xs" c="dimmed">
                          just now
                        </Text>
                        <div className="w-1 h-1 bg-text-muted rounded-full"></div>
                        <Text size="xs" fw={500} c="dimmed">
                          You
                        </Text>
                      </div>
                      <Paper
                        p="md"
                        radius="xl"
                        className="bg-brand-primary shadow-lg transition-all duration-300 hover:shadow-xl hover:scale-[1.01] ml-auto"
                      >
                        <div className="text-white whitespace-pre-wrap text-sm leading-relaxed">
                          {renderMessageContent(message.content, message.type)}
                        </div>
                      </Paper>
                    </div>
                    <Tooltip 
                      label="You" 
                      position="right" 
                      withArrow
                      styles={{
                        tooltip: {
                          backgroundColor: 'var(--color-background-primary)',
                          backdropFilter: 'blur(8px)',
                          border: '1px solid var(--color-border-primary)'
                        }
                      }}
                    >
                      <div className="relative">
                        <Avatar 
                          size="md" 
                          radius="xl" 
                          alt="User"
                          className="ring-2 ring-brand-primary/20 transition-all duration-300 group-hover:ring-brand-primary/40 group-hover:scale-105"
                          styles={{
                            root: {
                              background: 'linear-gradient(135deg, var(--color-brand-primary) 0%, var(--color-brand-primary) 50%, var(--color-brand-primary) 100%)',
                            }
                          }}
                        >
                          {getInitials('User')}
                        </Avatar>
                        <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-brand-success rounded-full ring-2 ring-background-primary"></div>
                      </div>
                    </Tooltip>
                  </div>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>
      
      {/* Enhanced Input Area */}
      <div className="flex-shrink-0 bg-surface-primary backdrop-blur-lg border-t border-border-primary p-4">
        <form onSubmit={handleSubmit}>
          <div className="relative">
            <TextInput
              ref={inputRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="💬 Type your message... (Paddy will respond, or use @agent to mention others)"
              radius="xl"
              size="lg"
              styles={{
                input: {
                  backgroundColor: 'var(--color-surface-secondary)',
                  border: '1px solid var(--color-border-primary)',
                  color: 'var(--color-text-primary)',
                  paddingRight: '120px',
                  fontSize: '14px',
                  transition: 'all 0.3s ease',
                  '&:focus': {
                    borderColor: 'var(--color-brand-primary)',
                    boxShadow: '0 0 0 4px var(--color-brand-primary-opacity)',
                    backgroundColor: 'var(--color-surface-primary)'
                  },
                  '&::placeholder': {
                    color: 'var(--color-text-muted)'
                  }
                }
              }}
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
              <ActionIcon
                onClick={handleMicClick}
                variant={isRecording ? "filled" : "subtle"}
                color={isRecording ? "red" : "blue"}
                size="lg"
                radius="xl"
                className={`transition-all duration-300 hover:scale-110 ${isRecording ? "animate-pulse shadow-lg shadow-brand-error/25" : "hover:bg-brand-primary/10"}`}
              >
                {isRecording ? (
                  <IconMicrophoneOff size={18} />
                ) : (
                  <IconMicrophone size={18} />
                )}
              </ActionIcon>
              <Button 
                type="submit" 
                radius="xl"
                size="md"
                variant="gradient"
                gradient={{ from: 'blue', to: 'indigo', deg: 45 }}
                className="transition-all duration-300 hover:scale-105 shadow-lg shadow-brand-primary/25"
                disabled={!input.trim() && !isRecording}
              >
                <IconSend size={16} />
              </Button>
            </div>
            
            {/* Enhanced Agent Autocomplete Dropdown */}
            {showAgentDropdown && (
              <Paper
                ref={dropdownRef}
                className="absolute bottom-full left-0 right-0 mb-2 bg-surface-primary backdrop-blur-lg border border-border-primary rounded-xl shadow-2xl shadow-background-primary/50 overflow-hidden animate-in slide-in-from-bottom-2 duration-200"
                style={{ zIndex: 1000 }}
              >
                <div className="max-h-48 overflow-y-auto">
                  {getFilteredAgentsForMention(input, cursorPosition).map((agent, index) => (
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
                  {getFilteredAgentsForMention(input, cursorPosition).length === 0 && (
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
        
        {/* Typing Indicator Area */}
        <div className="mt-2 h-4 flex items-center">
          {(callAgent.isPending || chooseAgent.isPending) && (
            <div className="flex items-center gap-2 text-xs text-text-muted">
              <div className="flex gap-1">
                <div className="w-1 h-1 bg-brand-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                <div className="w-1 h-1 bg-brand-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                <div className="w-1 h-1 bg-brand-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
              </div>
              <Text size="xs" c="dimmed">AI is thinking...</Text>
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 