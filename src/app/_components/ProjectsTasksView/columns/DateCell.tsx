import { Text } from '@mantine/core';

interface DateCellProps {
  date: Date | string | null | undefined;
  showTime?: boolean;
}

export function DateCell({ date, showTime = false }: DateCellProps) {
  if (!date) {
    return <span className="text-text-muted">-</span>;
  }

  const dateObj = typeof date === 'string' ? new Date(date) : date;

  const formatted = dateObj.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(showTime ? { hour: 'numeric', minute: '2-digit' } : {}),
  });

  return (
    <Text size="sm" className="text-text-secondary whitespace-nowrap">
      {formatted}
    </Text>
  );
}
