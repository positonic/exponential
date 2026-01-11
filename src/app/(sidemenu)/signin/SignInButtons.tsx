'use client';

import { Button, Stack } from "@mantine/core";
import { IconBrandDiscord, IconBrandGoogle } from "@tabler/icons-react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";

export function SignInButtons() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') ?? '/home';

  return (
    <Stack gap="md">
      {/* Auth Options */}
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
    </Stack>
  );
}
