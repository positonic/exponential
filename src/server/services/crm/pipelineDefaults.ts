/**
 * Project statuses that take a pipeline out of the running as a workspace's
 * *default* board (the one `pipeline.get` / `crmApi.pipelineGet` fall back to
 * when no `pipelineId` is given). A retired pipeline stays addressable by id.
 *
 * Without this, the oldest pipeline wins on age alone — so a cancelled, empty
 * board created before multi-pipeline (ADR-0033) shadows every live one for
 * CLI/SDK callers that never pass an id.
 */
export const RETIRED_PIPELINE_STATUSES = ["CANCELLED", "COMPLETED"] as const;
