import { Text } from '@mantine/core';

interface DurationCellProps {
  minutes: number | null | undefined;
}

export function DurationCell({ minutes }: DurationCellProps) {
  if (!minutes) {
    return <span className="text-text-muted">-</span>;
  }

  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  let formatted: string;
  if (hours > 0 && mins > 0) {
    formatted = `${hours}h ${mins}m`;
  } else if (hours > 0) {
    formatted = `${hours}h`;
  } else {
    formatted = `${mins}m`;
  }

  return (
    <Text size="sm" className="text-text-secondary whitespace-nowrap">
      {formatted}
    </Text>
  );
}
