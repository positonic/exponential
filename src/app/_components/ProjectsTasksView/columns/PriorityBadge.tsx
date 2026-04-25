import { Badge } from '@mantine/core';

// Priority colors for action priorities
const PRIORITY_COLORS: Record<string, string> = {
  '1st Priority': 'red',
  '2nd Priority': 'orange',
  '3rd Priority': 'yellow',
  '4th Priority': 'green',
  '5th Priority': 'blue',
  'Quick': 'violet',
  'Scheduled': 'pink',
  'Errand': 'cyan',
  'Remember': 'indigo',
  'Watch': 'grape',
  'Someday Maybe': 'gray',
};

interface PriorityBadgeProps {
  priority: string | null | undefined;
}

export function PriorityBadge({ priority }: PriorityBadgeProps) {
  if (!priority) {
    return <span className="text-text-muted">-</span>;
  }

  const color = PRIORITY_COLORS[priority] ?? 'gray';

  return (
    <Badge size="sm" variant="light" color={color}>
      {priority}
    </Badge>
  );
}

// Helper function for checkbox border color based on priority
export function getPriorityBorderColor(priority: string | null | undefined): string {
  if (!priority) return 'var(--color-border-primary)';

  switch (priority) {
    case '1st Priority': return 'var(--mantine-color-red-filled)';
    case '2nd Priority': return 'var(--mantine-color-orange-filled)';
    case '3rd Priority': return 'var(--mantine-color-yellow-filled)';
    case '4th Priority': return 'var(--mantine-color-green-filled)';
    case '5th Priority': return 'var(--mantine-color-blue-filled)';
    case 'Quick': return 'var(--mantine-color-violet-filled)';
    case 'Scheduled': return 'var(--mantine-color-pink-filled)';
    case 'Errand': return 'var(--mantine-color-cyan-filled)';
    case 'Remember': return 'var(--mantine-color-indigo-filled)';
    case 'Watch': return 'var(--mantine-color-grape-filled)';
    default: return 'var(--color-border-primary)';
  }
}
