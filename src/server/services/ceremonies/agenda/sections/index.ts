/**
 * Section registry (ADR-0059): one module per section type. A template
 * section whose type has no module yields an empty section with a reason,
 * never a crash — the registry grows one action at a time.
 */
import type { SectionModule } from "../types";
import { okrReviewSection } from "./okr_review";
import { blockersSection } from "./blockers";
import { carriedOverSection } from "./carried_over";
import { cycleProgressSection } from "./cycle_progress";
import { retroActionsSection } from "./retro_actions";
import { freeTextSection } from "./free_text";
import { decisionsPendingSection } from "./decisions_pending";
import { yesterdaySection } from "./yesterday";
import { todaysMeetingsSection } from "./todays_meetings";
import { todaysActionsSection } from "./todays_actions";
import { upNextSection } from "./up_next";
import { driProjectsSection } from "./dri_projects";

const MODULES: SectionModule[] = [
  okrReviewSection,
  blockersSection,
  carriedOverSection,
  cycleProgressSection,
  retroActionsSection,
  freeTextSection,
  decisionsPendingSection,
  // Daily brief (the ceremony a person holds with themselves each morning)
  yesterdaySection,
  todaysMeetingsSection,
  todaysActionsSection,
  upNextSection,
  driProjectsSection,
];

export const SECTION_REGISTRY: ReadonlyMap<string, SectionModule> = new Map(MODULES.map((m) => [m.type, m]));

export function getSectionModule(type: string): SectionModule | undefined {
  return SECTION_REGISTRY.get(type);
}
