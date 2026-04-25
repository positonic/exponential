"use client";

import { Card, Text, Table, Badge, Progress, Stack } from "@mantine/core";
import { ObjectiveIndicator } from "./ObjectiveIndicator";

interface KeyResult {
  id: string;
  title: string;
  currentValue: number;
  targetValue: number;
  startValue: number;
  status: string;
}

interface Objective {
  id: number;
  title: string;
  description?: string | null;
  progress: number;
  keyResults: KeyResult[];
}

interface OkrTableViewProps {
  annualObjectives: Objective[];
  quarterlyObjectives: Objective[];
  selectedQuarter: string;
}

/**
 * Get the Mantine color for a status.
 */
function getStatusColor(status: string): string {
  switch (status) {
    case "on-track":
      return "green";
    case "achieved":
      return "blue";
    case "at-risk":
      return "yellow";
    case "off-track":
      return "red";
    default:
      return "gray";
  }
}

/**
 * Calculate progress percentage for a key result.
 */
function calculateProgress(keyResult: KeyResult): number {
  const range = keyResult.targetValue - keyResult.startValue;
  if (range === 0) return 0;
  const progress =
    ((keyResult.currentValue - keyResult.startValue) / range) * 100;
  return Math.min(100, Math.max(0, progress));
}

/**
 * Render a list of key results in a compact format.
 */
function KeyResultList({ keyResults }: { keyResults: KeyResult[] }) {
  if (keyResults.length === 0) {
    return (
      <Text size="sm" className="text-text-muted italic">
        No key results
      </Text>
    );
  }

  return (
    <Stack gap="xs">
      {keyResults.map((kr) => {
        const progress = calculateProgress(kr);
        const statusColor = getStatusColor(kr.status);
        return (
          <div key={kr.id} className="flex items-center gap-2">
            <Badge size="xs" color={statusColor} variant="light">
              {Math.round(progress)}%
            </Badge>
            <Text size="sm" className="text-text-primary truncate flex-1">
              {kr.title}
            </Text>
          </div>
        );
      })}
    </Stack>
  );
}

/**
 * Table view showing annual and quarterly OKRs paired side-by-side.
 * Maps objectives by display order (O1 annual pairs with O1 quarterly, etc.)
 */
export function OkrTableView({
  annualObjectives,
  quarterlyObjectives,
  selectedQuarter,
}: OkrTableViewProps) {
  // Create pairs by index (O1 with O1, O2 with O2, etc.)
  const maxLength = Math.max(
    annualObjectives.length,
    quarterlyObjectives.length
  );
  const pairs = Array.from({ length: maxLength }, (_, i) => ({
    annual: annualObjectives[i] ?? null,
    quarterly: quarterlyObjectives[i] ?? null,
  }));

  if (pairs.length === 0) {
    return (
      <Card className="border border-border-primary bg-surface-secondary text-center py-12">
        <Text className="text-text-muted">
          No objectives found for the selected periods.
        </Text>
      </Card>
    );
  }

  const quarterDisplay = selectedQuarter.replace("-", " ");

  return (
    <Card className="border border-border-primary bg-surface-secondary overflow-x-auto">
      <Table striped highlightOnHover withTableBorder={false}>
        <Table.Thead>
          <Table.Tr className="border-b border-border-primary">
            <Table.Th className="text-text-secondary w-1/4">
              12-Month Objective
            </Table.Th>
            <Table.Th className="text-text-secondary w-1/4">
              12-Month Key Results
            </Table.Th>
            <Table.Th className="text-text-secondary w-1/4">
              {quarterDisplay} Objective
            </Table.Th>
            <Table.Th className="text-text-secondary w-1/4">
              {quarterDisplay} Key Results
            </Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {pairs.map((pair, index) => (
            <Table.Tr
              key={`pair-${index}`}
              className="border-b border-border-secondary"
            >
              {/* Annual Objective */}
              <Table.Td className="align-top py-3">
                {pair.annual ? (
                  <div className="flex items-start gap-2">
                    <ObjectiveIndicator title={pair.annual.title} size="sm" />
                    <div>
                      <Text fw={500} size="sm" className="text-text-primary">
                        {pair.annual.title}
                      </Text>
                      {pair.annual.description && (
                        <Text
                          size="xs"
                          className="text-text-muted mt-1 line-clamp-2"
                        >
                          {pair.annual.description}
                        </Text>
                      )}
                      <Progress
                        value={pair.annual.progress}
                        size="xs"
                        className="mt-2 w-20"
                      />
                    </div>
                  </div>
                ) : (
                  <Text size="sm" className="text-text-muted italic">
                    —
                  </Text>
                )}
              </Table.Td>

              {/* Annual Key Results */}
              <Table.Td className="align-top py-3">
                {pair.annual ? (
                  <KeyResultList keyResults={pair.annual.keyResults} />
                ) : (
                  <Text size="sm" className="text-text-muted italic">
                    —
                  </Text>
                )}
              </Table.Td>

              {/* Quarterly Objective */}
              <Table.Td className="align-top py-3">
                {pair.quarterly ? (
                  <div className="flex items-start gap-2">
                    <ObjectiveIndicator
                      title={pair.quarterly.title}
                      size="sm"
                    />
                    <div>
                      <Text fw={500} size="sm" className="text-text-primary">
                        {pair.quarterly.title}
                      </Text>
                      {pair.quarterly.description && (
                        <Text
                          size="xs"
                          className="text-text-muted mt-1 line-clamp-2"
                        >
                          {pair.quarterly.description}
                        </Text>
                      )}
                      <Progress
                        value={pair.quarterly.progress}
                        size="xs"
                        className="mt-2 w-20"
                      />
                    </div>
                  </div>
                ) : (
                  <Text size="sm" className="text-text-muted italic">
                    —
                  </Text>
                )}
              </Table.Td>

              {/* Quarterly Key Results */}
              <Table.Td className="align-top py-3">
                {pair.quarterly ? (
                  <KeyResultList keyResults={pair.quarterly.keyResults} />
                ) : (
                  <Text size="sm" className="text-text-muted italic">
                    —
                  </Text>
                )}
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Card>
  );
}
