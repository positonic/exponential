"use client";

import { Container, Title, Text } from "@mantine/core";
import { useSearchParams } from "next/navigation";
import { AssessmentWizard } from "~/app/_components/wheel-of-life/AssessmentWizard";

export default function AssessmentPage() {
  const searchParams = useSearchParams();
  const assessmentType: "on_demand" | "quarterly" = searchParams.get("type") === "quarterly" ? "quarterly" : "on_demand";

  return (
    <Container size="lg" className="py-8">
      {/* Header */}
      <div className="mb-8 text-center">
        <Title
          order={1}
          className="text-3xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent"
        >
          Wheel of Life Assessment
        </Title>
        <Text c="dimmed" size="sm" mt={4}>
          Take a few minutes to reflect on the key areas of your life
        </Text>
      </div>

      {/* Wizard */}
      <AssessmentWizard assessmentType={assessmentType} />
    </Container>
  );
}
