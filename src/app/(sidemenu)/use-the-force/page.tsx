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
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black">
      <Container size="sm" className="min-h-screen flex items-center justify-center py-10">
        <Stack className="w-full max-w-[460px] mx-auto">
          {/* Main Content */}
          <Stack className="text-center mb-8">
            <Title order={1} className="text-5xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
              May the Flow Be With You.
            </Title>
            <Title order={2} className="text-xl font-normal mt-4 text-gray-400">
              Unleash the Force of Effortless Flow
            </Title>
          </Stack>

          {/* Sign-in Options */}
          <Paper
            p="xl"
            radius="lg"
            className="w-full bg-gray-900/50 backdrop-blur-sm border border-gray-800/50 shadow-xl"
            styles={{
              root: {
                backgroundColor: 'rgba(17, 24, 39, 0.7)',
              }
            }}
          >
            <SignInButtons />
          </Paper>

          {/* Footer Text */}
          <Text size="sm" c="dimmed" ta="center" mt="sm" className="text-gray-500">
            By continuing, you agree to our{" "}
            <Text
              component="a"
              href="#"
              className="text-blue-400 hover:text-blue-300 hover:underline transition-colors"
              inherit
            >
              Terms of Service
            </Text>{" "}
            and{" "}
            <Text
              component="a"
              href="#"
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