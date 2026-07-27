import {
  IconBulb,
  IconEye,
  IconHeart,
  IconMap,
  IconMessageCircle,
  IconSpy,
  IconTargetArrow,
  IconUser,
  type Icon as TablerIcon,
} from "@tabler/icons-react";
import type { ColumnAccent } from "~/app/_components/shared/kanban";

/**
 * Shared insight vocabulary (ADR-0036). PROBLEM is a first-class insight type
 * now that the Problem model is retired. Used by the Insights list, its create
 * modal, and the insights kanban card.
 */
export const INSIGHT_TYPES = [
  { value: "PAIN_POINT", label: "Pain point", icon: IconHeart, color: "red" },
  { value: "OPPORTUNITY", label: "Opportunity", icon: IconBulb, color: "yellow" },
  { value: "FEEDBACK", label: "Feedback", icon: IconMessageCircle, color: "blue" },
  { value: "PERSONA", label: "Persona", icon: IconUser, color: "grape" },
  { value: "JOURNEY", label: "Journey", icon: IconMap, color: "teal" },
  { value: "OBSERVATION", label: "Observation", icon: IconEye, color: "orange" },
  { value: "COMPETITIVE", label: "Competitive", icon: IconSpy, color: "indigo" },
  { value: "PROBLEM", label: "Problem", icon: IconTargetArrow, color: "grape" },
] as const;

export type InsightType = (typeof INSIGHT_TYPES)[number]["value"];

export const TYPE_MAP: Record<string, { value: string; label: string; icon: TablerIcon; color: string }> =
  Object.fromEntries(INSIGHT_TYPES.map((t) => [t.value, t]));

/**
 * Insight status is the triage DECISION, not a lifecycle: INBOX = not yet
 * reviewed, TRIAGED (shown as "Accepted") = reviewed and kept, DISMISSED =
 * reviewed and rejected. "Reviewed" is the transition out of INBOX, never a
 * state. Feature linkage is a relational fact (FeatureInsight), not a status -
 * the DB enum's legacy LINKED value is coalesced to TRIAGED at read in the
 * insight router and must not reach the client.
 */
export type InsightStatus = "INBOX" | "TRIAGED" | "DISMISSED";

export const STATUS_OPTIONS: { value: InsightStatus; label: string }[] = [
  { value: "INBOX", label: "Inbox" },
  { value: "TRIAGED", label: "Accepted" },
  { value: "DISMISSED", label: "Dismissed" },
];

export const STATUS_COLORS: Record<string, string> = {
  INBOX: "gray",
  TRIAGED: "blue",
  DISMISSED: "dark",
};

/**
 * Types that may be published to the public feedback board (user-voice only;
 * mirrors PUBLISHABLE_TYPES in the insight router, which enforces it).
 */
export const PUBLISHABLE_INSIGHT_TYPES: string[] = [
  "FEEDBACK",
  "PAIN_POINT",
  "OPPORTUNITY",
];

export const SENTIMENT_COLORS: Record<string, string> = {
  positive: "green",
  neutral: "gray",
  negative: "red",
};

/** Kanban columns for the insights board - the three InsightStatus values. */
export const INSIGHT_STATUS_COLUMNS: { id: InsightStatus; title: string; accent: ColumnAccent }[] = [
  { id: "INBOX", title: "Inbox", accent: "slate" },
  { id: "TRIAGED", title: "Accepted", accent: "brand" },
  { id: "DISMISSED", title: "Dismissed", accent: "red" },
];
