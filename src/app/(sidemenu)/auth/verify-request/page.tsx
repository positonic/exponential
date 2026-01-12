import {
  Title,
  Text,
  Stack,
  Button,
} from "@mantine/core";
import { IconMail, IconArrowLeft } from "@tabler/icons-react";
import Link from "next/link";

export default function VerifyRequest() {
  return (
    <div className="min-h-screen flex">
      {/* Left Side - Check Email Content */}
      <div className="w-full lg:w-1/2 flex flex-col justify-center px-8 md:px-16 lg:px-24 py-12 bg-background-primary">
        {/* Logo */}
        <div className="mb-12">
          <Text className="text-2xl font-bold text-text-primary">
            Exponential.im
          </Text>
        </div>

        {/* Main Content */}
        <div className="max-w-[420px]">
          <Stack gap="lg">
            {/* Email Icon */}
            <div className="w-16 h-16 rounded-full bg-brand-primary/10 flex items-center justify-center">
              <IconMail size={32} className="text-brand-primary" />
            </div>

            {/* Header */}
            <div>
              <Title order={1} className="text-4xl font-bold text-text-primary mb-2">
                Check your email
              </Title>
              <Text className="text-text-secondary text-lg">
                A sign in link has been sent to your email address.
              </Text>
            </div>

            {/* Instructions */}
            <div className="bg-surface-secondary rounded-lg p-4 border border-border-primary">
              <Stack gap="sm">
                <Text size="sm" className="text-text-secondary">
                  Click the link in the email to sign in to your account. The link will expire in 24 hours.
                </Text>
                <Text size="sm" className="text-text-muted">
                  If you don&apos;t see the email, check your spam folder.
                </Text>
              </Stack>
            </div>

            {/* Back to Sign In */}
            <Button
              component={Link}
              href="/signin"
              variant="subtle"
              leftSection={<IconArrowLeft size={16} />}
              className="text-text-secondary hover:text-text-primary"
            >
              Back to sign in
            </Button>
          </Stack>

          {/* Help Footer */}
          <div className="mt-24">
            <Text size="sm" className="text-text-muted">
              Having trouble? Contact us at{" "}
              <Text
                component="a"
                href={`mailto:${process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? 'support@exponential.im'}`}
                className="text-text-primary underline hover:text-text-secondary transition-colors"
                inherit
              >
                {process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? 'support@exponential.im'}
              </Text>
            </Text>
          </div>
        </div>
      </div>

      {/* Right Side - Hero Image */}
      <div className="hidden lg:flex w-1/2 relative bg-gradient-to-br from-purple-900 via-purple-800 to-indigo-900">
        {/* Placeholder Image Background */}
        <div className="absolute inset-0 bg-gradient-to-br from-purple-900/90 via-purple-800/80 to-indigo-900/90" />

        {/* Content Overlay */}
        <div className="relative z-10 flex flex-col justify-center items-center p-12 text-center">
          <Title order={2} className="text-3xl md:text-4xl font-bold text-white max-w-lg leading-tight">
            Take control of your time and achieve more with AI-powered productivity
          </Title>

          {/* Social Proof Logos Placeholder */}
          <div className="mt-12 flex items-center gap-8 opacity-70">
            <div className="w-24 h-8 bg-white/20 rounded" />
            <div className="w-24 h-8 bg-white/20 rounded" />
            <div className="w-24 h-8 bg-white/20 rounded" />
          </div>
        </div>

        {/* Decorative Elements */}
        <div className="absolute bottom-0 right-0 w-full h-full overflow-hidden pointer-events-none">
          <div className="absolute -bottom-20 -right-20 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl" />
          <div className="absolute top-20 -right-40 w-80 h-80 bg-indigo-500/20 rounded-full blur-3xl" />
        </div>
      </div>
    </div>
  );
}
