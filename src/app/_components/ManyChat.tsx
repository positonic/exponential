'use client';

import { useState, useEffect, useRef } from 'react';
import { api } from "~/trpc/react";
import { 
  Paper, 
  TextInput, 
  Button, 
  Stack, 
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
}

export default function ManyChat({ initialMessages, githubSettings, buttons }: ManyChatProps) {
  const [messages, setMessages] = useState<Message[]>(
    initialMessages ?? [
      {
        type: 'system',
        content: `Your name is Peter the project manager.You are a coordinator managing a multi-agent conversation. 
                  Route user requests to the appropriate specialized agent if necessary.
                  Keep track of the conversation flow between the user and multiple AI agents.
                  ${githubSettings ? `When creating GitHub issues, use repo: "${githubSettings.repo}" and owner: "${githubSettings.owner}". Valid assignees are: ${githubSettings.validAssignees.join(", ")}` : ''}
                  The current date is: ${new Date().toISOString().split('T')[0]}`
      },
      {
        type: 'ai',
        agentName: 'Coordinator', // Example initial agent name
        content: 'Hello! Multiple agents are available to assist you. How can I help today?' 
      }
    ]
  );
  const [input, setInput] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const viewport = useRef<HTMLDivElement>(null);
  const [agentFilter, setAgentFilter] = useState<string>('');

  const utils = api.useUtils();
  const chat = api.tools.chat.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.action.getAll.invalidate(),
        utils.action.getToday.invalidate()
      ]);
    }
  });
  const transcribeAudio = api.tools.transcribe.useMutation();
  const callAgent = api.mastra.callAgent.useMutation();
  const chooseAgent = api.mastra.chooseAgent.useMutation();

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
  useEffect(() => {
    if (viewport.current) {
      viewport.current.scrollTo({ top: viewport.current.scrollHeight, behavior: 'smooth' });
    }
  }, [messages]);

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
    setInput('');

    try {
      const { agentId } = await chooseAgent.mutateAsync({ message: input });
      const result = await callAgent.mutateAsync({
        agentId,
        messages: [{ role: 'user', content: input }],
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
      const errorMessage = error instanceof Error ? error.message : 'Sorry, I encountered an error processing your request.';
      setMessages(prev => [...prev, { 
        type: 'ai', 
        agentName: 'System',
        content: errorMessage 
      }]);
    }
  };

  const renderMessageContent = (content: string) => {
    const videoPattern = /\[Video ([a-zA-Z0-9_-]+)\]/g;
    const parts = content.split(videoPattern);
    
    if (parts.length === 1) {
      return content; 
    }

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
    <div className="relative flex flex-col h-full" style={{backgroundColor: 'blue'}}>
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
              <Group align="flex-start" gap="xs">
                {message.type === 'ai' && (
                  <Tooltip label={message.agentName || 'Agent'} position="left" withArrow>
                    <Avatar 
                      size="md" 
                      radius="xl" 
                      alt={message.agentName || 'AI'}
                    >
                      {getInitials(message.agentName || 'AI')}
                    </Avatar>
                  </Tooltip>
                )}
                <Paper
                  p="sm"
                  radius="lg"
                  style={{
                    maxWidth: '70%',
                    backgroundColor: message.type === 'human' ? '#228be6' : '#2C2E33',
                    textAlign: message.type === 'human' ? 'right' : 'left',
                  }}
                >
                  <Text
                    size="sm"
                    style={{
                      color: message.type === 'human' ? 'white' : '#C1C2C5',
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {renderMessageContent(message.content)}
                  </Text>
                </Paper>
                {message.type === 'human' && (
                  <Tooltip label="User" position="right" withArrow>
                    <Avatar 
                      size="md" 
                      radius="xl" 
                      alt="User"
                    >
                      {getInitials('User')}
                    </Avatar>
                  </Tooltip>
                )}
              </Group>
            </Box>
          ))}
        </ScrollArea>
      </div>
      
      {/* Fixed input at bottom - now uses flex-shrink-0 to prevent shrinking */}
      <div className="flex-shrink-0 bg-[#1a1b1e] border-t border-gray-600 p-4">
        <form onSubmit={handleSubmit}>
          <Group align="flex-end">
            <TextInput
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type your message..."
              style={{ flex: 1 }}
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
          </Group>
        </form>
      </div>
    </div>
  );
} 