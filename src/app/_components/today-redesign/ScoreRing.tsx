interface ScoreRingProps {
  value: number;
  max?: number;
  size?: number;
}

export function ScoreRing({ value, max = 100, size = 20 }: ScoreRingProps) {
  const r = (size - 4) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, value / max));
  return (
    <div className="td-ring" style={{ width: size, height: size }}>
      <svg className="td-ring__svg" width={size} height={size}>
        <circle className="td-ring__track" cx={size / 2} cy={size / 2} r={r} strokeWidth={2} />
        <circle
          className="td-ring__fill"
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={2}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
        />
      </svg>
    </div>
  );
}
