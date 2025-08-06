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
  Tooltip,
  Skeleton
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
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const transcribeAudio = api.tools.transcribe.useMutation();
  const callAgent = api.mastra.callAgent.useMutation();
  const chooseAgent = api.mastra.chooseAgent.useMutation();
  
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

    try {
      let targetAgentId: string;
      
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
      
      const result = await callAgent.mutateAsync({
        agentId: targetAgentId,
        messages: [
          { role: 'system', content: messages.find(m => m.type === 'system')?.content || '' },
          { role: 'user', content: messageToSend }
        ],
      });

      const aiResponse: Message = {
        type: 'ai', 
        agentName: result.agentName || 'Agent',
        content: typeof result.response === 'string' 
          ? result.response 
          : JSON.stringify(result.response)
      };
      setMessages(prev => [...prev, aiResponse]);

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
            p: ({children}) => <Text size="sm" mb="xs">{children}</Text>,
            strong: ({children}) => <Text component="span" fw={600}>{children}</Text>,
            ul: ({children}) => <Box component="ul" ml="md" mb="xs">{children}</Box>,
            ol: ({children}) => <Box component="ol" ml="md" mb="xs">{children}</Box>,
            li: ({children}) => <Text component="li" size="sm">{children}</Text>,
            code: ({children}) => (
              <Text 
                component="code" 
                style={{ 
                  backgroundColor: '#2C2E33', 
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
                  backgroundColor: '#2C2E33', 
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
        <Group wrap="nowrap">
          <Skeleton height={36} circle />
          <Skeleton height={36} circle />
          <Skeleton height={36} circle />
        </Group>
      );
    }
    if (agentsError) {
      return <Text size="xs" c="red">Error loading agents</Text>;
    }
    if (!mastraAgents || mastraAgents.length === 0) {
      return <Text size="xs" c="dimmed">No agents available</Text>;
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
      return <Text size="xs" c="dimmed">No agents match &quot;{agentFilter}&quot;</Text>;
    }

    return (
      <Group wrap="nowrap" style={{ gap: '0.5rem' }}>
        {filteredAgents.map(agent => (
          <Tooltip key={agent.id} label={agent.name} position="bottom" withArrow>
            <Avatar 
              size="md" 
              radius="xl"
            >
              {getInitials(agent.name)}
            </Avatar>
          </Tooltip>
        ))}
      </Group>
    );
  };

  return (
    <div className="relative flex flex-col h-full">
      {/* Agent discovery/filter input and avatar list */}
      <Box p="xs" mb="xs" style={{ borderBottom: '1px solid var(--mantine-color-dark-4)' }}>
        <Text size="sm" fw={500} mb="xs">Available Agents</Text>
        <TextInput
          placeholder="Filter agents by name or skill..."
          size="xs"
          value={agentFilter}
          onChange={e => setAgentFilter(e.currentTarget.value)}
          mb="xs"
        />
        {renderAgentAvatars()}
      </Box>
      
      {buttons && buttons.length > 0 && (
        <Group justify="flex-end" p="md" pt={0}>
          {buttons}
        </Group>
      )}
      
      {/* Messages area - now uses flex-1 to fill remaining space */}
      <div className="flex-1 h-full overflow-hidden">
        <ScrollArea className="h-full" viewportRef={viewport} p="sm">
          {messages.filter(message => message.type !== 'system').map((message, index) => (
            <Box
              key={index}
              mb="md"
              style={{
                display: 'flex',
                justifyContent: message.type === 'human' ? 'flex-end' : 'flex-start',
              }}
            >
              {message.type === 'ai' ? (
                <Group align="flex-start" gap="xs" style={{ maxWidth: '85%' }}>
                  <Tooltip label={message.agentName || 'Agent'} position="left" withArrow>
                    <Avatar 
                      size="md" 
                      radius="xl" 
                      alt={message.agentName || 'AI'}
                    >
                      {getInitials(message.agentName || 'AI')}
                    </Avatar>
                  </Tooltip>
                  <Paper
                    p="sm"
                    radius="lg"
                    style={{
                      backgroundColor: '#2C2E33',
                      textAlign: 'left',
                      flex: 1,
                    }}
                  >
                    <div
                      style={{
                        color: '#C1C2C5',
                        whiteSpace: 'pre-wrap',
                        fontSize: '14px',
                      }}
                    >
                      {renderMessageContent(message.content, message.type)}
                    </div>
                  </Paper>
                </Group>
              ) : (
                <Group align="flex-start" gap="xs" style={{ maxWidth: '85%' }}>
                  <Paper
                    p="sm"
                    radius="lg"
                    style={{
                      backgroundColor: '#228be6',
                      textAlign: 'right',
                    }}
                  >
                    <div
                      style={{
                        color: 'white',
                        whiteSpace: 'pre-wrap',
                        fontSize: '14px',
                      }}
                    >
                      {renderMessageContent(message.content, message.type)}
                    </div>
                  </Paper>
                  <Tooltip label="User" position="right" withArrow>
                    <Avatar 
                      size="md" 
                      radius="xl" 
                      alt="User"
                    >
                      {getInitials('User')}
                    </Avatar>
                  </Tooltip>
                </Group>
              )}
            </Box>
          ))}
        </ScrollArea>
      </div>
      
      {/* Fixed input at bottom - now uses flex-shrink-0 to prevent shrinking */}
      <div className="flex-shrink-0 bg-[#1a1b1e] border-t border-gray-600 p-4">
        <form onSubmit={handleSubmit}>
          <Group align="flex-end">
            <div style={{ flex: 1, position: 'relative' }}>
              <TextInput
                ref={inputRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder="Type your message... (Paddy will respond, or use @agent to mention others)"
                radius="sm"
                size="lg"
                styles={{
                  input: {
                    backgroundColor: '#2C2E33',
                    color: '#C1C2C5',
                    '&::placeholder': {
                      color: '#5C5F66'
                    }
                  }
                }}
                rightSectionWidth={100}
                rightSection={
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <ActionIcon
                    onClick={handleMicClick}
                    variant="subtle"
                    color={isRecording ? "red" : "gray"}
                    className={isRecording ? "animate-pulse" : ""}
                    size="sm"
                  >
                    {isRecording ? (
                      <IconMicrophoneOff size={16} />
                    ) : (
                      <IconMicrophone size={16} />
                    )}
                  </ActionIcon>
                  <Button 
                    type="submit" 
                    radius="sm"
                    size="sm"
                    variant="filled"
                  >
                    <IconSend size={16} />
                  </Button>
                </div>
              }
              />
              
              {/* Agent autocomplete dropdown */}
              {showAgentDropdown && (
                <Paper
                  ref={dropdownRef}
                  style={{
                    position: 'absolute',
                    bottom: '100%',
                    left: 0,
                    right: 0,
                    marginBottom: '4px',
                    backgroundColor: '#2C2E33',
                    border: '1px solid #444',
                    borderRadius: '4px',
                    maxHeight: '200px',
                    overflowY: 'auto',
                    zIndex: 1000
                  }}
                  p="xs"
                >
                  {getFilteredAgentsForMention(input, cursorPosition).map((agent, index) => (
                    <div
                      key={agent.id}
                      onClick={() => selectAgent(agent)}
                      onMouseEnter={() => setSelectedAgentIndex(index)}
                      style={{
                        padding: '8px',
                        cursor: 'pointer',
                        borderRadius: '4px',
                        color: '#C1C2C5',
                        backgroundColor: index === selectedAgentIndex ? '#404040' : 'transparent'
                      }}
                    >
                      <Group gap="xs">
                        <Avatar size="sm" radius="xl">
                          {getInitials(agent.name)}
                        </Avatar>
                        <Text size="sm">@{agent.name}</Text>
                      </Group>
                    </div>
                  ))}
                  {getFilteredAgentsForMention(input, cursorPosition).length === 0 && (
                    <Text size="sm" c="dimmed" p="sm">
                      No agents found
                    </Text>
                  )}
                </Paper>
              )}
            </div>
          </Group>
        </form>
      </div>
    </div>
  );
} 