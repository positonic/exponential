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
    name?: string;
}

interface ChatProps {
  initialMessages?: Message[];
  githubSettings?: {
    owner: string;
    repo: string;
    validAssignees: string[];
  };
  buttons?: React.ReactNode[];
}

export default function Chat({ initialMessages, githubSettings, buttons }: ChatProps) {
  const [messages, setMessages] = useState<Message[]>(
    initialMessages ?? [
      {
        type: 'system',
        content: `You are a personal assistant who helps manage tasks in our Task Management System. 
                  You never give IDs to the user since those are just for you to keep track of. 
                  When a user asks to create a task and you don't know the project to add it to for sure, clarify with the user.
                  ${githubSettings ? `When creating GitHub issues, use repo: "${githubSettings.repo}" and owner: "${githubSettings.owner}". Valid assignees are: ${githubSettings.validAssignees.join(", ")}` : ''}
                  The current date is: ${new Date().toISOString().split('T')[0]}`
      },
      {
        type: 'ai',
        content: 'Hello! I\'m your AI assistant. How can I help you manage your tasks today?'
      }
    ]
  );
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const viewport = useRef<HTMLDivElement>(null);

  const utils = api.useUtils();
  const transcribeAudio = api.tools.transcribe.useMutation();
//const transcribeAudio = api.tools.transcribeFox.useMutation(); 
  // Scroll to bottom when messages change
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
          // Convert blob to base64
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
    if (!input.trim() || isStreaming) return;

    const userMessage: Message = { type: 'human', content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsStreaming(true);

    // Add empty AI message that will be filled by streaming
    setMessages(prev => [...prev, { type: 'ai', content: '' }]);

    try {
      // Convert messages to Mastra format
      const mastraMessages = messages.map(msg => ({
        role: msg.type === 'human' ? 'user' : msg.type === 'ai' ? 'assistant' : 'system',
        content: msg.content,
      }));
      mastraMessages.push({ role: 'user', content: input });

      const response = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: mastraMessages,
          agentId: 'projectManagerAgent',
        }),
      });

      if (!response.ok) {
        throw new Error('Stream request failed');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });

          setMessages(prev => {
            const updated = [...prev];
            const lastMessage = updated[updated.length - 1];
            if (lastMessage && lastMessage.type === 'ai') {
              updated[updated.length - 1] = {
                ...lastMessage,
                content: lastMessage.content + chunk,
              };
            }
            return updated;
          });
        }
      }

      // Invalidate queries after successful response
      await Promise.all([
        utils.action.getAll.invalidate(),
        utils.action.getToday.invalidate()
      ]);
    } catch (error) {
      console.error('Chat error:', error);
      setMessages(prev => {
        const updated = [...prev];
        const lastMessage = updated[updated.length - 1];
        if (lastMessage && lastMessage.type === 'ai' && lastMessage.content === '') {
          updated[updated.length - 1] = {
            type: 'ai',
            content: 'Sorry, I encountered an error processing your request.',
          };
        }
        return updated;
      });
    } finally {
      setIsStreaming(false);
    }
  };

  const renderMessageContent = (content: string) => {
    // Regular expression to match YouTube video IDs in square brackets
    const videoPattern = /\[Video ([a-zA-Z0-9_-]+)\]/g;
    
    // Split the content into parts and replace video references with links
    const parts = content.split(videoPattern);
    
    if (parts.length === 1) {
      return content; // No video IDs found, return original content
    }

    return parts.map((part, index) => {
      // Every odd index in parts array will be a video ID
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
                      src={null}
                      alt="AI"
                    />
                  )}
                  <Paper
                    p="sm"
                    radius="lg"
                    style={{
                      maxWidth: '70%',
                      backgroundColor: message.type === 'human' ? 'var(--color-brand-primary)' : 'var(--color-surface-secondary)',  // Theme-aware backgrounds
                    }}
                  >
                    <Text
                      size="sm"
                      style={{
                        color: message.type === 'human' ? 'var(--color-text-inverse)' : 'var(--color-text-primary)',  // Theme-aware text colors
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      {renderMessageContent(message.content)}
                    </Text>
                  </Paper>
                  {message.type === 'human' && (
                    <Avatar 
                      size="md" 
                      radius="xl" 
                      src={null}
                      alt="User"
                    />
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
                placeholder={isStreaming ? "Waiting for response..." : "Type your message..."}
                disabled={isStreaming}
                style={{ flex: 1 }}
                radius="sm"
                size="lg"
                styles={{
                  input: {
                    backgroundColor: 'var(--color-surface-secondary)',
                    color: 'var(--color-text-primary)',
                    '&::placeholder': {
                      color: 'var(--color-text-muted)'
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
                      disabled={isStreaming}
                      loading={isStreaming}
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