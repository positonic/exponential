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
  ActionIcon
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
        content: `You are a coordinator managing a multi-agent conversation. 
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
      const response: { response: string | object; agentName?: string } = await chat.mutateAsync({
        message: input,
        history: messages 
      });

      const aiResponse: Message = {
        type: 'ai', 
        agentName: response.agentName || 'Agent',
        content: typeof response.response === 'string' 
          ? response.response 
          : JSON.stringify(response.response)
      };
      setMessages(prev => [...prev, aiResponse]);

    } catch (error) {
      console.error('Chat error:', error);
      setMessages(prev => [...prev, { 
        type: 'ai', 
        agentName: 'System',
        content: 'Sorry, I encountered an error processing your request.' 
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

  return (
      <Paper 
        shadow="md" 
        radius="sm"
        className="flex flex-col h-full"
      >
        {buttons && buttons.length > 0 && (
          <Group justify="flex-end" p="md">
            {buttons}
          </Group>
        )}
        <Stack h="100%">
          <ScrollArea h="500px" viewportRef={viewport}>
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
                    <Avatar 
                      size="md" 
                      radius="xl" 
                      alt={message.agentName || 'AI'}
                    >
                      {getInitials(message.agentName || 'AI')}
                    </Avatar>
                  )}
                  <Stack gap={2} align={message.type === 'human' ? 'flex-end' : 'flex-start'}>
                    {message.type === 'ai' && (
                      <Text size="xs" c="dimmed" style={{ marginLeft: '8px' }}>
                        {message.agentName || 'Agent'} 
                      </Text>
                    )} 
                    <Paper
                      p="sm"
                      radius="lg"
                      style={{
                        maxWidth: '70%',
                        backgroundColor: message.type === 'human' ? '#228be6' : '#2C2E33',
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
                  </Stack>
                  {message.type === 'human' && (
                    <Avatar 
                      size="md" 
                      radius="xl" 
                      alt="User"
                    >
                      {getInitials('User')} 
                    </Avatar>
                  )}
                </Group>
              </Box>
            ))}
          </ScrollArea>

          <form onSubmit={handleSubmit} style={{ marginTop: 'auto' }}>
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
        </Stack>
      </Paper>
  );
} 