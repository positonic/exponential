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

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([
    {
      type: 'system',
      content: `You are a personal assistant who helps manage tasks in Asana. 
                You never give IDs to the user since those are just for you to keep track of. 
                When a user asks to create a task and you don't know the project to add it to for sure, clarify with the user.
                The current date is: ${new Date().toISOString().split('T')[0]}`
    },
    {
      type: 'ai',
      content: 'Hello! I\'m your AI assistant. How can I help you manage your tasks today?'
    }
  ]);
  const [input, setInput] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const viewport = useRef<HTMLDivElement>(null);

  const asanaChat = api.tools.chat.useMutation();
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
    if (!input.trim()) return;

    const userMessage: Message = { type: 'human', content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');

    try {
      const response = await asanaChat.mutateAsync({
        message: input,
        history: messages
      });

      setMessages(prev => [...prev, { 
        type: 'ai', 
        content: typeof response.response === 'string' 
          ? response.response 
          : JSON.stringify(response.response)
      }]);
    } catch (error) {
      console.error('Chat error:', error);
      setMessages(prev => [...prev, { 
        type: 'ai', 
        content: 'Sorry, I encountered an error processing your request.' 
      }]);
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
        p="md" 
        w="100%"
        style={{ 
          height: '600px',
          backgroundColor: '#262626'
        }}
      >
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
                      backgroundColor: message.type === 'human' ? '#228be6' : '#2C2E33',  // Darker background for AI messages
                    }}
                  >
                    <Text
                      size="sm"
                      style={{
                        color: message.type === 'human' ? 'white' : '#C1C2C5',  // Light gray text for AI messages
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