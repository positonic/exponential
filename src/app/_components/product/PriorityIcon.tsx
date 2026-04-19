"use client";

/**
 * Priority icon matching Linear's bar-style indicators.
 * 0 = Urgent (!), 1 = High (3 bars), 2 = Medium (2 bars), 3 = Low (1 bar), 4 = None (dashed)
 */

const BAR_COLOR = "currentColor";
const MUTED = "currentColor";

function UrgentIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className="text-red-500">
      <path d="M8 2.5v7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="8" cy="12.5" r="1.2" fill="currentColor" />
    </svg>
  );
}

function BarsIcon({ bars, size }: { bars: number; size: number }) {
  const barWidth = 2.5;
  const gap = 1.5;
  const totalBars = 3;
  const totalWidth = totalBars * barWidth + (totalBars - 1) * gap;
  const startX = (size - totalWidth) / 2;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none">
      {Array.from({ length: totalBars }, (_, i) => {
        const barHeight = 4 + i * 3; // 4, 7, 10
        const x = startX + i * (barWidth + gap);
        const y = size - 2 - barHeight;
        const active = i < bars;
        return (
          <rect
            key={i}
            x={x}
            y={y}
            width={barWidth}
            height={barHeight}
            rx={0.8}
            fill={active ? BAR_COLOR : "none"}
            stroke={active ? "none" : MUTED}
            strokeWidth={active ? 0 : 0.8}
            opacity={active ? 1 : 0.25}
          />
        );
      })}
    </svg>
  );
}

function NoPriorityIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none">
      <line x1="3" y1={size / 2} x2={size - 3} y2={size / 2} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="2 2" opacity="0.3" />
    </svg>
  );
}

interface PriorityIconProps {
  priority: number | null | undefined;
  size?: number;
}

export function PriorityIcon({ priority, size = 16 }: PriorityIconProps) {
  switch (priority) {
    case 0: return <UrgentIcon size={size} />;
    case 1: return <span className="text-orange-400"><BarsIcon bars={3} size={size} /></span>;
    case 2: return <span className="text-yellow-400"><BarsIcon bars={2} size={size} /></span>;
    case 3: return <span className="text-blue-400"><BarsIcon bars={1} size={size} /></span>;
    default: return <NoPriorityIcon size={size} />;
  }
}

export const PRIORITY_LABELS: Record<number, string> = {
  0: "Urgent",
  1: "High",
  2: "Medium",
  3: "Low",
  4: "No priority",
};
