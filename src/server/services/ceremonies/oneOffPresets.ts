/**
 * One-off agenda presets (ADR-0059 amendment, 2026-10-07): the sections that
 * make sense without a previous occurrence, and the purpose presets the
 * schedule-meeting modal offers over them. Pure — imported by the modal as
 * well as the booking path, like `templates.ts`.
 */
import { AGENDA_SECTION_TYPES, type AgendaSectionTemplate, type AgendaSectionType } from "./templates";

/** The section types a one-off agenda may carry; recurring-only ones are refused. */
export const ONE_OFF_SECTION_TYPES = [
  "project_state",
  "blockers",
  "decisions_pending",
  "okr_review",
  "linked_projects",
  "free_text",
] as const satisfies readonly AgendaSectionType[];

export type OneOffSectionType = (typeof ONE_OFF_SECTION_TYPES)[number];

export interface OneOffPreset {
  key: string;
  label: string;
  sections: Array<{ type: OneOffSectionType; title: string }>;
}

/** A section's default heading; free text reads as "Discussion" on an agenda, not as its settings label. */
const label = (type: OneOffSectionType) =>
  type === "free_text" ? "Discussion" : (AGENDA_SECTION_TYPES.find((t) => t.value === type)?.label ?? type);

export const ONE_OFF_PRESETS: readonly OneOffPreset[] = [
  {
    key: "decide",
    label: "Decide something",
    sections: [
      { type: "decisions_pending", title: "Decisions for the room" },
      { type: "project_state", title: label("project_state") },
      { type: "free_text", title: "The decision" },
    ],
  },
  {
    key: "review",
    label: "Review progress",
    sections: [
      { type: "project_state", title: label("project_state") },
      { type: "okr_review", title: label("okr_review") },
      { type: "blockers", title: label("blockers") },
      { type: "free_text", title: "Discussion" },
    ],
  },
  {
    key: "unblock",
    label: "Unblock",
    sections: [
      { type: "blockers", title: label("blockers") },
      { type: "project_state", title: label("project_state") },
      { type: "free_text", title: "What would unblock us" },
    ],
  },
  {
    key: "plan",
    label: "Plan next steps",
    sections: [
      { type: "project_state", title: label("project_state") },
      { type: "decisions_pending", title: label("decisions_pending") },
      { type: "free_text", title: "Next steps" },
    ],
  },
  {
    key: "kickoff",
    label: "Kick off",
    sections: [
      { type: "project_state", title: label("project_state") },
      { type: "okr_review", title: label("okr_review") },
      { type: "free_text", title: "Context" },
    ],
  },
  {
    key: "external",
    label: "Sync with an external party",
    sections: [
      { type: "project_state", title: label("project_state") },
      { type: "free_text", title: "Talking points" },
    ],
  },
];

export const DEFAULT_ONE_OFF_PRESET = "review";

/**
 * The agenda template for a one-off: the ticked section types in order (the
 * "Review progress" preset when none are given), titled from the preset when
 * it names that type, else from the section's label. The purpose is always
 * item 1 of the first `free_text` section; a template without one gets a
 * "Discussion" section to carry it.
 */
export function buildOneOffAgendaTemplate(input: {
  purpose: string;
  sectionTypes?: OneOffSectionType[];
  presetKey?: string;
}): AgendaSectionTemplate[] {
  const preset =
    ONE_OFF_PRESETS.find((p) => p.key === input.presetKey) ??
    (input.sectionTypes ? undefined : ONE_OFF_PRESETS.find((p) => p.key === DEFAULT_ONE_OFF_PRESET));
  const types = input.sectionTypes ?? preset?.sections.map((s) => s.type) ?? [];

  const sections: AgendaSectionTemplate[] = Array.from(new Set(types)).map((type) => ({
    key: type,
    type,
    title: preset?.sections.find((s) => s.type === type)?.title ?? label(type),
  }));

  let carrier = sections.find((s) => s.type === "free_text");
  if (!carrier) {
    carrier = { key: "free_text", type: "free_text", title: "Discussion" };
    sections.push(carrier);
  }
  carrier.config = { items: [input.purpose] };
  return sections;
}
