"use client";

import {
  IconBrain,
  IconBulb,
  IconCalendarEvent,
  IconChartBar,
  IconClipboardCheck,
  IconCoffee,
  IconCompass,
  IconEye,
  IconFlag,
  IconHeartHandshake,
  IconListNumbers,
  IconMessages,
  IconMicrophone,
  IconPresentation,
  IconRocket,
  IconRotateClockwise2,
  IconRoute,
  IconSpeakerphone,
  IconStack2,
  IconSunrise,
  IconTarget,
  IconTargetArrow,
  IconUsersGroup,
  type Icon,
} from "@tabler/icons-react";
import { Tooltip, UnstyledButton } from "@mantine/core";
import type { CeremonyKind } from "@prisma/client";
import {
  CEREMONY_ICON_KEYS,
  type CeremonyIconKey,
  resolveCeremonyIcon,
} from "~/lib/ceremonies/icons";

export const CEREMONY_ICONS: Record<CeremonyIconKey, { icon: Icon; label: string }> = {
  target: { icon: IconTarget, label: "Target" },
  "target-arrow": { icon: IconTargetArrow, label: "Bullseye" },
  sunrise: { icon: IconSunrise, label: "Sunrise" },
  coffee: { icon: IconCoffee, label: "Coffee" },
  route: { icon: IconRoute, label: "Route" },
  calendar: { icon: IconCalendarEvent, label: "Calendar" },
  presentation: { icon: IconPresentation, label: "Presentation" },
  eye: { icon: IconEye, label: "Eye" },
  rotate: { icon: IconRotateClockwise2, label: "Loop" },
  "list-numbers": { icon: IconListNumbers, label: "Ranked list" },
  stack: { icon: IconStack2, label: "Stack" },
  speakerphone: { icon: IconSpeakerphone, label: "Megaphone" },
  "users-group": { icon: IconUsersGroup, label: "Group" },
  messages: { icon: IconMessages, label: "Conversation" },
  "heart-handshake": { icon: IconHeartHandshake, label: "Handshake" },
  "clipboard-check": { icon: IconClipboardCheck, label: "Checklist" },
  rocket: { icon: IconRocket, label: "Rocket" },
  bulb: { icon: IconBulb, label: "Idea" },
  brain: { icon: IconBrain, label: "Brain" },
  compass: { icon: IconCompass, label: "Compass" },
  flag: { icon: IconFlag, label: "Flag" },
  chart: { icon: IconChartBar, label: "Chart" },
};

const TILE_SIZES = {
  sm: { box: "h-7 w-7 rounded-[7px]", icon: 15 },
  md: { box: "h-9 w-9 rounded-[9px]", icon: 19 },
} as const;

interface CeremonyIconTileProps {
  /** Stored `Ceremony.icon`; null falls back to the kind's default. */
  icon?: string | null;
  kind?: CeremonyKind | null;
  size?: keyof typeof TILE_SIZES;
  className?: string;
}

/**
 * A ceremony's icon on a rounded, hairline-bordered tile. With no kind (a
 * meeting that belongs to no ceremony) it shows a neutral microphone so card
 * titles still line up.
 */
export function CeremonyIconTile({ icon, kind, size = "md", className = "" }: CeremonyIconTileProps) {
  const IconComponent = kind ? CEREMONY_ICONS[resolveCeremonyIcon(icon, kind)].icon : IconMicrophone;
  const s = TILE_SIZES[size];
  return (
    <div
      className={`flex shrink-0 items-center justify-center border border-border-subtle bg-background-primary ${
        kind ? "text-text-secondary" : "text-text-faint"
      } ${s.box} ${className}`}
      aria-hidden
    >
      <IconComponent size={s.icon} stroke={1.6} />
    </div>
  );
}

interface CeremonyIconPickerProps {
  /** Stored value; null means "use the kind's default". */
  value: string | null;
  kind: CeremonyKind;
  onChange: (icon: CeremonyIconKey) => void;
}

/** Grid of icon tiles; the resolved icon (explicit or kind default) is selected. */
export function CeremonyIconPicker({ value, kind, onChange }: CeremonyIconPickerProps) {
  const selected = resolveCeremonyIcon(value, kind);
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Ceremony icon" data-testid="ceremony-icon-picker">
      {CEREMONY_ICON_KEYS.map((key) => {
        const { icon: IconComponent, label } = CEREMONY_ICONS[key];
        const isSelected = key === selected;
        return (
          <Tooltip key={key} label={label} withArrow openDelay={300}>
            <UnstyledButton
              role="radio"
              aria-checked={isSelected}
              aria-label={label}
              onClick={() => onChange(key)}
              className={`flex h-9 w-9 items-center justify-center rounded-[9px] border transition-colors ${
                isSelected
                  ? "border-brand-400 bg-brand-400/10 text-brand-400"
                  : "border-border-subtle bg-background-primary text-text-secondary hover:border-border-strong hover:text-text-primary"
              }`}
            >
              <IconComponent size={19} stroke={1.6} />
            </UnstyledButton>
          </Tooltip>
        );
      })}
    </div>
  );
}
