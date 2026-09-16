import type { CeremonyKind } from "@prisma/client";

/**
 * The icons a ceremony can wear on its tile (meeting cards, settings list).
 * Keys are stored on `Ceremony.icon`; the React mapping lives in
 * `~/app/_components/ceremonies/CeremonyIcon`. Kept React-free so the router
 * can validate against the same list.
 */
export const CEREMONY_ICON_KEYS = [
  "target",
  "target-arrow",
  "sunrise",
  "coffee",
  "route",
  "calendar",
  "presentation",
  "eye",
  "rotate",
  "list-numbers",
  "stack",
  "speakerphone",
  "users-group",
  "messages",
  "heart-handshake",
  "clipboard-check",
  "rocket",
  "bulb",
  "brain",
  "compass",
  "flag",
  "chart",
] as const;

export type CeremonyIconKey = (typeof CEREMONY_ICON_KEYS)[number];

/** What a ceremony shows until someone picks an icon. */
export const DEFAULT_CEREMONY_ICON: Record<CeremonyKind, CeremonyIconKey> = {
  STANDUP: "sunrise",
  PLANNING: "route",
  REVIEW: "presentation",
  RETROSPECTIVE: "rotate",
  PRIORITISATION: "list-numbers",
  ALL_HANDS: "speakerphone",
  ONE_ON_ONE: "messages",
  CUSTOM: "target",
};

export function isCeremonyIconKey(value: unknown): value is CeremonyIconKey {
  return typeof value === "string" && (CEREMONY_ICON_KEYS as readonly string[]).includes(value);
}

/** The stored icon when it is a known key, else the kind's default. */
export function resolveCeremonyIcon(icon: string | null | undefined, kind: CeremonyKind): CeremonyIconKey {
  return isCeremonyIconKey(icon) ? icon : DEFAULT_CEREMONY_ICON[kind];
}
