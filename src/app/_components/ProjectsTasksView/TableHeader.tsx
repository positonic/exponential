'use client';

const COLUMNS = [
  { key: 'name', label: 'NAME', className: 'flex-1 min-w-[300px]' },
  { key: 'eta', label: 'ETA', className: 'w-28' },
  { key: 'assignee', label: 'ASSIGNEE', className: 'w-24' },
  { key: 'project', label: 'PROJECT', className: 'w-32' },
  { key: 'completedAt', label: 'COMPLETED AT', className: 'w-32' },
  { key: 'duration', label: 'DURATION', className: 'w-20' },
  { key: 'deadline', label: 'DEADLINE', className: 'w-28' },
  { key: 'completed', label: 'COMPLETED', className: 'w-24' },
  { key: 'startDate', label: 'START DATE', className: 'w-28' },
  { key: 'priority', label: 'PRIORITY', className: 'w-28' },
];

export function TableHeader() {
  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-surface-secondary border-b border-border-primary sticky top-0 z-10">
      {COLUMNS.map((col) => (
        <div
          key={col.key}
          className={`text-xs font-medium text-text-muted uppercase tracking-wider ${col.className}`}
        >
          {col.label}
        </div>
      ))}
    </div>
  );
}
