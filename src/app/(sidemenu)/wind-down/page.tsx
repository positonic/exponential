import { Container, Title, Text } from "@mantine/core";
import { WindDownRoutineForm } from "~/app/_components/WindDownRoutineForm";
import { api } from "~/trpc/server";
import { startOfDay } from "date-fns";

export default async function WindDown() {
  // Get today's date
  const today = new Date();
  
  // Get or create today's day record
  const dayData = await api.day.getByDate({ date: today });
  
  // Pass the dayId and today's date to the form
  const dayId = dayData?.id?.toString();
  
  return (
    <Container size="md" className="py-8">
      {/* Header */}
      <div className="text-center mb-8">
        <Title
          order={1}
          className="text-4xl font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent mb-4"
        >
          End Your Day With Reflection
        </Title>
        <Text c="dimmed" size="lg">
          Take a moment to reflect and learn from your day. Your evening routine shapes tomorrow&apos;s success.
        </Text>
      </div>

      {/* Form */}
      <WindDownRoutineForm dayId={dayId} date={today} />
    </Container>
  );
} 