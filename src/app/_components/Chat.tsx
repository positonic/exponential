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
  Space
} from '@mantine/core';
import { IconSend } from '@tabler/icons-react';

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
    }
  ]);
  const [input, setInput] = useState('');
  const viewport = useRef<HTMLDivElement>(null);

  const asanaChat = api.tools.chat.useMutation();

  // Scroll to bottom when messages change
  useEffect(() => {
    if (viewport.current) {
      viewport.current.scrollTo({ top: viewport.current.scrollHeight, behavior: 'smooth' });
    }
  }, [messages]);

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
        content: response.response.toString() 
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
    <>
      <Paper 
        shadow="md" 
        radius="md" 
        p="md" 
        withBorder 
        style={{ 
          height: '600px',
          backgroundColor: '#1A1B1E'  // Dark background for the main container
        }}
      >
        <Stack h="100%">
          <ScrollArea h="500px" viewportRef={viewport}>
            {messages.map((message, index) => (
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
                      src="/ai-avatar.png"
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
                      src="/user-avatar.png"
                      alt="User"
                    />
                  )}
                </Group>
              </Box>
            ))}
          </ScrollArea>

          <form onSubmit={handleSubmit} style={{ marginTop: 'auto' }}>
            <Group gap="xs">
              <TextInput
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type your message..."
                style={{ flex: 1 }}
                radius="xl"
                size="md"
                styles={{
                  input: {
                    backgroundColor: '#2C2E33',  // Dark input background
                    color: '#C1C2C5',  // Light text color
                    '&::placeholder': {
                      color: '#5C5F66'  // Darker placeholder text
                    }
                  }
                }}
                rightSection={
                  <Button 
                    type="submit" 
                    radius="xl" 
                    size="xs"
                    variant="filled"
                    style={{ marginRight: 4 }}
                  >
                    <IconSend size={16} />
                  </Button>
                }
              />
            </Group>
          </form>
        </Stack>
      </Paper>

      <Space h="xl" />
    </>
  );
}