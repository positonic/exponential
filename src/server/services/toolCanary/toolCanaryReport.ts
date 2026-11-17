import { z } from "zod";

import { classifyToolError, isReportableToolError, summarizeToolError } from "~/lib/chat/toolErrors";
import type { ClientErrorReport } from "~/server/services/clientErrors/clientErrorBug";

/**
 * The tool canary's report, as the assistant service returns it from
 * `POST /api/ops/tool-canary` (Mastra repo, `src/mastra/canary/tool-canary.ts`),
 * and the pure step that turns it into things to file.
 *
 * The canary calls every agent tool that reads from the app, with a fixed
 * input, against a non-production app. It only reports; deciding what is a
 * fault, which ticket it belongs on and what the ops room hears is done here,
 * where the ticket ingest lives.
 */

const probeSchema = z.object({
  name: z.string(),
  toolId: z.string(),
  kind: z.enum(["read", "write", "external"]),
  procedures: z.array(z.string()),
  status: z.enum(["ok", "failed", "skipped"]),
  durationMs: z.number().optional(),
  reason: z.string().optional(),
  errorKind: z.enum(["threw", "output-schema", "input-schema", "timeout"]).optional(),
  error: z.string().optional(),
  embeds: z.boolean().optional(),
});

export const toolCanaryReportSchema = z.object({
  version: z.literal(1),
  startedAt: z.string(),
  finishedAt: z.string(),
  durationMs: z.number(),
  target: z.object({ origin: z.string(), workspaceId: z.string() }),
  preflight: z.union([
    z.object({ ok: z.literal(true) }),
    z.object({ ok: z.literal(false), kind: z.enum(["unreachable", "auth", "workspace"]), error: z.string() }),
  ]),
  tools: z.array(probeSchema),
  counts: z.object({ total: z.number(), ok: z.number(), failed: z.number(), skipped: z.number() }),
});

export type ToolCanaryReport = z.infer<typeof toolCanaryReportSchema>;
export type ToolProbe = z.infer<typeof probeSchema>;

/** Area for faults in the canary itself: its target, its fixture, its runner. */
export const TOOL_CANARY_AREA = "tool-canary";
/** Area PR 1184's chat route files broken tools under. Reused so both land on one ticket. */
export const AGENT_TOOL_AREA = "agent-tool";

/** Keys of the canary's own subjects. A tool's key is `tool:<name>`. */
export const RUNNER_SUBJECT = "runner";
export const TARGET_SUBJECT = "target";
export const UNCHECKED_SUBJECT = "unchecked";

export const toolSubjectKey = (toolName: string) => `tool:${toolName}`;

/**
 * One thing the canary has an opinion about in this run: a tool, its target,
 * or the tools it could not check. `failing` carries the report to file;
 * `ok` is what lets an earlier failure be announced as recovered.
 */
export type CanarySubject =
  | { key: string; label: string; state: "ok" }
  | { key: string; label: string; state: "failing"; report: ClientErrorReport };

/** Mastra appends the whole returned payload; the fields above it are the fault. */
function outputSchemaSummary(message: string): string {
  return (message.split("\n\nReturned output")[0] ?? message).trim();
}

function brokenToolReport(probe: ToolProbe, rawError: string, report: ToolCanaryReport): ClientErrorReport {
  return {
    area: AGENT_TOOL_AREA,
    // The same title the chat route builds for a failed call, so a fault seen
    // by both the canary and a person's chat collapses onto one ticket.
    message: summarizeToolError(probe.name, rawError),
    context: {
      tool: probe.name,
      toolErrorKind: classifyToolError(rawError),
      platform: "tool-canary",
      procedures: probe.procedures.join(", "),
      target: report.target.origin,
      rawError: rawError.slice(0, 1500),
    },
  };
}

/**
 * Sort a report into subjects.
 *
 * - Target unusable: one `target` failure and nothing else. A dead target
 *   says nothing about any tool, so no tool is blamed and none is declared
 *   recovered.
 * - A tool the app rejected, that failed server-side, or whose answer fails
 *   its own output schema: a `tool:<name>` failure, filed as `agent-tool`.
 * - A tool that failed for a reason that is not the tool's (not found,
 *   forbidden, timeout, a stale sample input): gathered into one `unchecked`
 *   failure. These are the fixture's or the canary's to fix, and one ticket
 *   per tool would bury the real faults.
 * - A tool that answered: `ok`. Skipped tools have no subject: a skip neither
 *   breaks nor recovers anything.
 */
export function canarySubjects(report: ToolCanaryReport): CanarySubject[] {
  if (!report.preflight.ok) {
    return [
      {
        key: TARGET_SUBJECT,
        label: "the canary's target",
        state: "failing",
        report: {
          area: TOOL_CANARY_AREA,
          message: `the tool canary could not use its target (${report.preflight.kind})`,
          context: {
            target: report.target.origin,
            workspace: report.target.workspaceId,
            detail: report.preflight.error.slice(0, 1500),
          },
        },
      },
    ];
  }

  const subjects: CanarySubject[] = [{ key: TARGET_SUBJECT, label: "the canary's target", state: "ok" }];
  const unchecked: ToolProbe[] = [];

  for (const probe of report.tools) {
    const key = toolSubjectKey(probe.name);
    if (probe.status === "ok") {
      subjects.push({ key, label: probe.name, state: "ok" });
      continue;
    }
    if (probe.status !== "failed") continue;

    if (probe.errorKind === "output-schema") {
      const raw = `ZodError: output failed its schema: ${outputSchemaSummary(probe.error ?? "")}`;
      subjects.push({ key, label: probe.name, state: "failing", report: brokenToolReport(probe, raw, report) });
    } else if (probe.errorKind === "threw" && isReportableToolError(classifyToolError(probe.error))) {
      subjects.push({ key, label: probe.name, state: "failing", report: brokenToolReport(probe, probe.error ?? "", report) });
    } else {
      unchecked.push(probe);
    }
  }

  if (unchecked.length === 0) {
    subjects.push({ key: UNCHECKED_SUBJECT, label: "tools the canary could not check", state: "ok" });
  } else {
    subjects.push({
      key: UNCHECKED_SUBJECT,
      label: "tools the canary could not check",
      state: "failing",
      report: {
        area: TOOL_CANARY_AREA,
        // No names or counts in the title: it is the dedup key, and the set
        // of affected tools changes from run to run.
        message: "the tool canary could not check some tools (fixture, access or timeout)",
        context: {
          target: report.target.origin,
          tools: unchecked
            .map((probe) => `${probe.name} (${probe.errorKind === "threw" ? classifyToolError(probe.error) : probe.errorKind ?? "unknown"})`)
            .join(", ")
            .slice(0, 1500),
          firstError: (unchecked[0]?.error ?? "").slice(0, 1500),
        },
      },
    });
  }

  return subjects;
}
