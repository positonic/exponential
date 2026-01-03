import {
  Container,
  Paper,
  Title,
  Text,
  Stack,
} from "@mantine/core";
import { SignInButtons } from "./SignInButtons";

export default function SignIn() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background-secondary to-background-primary">
      <Container size="sm" className="min-h-screen flex items-center justify-center py-10">
        <Stack className="w-full max-w-[460px] mx-auto">
          {/* Main Content */}
          <Stack className="text-center mb-8">
            <Title order={1} className="text-5xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
              Welcome Back
            </Title>
            <Title order={2} className="text-xl font-normal mt-4 text-gray-400">
              Sign in to your AI-powered productivity platform
            </Title>
          </Stack>

          {/* Sign-in Options */}
          <Paper
            p="xl"
            radius="lg"
            className="w-full bg-surface-secondary/50 backdrop-blur-sm border border-border-primary/50 shadow-xl"
            styles={{
              root: {
                backgroundColor: 'var(--surface-secondary)',
                opacity: 0.7,
              }
            }}
          >
            <SignInButtons />
          </Paper>

          {/* Footer Text */}
          <Text size="sm" c="dimmed" ta="center" mt="sm" className="text-text-muted">
            By continuing, you agree to our{" "}
            <Text
              component="a"
              href="/terms"
              className="text-blue-400 hover:text-blue-300 hover:underline transition-colors"
              inherit
            >
              Terms of Service
            </Text>{" "}
            and{" "}
            <Text
              component="a"
              href="/privacy"
              className="text-blue-400 hover:text-blue-300 hover:underline transition-colors"
              inherit
            >
              Privacy Policy
            </Text>
          </Text>
        </Stack>
      </Container>
    </div>
  );
} 