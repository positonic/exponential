import { Container, Title, Text } from "@mantine/core";
import { JournalForm } from "~/app/_components/JournalForm";

export default function Journal() {
  return (
    <Container size="md" className="py-8">
      {/* Header */}
      <div className="text-center mb-8">
        <Title
          order={1}
          className="text-4xl font-bold bg-gradient-to-r from-green-400 to-teal-400 bg-clip-text text-transparent mb-4"
        >
          Journal
        </Title>
        <Text c="dimmed" size="lg">
          Paper is more patient than people. Put your thoughts to the test.
        </Text>
      </div>

      {/* Form */}
      <JournalForm />
    </Container>
  );
} 