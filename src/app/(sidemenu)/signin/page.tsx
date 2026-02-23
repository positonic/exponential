import {
  Title,
  Text,
  Stack,
} from "@mantine/core";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SignInButtons } from "./SignInButtons";
import { auth } from "~/server/auth";

export const metadata: Metadata = {
  title: "Sign In | Exponential",
  description: "Sign in to Exponential with your Google or Discord account.",
  robots: { index: false, follow: false },
  alternates: {
    canonical: "/signin",
  },
};

export default async function SignIn() {
  const session = await auth();

  if (session?.user) {
    redirect("/home");
  }

  return (
    <div className="min-h-screen flex">
      {/* Left Side - Sign In Form */}
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
            {/* Header */}
            <div>
              <Title order={1} className="text-4xl font-bold text-text-primary mb-2">
                👋 Try Exponential for free!
              </Title>
              <Text className="text-text-secondary text-lg">
                Sign up with your Google or Discord account
              </Text>
              <Text size="sm" className="text-text-muted mt-2">
                By signing up, you agree to our{" "}
                <Text
                  component="a"
                  href="/terms"
                  className="text-text-primary underline hover:text-text-secondary transition-colors"
                  inherit
                >
                  Terms of Service
                </Text>{" "}
                and{" "}
                <Text
                  component="a"
                  href="/privacy"
                  className="text-text-primary underline hover:text-text-secondary transition-colors"
                  inherit
                >
                  Privacy Policy
                </Text>
              </Text>
            </div>

            {/* Sign-in Options */}
            <SignInButtons />
          </Stack>

          {/* Help Footer */}
          <div className="mt-24">
            <Text size="sm" className="text-text-muted">
              Having trouble with your account or subscription? Don&apos;t worry, just
              head over to{" "}
              <Text
                component="a"
                href={`mailto:${process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? 'support@exponential.im'}`}
                className="text-text-primary underline hover:text-text-secondary transition-colors"
                inherit
              >
                {process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? 'support@exponential.im'}
              </Text>{" "}
              and our support team will be happy to assist you!
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
