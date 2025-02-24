import { Container, Title, SegmentedControl, Table, Paper } from "@mantine/core";
import { DaysTable } from "~/app/_components/DaysTable";

export default function Days() {
  return (
    <Container size="xl" className="py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <Title
          order={1}
          className="text-4xl font-bold bg-gradient-to-r from-yellow-400 to-orange-400 bg-clip-text text-transparent"
        >
          🌻 Daily tracking
        </Title>
      </div>

      {/* Content */}
      <DaysTable />
    </Container>
  );
} 