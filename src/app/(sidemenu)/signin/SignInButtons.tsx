'use client';

import { useState } from "react";
import { Button, Stack, TextInput, Divider } from "@mantine/core";
import { IconBrandDiscord, IconBrandGoogle } from "@tabler/icons-react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";

export function SignInButtons() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') ?? '/home';
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleEmailSignIn = async () => {
    if (!email) return;
    setIsLoading(true);
    try {
      await signIn("postmark", { email, callbackUrl });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Stack gap="md">
      {/* OAuth Options */}
      <Stack gap="sm">
        <Button
          onClick={() => signIn("google", { callbackUrl })}
          size="lg"
          variant="outline"
          leftSection={<IconBrandGoogle size={20} />}
          className="border-border-primary hover:border-border-focus hover:bg-surface-hover transition-all"
          styles={{
            root: {
              color: 'var(--color-text-primary)',
            },
          }}
        >
          Sign up with Google
        </Button>

        <Button
          onClick={() => signIn("discord", { callbackUrl })}
          size="lg"
          variant="outline"
          leftSection={<IconBrandDiscord size={20} />}
          className="border-border-primary hover:border-border-focus hover:bg-surface-hover transition-all"
          styles={{
            root: {
              color: 'var(--color-text-primary)',
            },
          }}
        >
          Sign up with Discord
        </Button>
      </Stack>

      {/* Divider */}
      <Divider
        label="Or"
        labelPosition="center"
        className="text-text-muted"
        styles={{
          label: {
            color: 'var(--color-text-muted)',
          },
        }}
      />

      {/* Email Sign In */}
      <Stack gap="sm">
        <TextInput
          type="email"
          placeholder="name@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          size="lg"
          className="w-full"
          styles={{
            input: {
              backgroundColor: 'var(--surface-secondary)',
              borderColor: 'var(--border-primary)',
              color: 'var(--color-text-primary)',
              '&::placeholder': {
                color: 'var(--color-text-muted)',
              },
            },
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              void handleEmailSignIn();
            }
          }}
        />
        <Button
          onClick={() => void handleEmailSignIn()}
          size="lg"
          variant="outline"
          loading={isLoading}
          disabled={!email}
          className="border-border-primary hover:border-border-focus hover:bg-surface-hover transition-all"
          styles={{
            root: {
              color: 'var(--color-text-primary)',
            },
          }}
        >
          Sign up
        </Button>
      </Stack>
    </Stack>
  );
}
