'use client';

import { Button, TextInput, Stack, Group, Text } from "@mantine/core";
import { IconBrandGoogle, IconMail, IconBrandDiscord } from "@tabler/icons-react";
import { useState } from "react";
import { signIn } from "next-auth/react";

export function SignInButtons() {
  const [email, setEmail] = useState("");

  return (
    <Stack gap="md">
      {/* Email Input */}
      {/* <div>
        <Group gap="sm" className="mb-4">
          <TextInput
            placeholder="name@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="flex-1"
            size="lg"
            styles={{
              input: {
                backgroundColor: 'rgba(17, 24, 39, 0.7)',
                borderColor: 'rgba(75, 85, 99, 0.3)',
                color: 'white',
                '&::placeholder': {
                  color: 'rgba(156, 163, 175, 0.7)',
                },
                '&:focus': {
                  borderColor: '#60A5FA',
                  boxShadow: '0 0 0 1px rgba(96, 165, 250, 0.2)',
                },
              },
            }}
          />
          <Button 
            size="lg"
            className="bg-blue-500 hover:bg-blue-600 text-white transition-colors"
            onClick={() => console.log('Continue with email')}
          >
            Continue
          </Button>
        </Group>
      </div> */}

      {/* Divider */}
      {/* <div className="relative my-2">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-800/80"></div>
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="bg-gray-900/50 px-2 text-gray-500">OR</span>
        </div>
      </div> */}

      {/* Auth Options */}
      <Stack gap="sm">
        <Button
          component="a"
          onClick={() => signIn("discord", { callbackUrl: "/" })}
          // href="/api/auth/signin/discord"
          size="lg"
          variant="outline"
          leftSection={<IconBrandDiscord size={20} />}
          className="border-gray-700/50 hover:border-gray-600 hover:bg-gray-800/50 transition-all"
          styles={{
            root: {
              color: '#E5E7EB',
            },
          }}
        >
          Continue with Discord
        </Button>
      </Stack>
    </Stack>
  );
} 