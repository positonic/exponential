/**
 * Built-in ceremony templates (ADR-0059), one per kind the operating rhythm
 * needs. A template is the definition without the workspace-specific parts
 * (owner, participants, time zone, anchor date); "Add from template" in
 * Settings → Ceremonies pre-fills the editor with one, and `importDefinitions`
 * accepts the same shape as JSON. Agenda section types are the registry keys
 * the V2 agenda generator binds queries to; until V2 lands they are stored
 * on the ceremony and shown as the planned running order.
 */
import type { CeremonyKind } from "@prisma/client";

export type AgendaSectionType =
  | "blockers"
  | "carried_over"
  | "decisions_pending"
  | "okr_review"
  | "cycle_progress"
  | "retro_actions"
  | "free_text";

export const AGENDA_SECTION_TYPES: ReadonlyArray<{ value: AgendaSectionType; label: string; hint: string }> = [
  { value: "blockers", label: "Blockers", hint: "Participants' overdue or blocked Actions" },
  { value: "carried_over", label: "Carried over", hint: "Unresolved items from the previous occurrence" },
  { value: "decisions_pending", label: "Decisions pending", hint: "Open and proposed Decisions in scope" },
  { value: "okr_review", label: "OKR review", hint: "Key results without a recent check-in or with a status change" },
  { value: "cycle_progress", label: "Cycle progress", hint: "Latest cycle snapshot and tickets moved" },
  { value: "retro_actions", label: "Retro actions", hint: "Actions from the previous retrospective, with status" },
  { value: "free_text", label: "Free text", hint: "Owner-written items" },
];

export interface AgendaSectionTemplate {
  key: string;
  type: AgendaSectionType;
  title: string;
  minutes?: number;
  config?: Record<string, unknown>;
}

export interface CeremonyTemplate {
  kind: CeremonyKind;
  name: string;
  slug: string;
  aliases: string[];
  purpose: string;
  notFor: string;
  inputs: string;
  outputs: string;
  /** Bare RRULE body; the editor's structured picker can read it back. */
  cadenceRule: string;
  durationMinutes: number;
  leadTimeHours: number;
  agendaTemplate: AgendaSectionTemplate[];
}

export const CEREMONY_TEMPLATES: readonly CeremonyTemplate[] = [
  {
    kind: "STANDUP",
    name: "Daily Standup",
    slug: "daily-standup",
    aliases: ["Daily Standup", "Standup", "Daily"],
    purpose: "Surface blockers and align on today's priorities in fifteen minutes.",
    notFor:
      "- Prioritisation debates (take them to the prioritisation ceremony)\n- Design discussions\n- Status reports for their own sake",
    inputs: "- Each participant's Actions completed since the last standup\n- Anything flagged as blocked",
    outputs: "- Every blocker has an owner\n- Parking-lot topics carried to the right ceremony",
    cadenceRule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=9;BYMINUTE=30",
    durationMinutes: 15,
    leadTimeHours: 12,
    agendaTemplate: [
      { key: "blockers", type: "blockers", title: "Blockers", minutes: 5 },
      { key: "carried_over", type: "carried_over", title: "Carried over", minutes: 5 },
      { key: "free_text", type: "free_text", title: "Anything else", minutes: 5 },
    ],
  },
  {
    kind: "PLANNING",
    name: "Cycle Planning",
    slug: "cycle-planning",
    aliases: ["Planning Meeting", "Cycle Planning", "Sprint Planning", "Planning"],
    purpose: "Commit the team to a realistic scope for the next cycle from an already-prioritised backlog.",
    notFor: "- Discovering priorities (that is the prioritisation ceremony)\n- Estimating everything in the backlog",
    inputs: "- Prioritised backlog\n- Capacity for the cycle\n- Carry-over from the last cycle",
    outputs: "- A committed cycle with owners on every ticket\n- Explicit deferrals",
    cadenceRule: "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO;BYHOUR=11;BYMINUTE=0",
    durationMinutes: 60,
    leadTimeHours: 24,
    agendaTemplate: [
      { key: "cycle_progress", type: "cycle_progress", title: "Last cycle", minutes: 10 },
      { key: "carried_over", type: "carried_over", title: "Carry-over", minutes: 10 },
      { key: "decisions_pending", type: "decisions_pending", title: "Open decisions that block planning", minutes: 10 },
      { key: "free_text", type: "free_text", title: "Scope for this cycle", minutes: 30 },
    ],
  },
  {
    kind: "REVIEW",
    name: "Review & Demo",
    slug: "review-and-demo",
    aliases: ["Review", "Demo", "Sprint Review", "Review & Demo"],
    purpose: "Show what shipped, against what was committed, to the people who asked for it.",
    notFor: "- Retrospective discussion of how the work went\n- Planning the next cycle",
    inputs: "- Tickets closed this cycle\n- Working software to demo",
    outputs: "- Feedback captured as Actions or tickets\n- Acceptance or rework decisions",
    cadenceRule: "FREQ=WEEKLY;INTERVAL=2;BYDAY=FR;BYHOUR=14;BYMINUTE=0",
    durationMinutes: 45,
    leadTimeHours: 24,
    agendaTemplate: [
      { key: "cycle_progress", type: "cycle_progress", title: "Committed vs shipped", minutes: 10 },
      { key: "free_text", type: "free_text", title: "Demos", minutes: 30 },
      { key: "decisions_pending", type: "decisions_pending", title: "Decisions for the room", minutes: 5 },
    ],
  },
  {
    kind: "RETROSPECTIVE",
    name: "Retrospective",
    slug: "retrospective",
    aliases: ["Retro", "Retrospective"],
    purpose: "Improve how the team works by turning last cycle's friction into a few owned actions.",
    notFor: "- Blame\n- Re-litigating product decisions",
    inputs: "- Actions from the previous retrospective, with status\n- Cycle metrics",
    outputs: "- At most three improvement Actions, each with an owner and a date",
    cadenceRule: "FREQ=WEEKLY;INTERVAL=2;BYDAY=FR;BYHOUR=15;BYMINUTE=0",
    durationMinutes: 45,
    leadTimeHours: 24,
    agendaTemplate: [
      { key: "retro_actions", type: "retro_actions", title: "Last retro's actions", minutes: 10 },
      { key: "cycle_progress", type: "cycle_progress", title: "The cycle in numbers", minutes: 5 },
      { key: "free_text", type: "free_text", title: "Went well / went poorly", minutes: 20 },
      { key: "free_text_actions", type: "free_text", title: "Actions", minutes: 10 },
    ],
  },
  {
    kind: "PRIORITISATION",
    name: "Product Prioritisation",
    slug: "product-prioritisation",
    aliases: ["Prioritisation", "Prioritization", "Product Prioritisation", "Backlog Review"],
    purpose: "Decide what the team works on next, with the evidence in the room, so standups stop turning into this meeting.",
    notFor: "- Detailed estimation\n- Solution design",
    inputs: "- Open and proposed Decisions\n- Objectives and key results at risk\n- Candidate features and insights",
    outputs: "- An ordered backlog for the next planning\n- Decisions logged, with rationale",
    cadenceRule: "FREQ=WEEKLY;BYDAY=WE;BYHOUR=14;BYMINUTE=0",
    durationMinutes: 60,
    leadTimeHours: 24,
    agendaTemplate: [
      { key: "okr_review", type: "okr_review", title: "Objectives and key results", minutes: 15 },
      { key: "decisions_pending", type: "decisions_pending", title: "Decisions pending", minutes: 20 },
      { key: "carried_over", type: "carried_over", title: "Carried over", minutes: 10 },
      { key: "free_text", type: "free_text", title: "Candidates", minutes: 15 },
    ],
  },
  {
    kind: "ALL_HANDS",
    name: "All Hands",
    slug: "all-hands",
    aliases: ["All Hands", "All-Hands", "Town Hall", "Company Meeting"],
    purpose: "Keep everyone aligned on direction, progress and what changed since last time.",
    notFor: "- Team-level detail\n- Decisions that need a smaller room",
    inputs: "- Objective progress\n- Decisions made since the last all-hands",
    outputs: "- Questions captured and answered or owned",
    cadenceRule: "FREQ=MONTHLY;BYDAY=1TH;BYHOUR=16;BYMINUTE=0",
    durationMinutes: 45,
    leadTimeHours: 48,
    agendaTemplate: [
      { key: "okr_review", type: "okr_review", title: "Where we are against the objectives", minutes: 15 },
      { key: "decisions_pending", type: "decisions_pending", title: "Decisions since last time", minutes: 10 },
      { key: "free_text", type: "free_text", title: "Questions", minutes: 20 },
    ],
  },
];

export function findTemplate(kindOrSlug: string): CeremonyTemplate | undefined {
  return CEREMONY_TEMPLATES.find((t) => t.kind === kindOrSlug || t.slug === kindOrSlug);
}
