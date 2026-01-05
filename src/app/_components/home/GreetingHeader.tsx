'use client';

import { Text, Group, TextInput, Kbd } from '@mantine/core';
import { IconSparkles, IconSearch } from '@tabler/icons-react';
import { useState } from 'react';

interface GreetingHeaderProps {
  userName: string;
  aiInsight?: string;
  onQuickCapture?: (text: string) => void;
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export function GreetingHeader({ userName, aiInsight, onQuickCapture }: GreetingHeaderProps) {
  const [captureText, setCaptureText] = useState('');
  const greeting = getGreeting();
  const firstName = userName.split(' ')[0] ?? userName;

  const handleCapture = () => {
    if (captureText.trim() && onQuickCapture) {
      onQuickCapture(captureText.trim());
      setCaptureText('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleCapture();
    }
  };

  return (
    <div className="mb-8">
      {/* Greeting */}
      <div className="mb-6">
        <Text className="text-3xl font-semibold text-text-primary mb-1">
          {greeting}, {firstName}
        </Text>
        {aiInsight && (
          <Group gap="xs" className="mt-2">
            <IconSparkles size={14} className="text-brand-primary" />
            <Text size="sm" className="text-text-secondary">
              {aiInsight}
            </Text>
          </Group>
        )}
      </div>

      {/* Quick Capture */}
      <div className="relative max-w-xl">
        <TextInput
          placeholder="Quick capture... What's on your mind?"
          value={captureText}
          onChange={(e) => setCaptureText(e.target.value)}
          onKeyDown={handleKeyDown}
          leftSection={<IconSearch size={16} className="text-text-muted" />}
          rightSection={
            <Group gap={4}>
              <Kbd size="xs" className="text-text-muted">
                Enter
              </Kbd>
            </Group>
          }
          rightSectionWidth={60}
          size="md"
          radius="md"
          classNames={{
            input: 'bg-surface-secondary border-border-primary focus:border-border-focus',
          }}
        />
      </div>
    </div>
  );
}
