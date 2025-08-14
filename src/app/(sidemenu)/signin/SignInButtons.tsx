'use client';

import { Button, Stack } from "@mantine/core";
import { IconBrandDiscord, IconBrandGoogle } from "@tabler/icons-react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";

export function SignInButtons() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/home';

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
                  borderColor: 'var(--color-brand-primary)',
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
          onClick={() => signIn("google", { callbackUrl })}
          size="lg"
          variant="outline"
          leftSection={<IconBrandGoogle size={20} />}
          className="border-gray-700/50 hover:border-gray-600 hover:bg-gray-800/50 transition-all"
          styles={{
            root: {
              color: 'var(--color-text-primary)',
            },
          }}
        >
          Continue with Google
        </Button>

        <Button
          onClick={() => signIn("discord", { callbackUrl })}
          size="lg"
          variant="outline"
          leftSection={<IconBrandDiscord size={20} />}
          className="border-gray-700/50 hover:border-gray-600 hover:bg-gray-800/50 transition-all"
          styles={{
            root: {
              color: 'var(--color-text-primary)',
            },
          }}
        >
          Continue with Discord
        </Button>

        {/* <Button
          onClick={() => signIn("notion", { callbackUrl: "/" })}
          size="lg"
          variant="outline"
          leftSection={<IconBrandDiscord size={20} />}
          className="border-gray-700/50 hover:border-gray-600 hover:bg-gray-800/50 transition-all"
          styles={{
            root: {
              color: 'var(--color-text-primary)',
            },
          }}
        >
          Continue with Notion
        </Button> */}
      </Stack>
    </Stack>
  );
} 