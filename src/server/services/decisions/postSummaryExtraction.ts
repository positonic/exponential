/**
 * Opt-in post-summary decision extraction (Decisions V2, ADR-0060).
 *
 * The workspace setting this gate should read does not exist yet: adding
 * `Workspace.enableDecisionExtraction Boolean @default(false)` is a schema
 * change, which lands in a migration James runs by hand (see the ticket
 * comment). Until that column exists the gate is the
 * `DECISION_EXTRACTION_WORKSPACES` environment variable — a comma-separated
 * list of workspace ids, or `*` for every workspace — so the hook is
 * deployable and off by default. Swapping the gate for the column is a
 * one-function change here.
 */

const ENV_KEY = "DECISION_EXTRACTION_WORKSPACES";

export function isPostSummaryDecisionExtractionEnabled(
  workspaceId: string | null,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (!workspaceId) return false;
  const raw = env[ENV_KEY]?.trim() ?? "";
  if (raw.length === 0) return false;
  const entries = raw.split(",").map((entry) => entry.trim()).filter((entry) => entry.length > 0);
  return entries.includes("*") || entries.includes(workspaceId);
}
