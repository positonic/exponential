/**
 * Section registry (ADR-0059): one module per section type. A template
 * section whose type has no module yields an empty section with a reason,
 * never a crash — the registry grows one action at a time.
 */
import type { SectionModule } from "../types";
import { okrReviewSection } from "./okr_review";

const MODULES: SectionModule[] = [okrReviewSection];

export const SECTION_REGISTRY: ReadonlyMap<string, SectionModule> = new Map(MODULES.map((m) => [m.type, m]));

export function getSectionModule(type: string): SectionModule | undefined {
  return SECTION_REGISTRY.get(type);
}
