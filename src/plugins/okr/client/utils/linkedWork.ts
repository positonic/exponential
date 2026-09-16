/**
 * Shared vocabulary for a key result's "Executing work" list (ADR-0050).
 *
 * A row is a Project, a Pipeline or a Feature. A CRM pipeline is a Project
 * with `type = "pipeline"` and links to a KR through the ordinary project
 * edge — it only differs in the chip it wears and where it deep-links.
 */
export type LinkedWorkKind = "project" | "pipeline" | "feature";

export const LINKED_WORK_LABEL: Record<LinkedWorkKind, string> = {
  project: "Project",
  pipeline: "Pipeline",
  feature: "Feature",
};

const PIPELINE_PROJECT_TYPE = "pipeline";

/** Row kind for a linked Project, from its `Project.type` column. */
export function linkedProjectKind(
  type: string | null | undefined,
): Extract<LinkedWorkKind, "project" | "pipeline"> {
  return type === PIPELINE_PROJECT_TYPE ? "pipeline" : "project";
}

/** Deep link to the CRM board with this pipeline pre-selected. */
export function pipelineBoardHref(
  workspaceSlug: string,
  pipelineId: string,
): string {
  return `/w/${workspaceSlug}/crm/pipeline?pipeline=${encodeURIComponent(pipelineId)}`;
}
