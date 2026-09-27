/**
 * Sections a ceremony carries without listing them in its template.
 *
 * `Ceremony.includeProjects` (on by default) appends a `linked_projects`
 * section — the ACTIVE projects in the ceremony's scope (its linked projects,
 * its product's, its team's), with DRI and next action — to every generated
 * agenda. The template wins when it already places one (so the owner can put
 * it anywhere in the running order), and the appended section is dropped
 * again when the query found nothing, so a ceremony linked to no projects
 * never shows an empty "Projects" box. A hand-added item keeps the section
 * alive: it is not derived from a query and must survive regeneration like
 * every other hand item.
 */
import type { AgendaSnapshot, AgendaTemplateSection } from "./types";

export const LINKED_PROJECTS_TYPE = "linked_projects";
/** Key of the appended section; stable so hand items and resolutions carry across regenerations. */
export const AUTO_PROJECTS_KEY = "auto_linked_projects";

export function withAutoProjectsSection(
  template: AgendaTemplateSection[],
  includeProjects: boolean,
): AgendaTemplateSection[] {
  if (!includeProjects) return template;
  if (template.some((s) => s.type === LINKED_PROJECTS_TYPE)) return template;
  return [...template, { key: AUTO_PROJECTS_KEY, type: LINKED_PROJECTS_TYPE, title: "Projects" }];
}

/** The appended section, when it ended up with nothing in it, is not shown. */
export function dropEmptyAutoSections(agenda: AgendaSnapshot): AgendaSnapshot {
  const sections = agenda.sections.filter((s) => s.key !== AUTO_PROJECTS_KEY || s.items.length > 0);
  return sections.length === agenda.sections.length ? agenda : { ...agenda, sections };
}
