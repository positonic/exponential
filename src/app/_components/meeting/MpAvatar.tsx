import type { ParticipantFlavor } from "~/lib/meeting-view-model";

interface MpAvatarProps {
  initial: string;
  flavor: ParticipantFlavor;
  className?: string;
  title?: string;
}

/** Identity-coloured initials avatar for the meeting detail page. Blue (`me`)
 *  is the host/you; other participants rotate through the identity palette. */
export function MpAvatar({ initial, flavor, className, title }: MpAvatarProps) {
  return (
    <span className={`mp-av mp-av--${flavor}${className ? ` ${className}` : ""}`} title={title}>
      {initial}
    </span>
  );
}
