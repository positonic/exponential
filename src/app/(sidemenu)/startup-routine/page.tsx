import { Container, Title, Text } from "@mantine/core";
import { StartupRoutineForm } from "~/app/_components/StartupRoutineForm";

export default function StartupRoutine() {
  return (
    <Container size="md" className="py-8">
      {/* Header */}
      <div className="text-center mb-8">
        <Title
          order={1}
          className="text-4xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent mb-4"
        >
          Start Your Day With Intention
        </Title>
        <Text c="dimmed" size="lg">
          Win the morning, win the day. Take a moment to reflect and set your intentions.
        </Text>
      </div>

      {/* Form */}
      <StartupRoutineForm />
    </Container>
  );
} 