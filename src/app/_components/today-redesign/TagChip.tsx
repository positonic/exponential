export type TagTone = "sales" | "ops" | "james" | "unas" | "pipe";

const COLOR_TO_TONE: Record<string, TagTone> = {
  pink: "sales",
  red: "sales",
  grape: "sales",
  blue: "ops",
  cyan: "ops",
  indigo: "ops",
  green: "james",
  lime: "james",
  teal: "james",
  yellow: "pipe",
  orange: "pipe",
  gray: "unas",
  violet: "unas",
};

export function tagTone(color: string | null | undefined): TagTone {
  if (!color) return "unas";
  return COLOR_TO_TONE[color.toLowerCase()] ?? "unas";
}

interface TagChipProps {
  label: string;
  tone: TagTone;
  onClick?: () => void;
}

export function TagChip({ label, tone, onClick }: TagChipProps) {
  const Tag = onClick ? "button" : "span";
  return (
    <Tag
      className={`td-tag td-tag--${tone}`}
      onClick={
        onClick
          ? (e: React.MouseEvent) => {
              e.stopPropagation();
              onClick();
            }
          : undefined
      }
      type={onClick ? "button" : undefined}
    >
      <span className="td-tag__dot" />
      {label}
    </Tag>
  );
}
