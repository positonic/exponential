/**
 * evalPromptOrchestrator — the flywheel's verification step (ADR-0013).
 *
 * Scores a candidate brain prompt (whatever branch ../mastra has checked
 * out) against the stored EvalCase suite, offline:
 *
 *   export active EvalCases → ../mastra eval-replay subprocess (frozen
 *   prefix, one model call per case, tools captured as intent, never
 *   executed) → judge each regenerated response against the case's stored
 *   expectation → pass-rate diff vs baseline.
 *
 * The replay judge is the same versioned contract judge as live scoring
 * (JUDGE_MODEL / JUDGE_VERSION from AgentEvalService), so eval and live
 * numbers are comparable (ADR-0013 decision 2). This module keeps the
 * maths and judging pure/injectable; scripts/eval-prompt.ts does the I/O.
 */
import type Anthropic from "@anthropic-ai/sdk";

import {
  JUDGE_MODEL,
  JUDGE_VERSION,
  type TranscriptTurn,
} from "./AgentEvalService";

// ---------------------------------------------------------------------------
// Case export / replay result shapes (the contract with ../mastra's runner)
// ---------------------------------------------------------------------------

export interface ExportedEvalCase {
  id: string;
  conversationId: string;
  /** Full stored transcript; the runner derives the frozen prefix from it. */
  transcript: TranscriptTurn[];
  violatingTurnIndex: number;
  expectation: string;
  lane: string;
}

export interface ToolIntent {
  toolName: string;
  args: unknown;
}

/** One entry of the runner's results JSON. */
export interface ReplayCaseResult {
  caseId: string;
  expectation?: string;
  response: string;
  toolIntents: ToolIntent[];
  error?: string;
}

export interface ReplayOutput {
  brainVersion?: string;
  results: Array<ReplayCaseResult | null | undefined>;
}

// ---------------------------------------------------------------------------
// Per-case judging
// ---------------------------------------------------------------------------

export interface CaseVerdict {
  caseId: string;
  lane: string;
  passed: boolean;
  reasoning: string;
  /** Set when the runner errored on this case (auto-fail, judge not called). */
  error?: string;
}

/** A judged run, comparable across candidate/baseline. */
export interface JudgedRun {
  brainVersion: string | null;
  judgeModel: string;
  judgeVersion: string;
  verdicts: CaseVerdict[];
}

export type ReplayJudge = (params: {
  evalCase: ExportedEvalCase;
  response: string;
  toolIntents: ToolIntent[];
}) => Promise<{ passed: boolean; reasoning: string }>;

/** Render the frozen prefix the candidate saw, for the judge. */
export function formatPrefixForJudge(evalCase: ExportedEvalCase): string {
  const lines: string[] = [];
  for (let i = 0; i < evalCase.violatingTurnIndex; i++) {
    const turn = evalCase.transcript[i];
    if (!turn) continue;
    lines.push(`USER: ${turn.userMessage}`);
    lines.push(`ZOE: ${turn.aiResponse}`);
  }
  const violating = evalCase.transcript[evalCase.violatingTurnIndex];
  if (violating) lines.push(`USER: ${violating.userMessage}`);
  return lines.join("\n");
}

export const REPLAY_JUDGE_SYSTEM_PROMPT = `You are a quality judge for "Zoe", the AI assistant of Exponential (a task/project management product). This is an OFFLINE EVAL REPLAY: a failed conversation was frozen just before the turn that violated Zoe's contract, and a CANDIDATE version of Zoe has regenerated only that one response.

You are given:
- the frozen conversation prefix (ending with the user message being answered),
- the contract expectation the ORIGINAL response violated,
- the candidate's regenerated response text,
- the tool calls the candidate ATTEMPTED (captured as intent — they were never executed, so there are no tool results; attempting the right tool counts as taking the action).

Decide whether the candidate's response SATISFIES the stored expectation. Judge strictly against the expectation, not generic helpfulness. A response that calls the right tool but produces little or no text is a PASS when the expectation is about tool use. A response that fabricates data, deflects ("check your own list"), or ignores the expectation is a FAIL.`;

export const REPLAY_VERDICT_TOOL = {
  name: "record_replay_verdict",
  description: "Record the pass/fail verdict for one replayed eval case.",
  input_schema: {
    type: "object" as const,
    properties: {
      passed: {
        type: "boolean" as const,
        description: "Whether the candidate response satisfies the stored expectation.",
      },
      reasoning: {
        type: "string" as const,
        description: "One short paragraph explaining the verdict.",
      },
    },
    required: ["passed", "reasoning"],
  },
};

export function buildReplayJudgeUserMessage(params: {
  evalCase: ExportedEvalCase;
  response: string;
  toolIntents: ToolIntent[];
}): string {
  const { evalCase, response, toolIntents } = params;
  const intents =
    toolIntents.length > 0
      ? toolIntents
          .map((intent) => `- ${intent.toolName}(${JSON.stringify(intent.args ?? {})})`)
          .join("\n")
      : "(none)";
  return [
    `=== Frozen conversation prefix ===`,
    formatPrefixForJudge(evalCase),
    ``,
    `=== Violated contract expectation ===`,
    evalCase.expectation,
    ``,
    `=== Candidate's regenerated response ===`,
    response.trim().length > 0 ? response : "(no text — see tool intents)",
    ``,
    `=== Tool calls attempted by the candidate (intent only, never executed) ===`,
    intents,
  ].join("\n");
}

/** The real judge: Haiku via forced tool use — same model/version as live scoring. */
export function createAnthropicReplayJudge(client: Anthropic): ReplayJudge {
  return async ({ evalCase, response, toolIntents }) => {
    const apiResponse = await client.messages.create({
      model: JUDGE_MODEL,
      max_tokens: 512,
      system: REPLAY_JUDGE_SYSTEM_PROMPT,
      tools: [REPLAY_VERDICT_TOOL],
      tool_choice: { type: "tool", name: "record_replay_verdict" },
      messages: [
        {
          role: "user",
          content: buildReplayJudgeUserMessage({ evalCase, response, toolIntents }),
        },
      ],
    });
    const toolUse = apiResponse.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
    );
    if (!toolUse) {
      throw new Error(
        `Replay judge returned no tool_use block (stop_reason: ${apiResponse.stop_reason})`,
      );
    }
    const input = toolUse.input as { passed?: unknown; reasoning?: unknown };
    if (typeof input.passed !== "boolean" || typeof input.reasoning !== "string") {
      throw new Error(`Replay judge returned malformed verdict: ${JSON.stringify(input)}`);
    }
    return { passed: input.passed, reasoning: input.reasoning };
  };
}

/**
 * Judge every replayed case. Runner errors auto-fail without calling the
 * judge (a candidate that crashes the replay cannot pass); cases missing
 * from the results also auto-fail, loudly.
 */
export async function judgeReplayResults(
  cases: ExportedEvalCase[],
  replay: ReplayOutput,
  judge: ReplayJudge,
): Promise<JudgedRun> {
  const resultsByCase = new Map(
    replay.results
      .filter((result): result is ReplayCaseResult => Boolean(result))
      .map((result) => [result.caseId, result]),
  );

  const verdicts: CaseVerdict[] = [];
  for (const evalCase of cases) {
    const result = resultsByCase.get(evalCase.id);
    if (!result) {
      verdicts.push({
        caseId: evalCase.id,
        lane: evalCase.lane,
        passed: false,
        reasoning: "No replay result produced for this case.",
        error: "missing-result",
      });
      continue;
    }
    if (result.error) {
      verdicts.push({
        caseId: evalCase.id,
        lane: evalCase.lane,
        passed: false,
        reasoning: `Replay errored: ${result.error}`,
        error: result.error,
      });
      continue;
    }
    const verdict = await judge({
      evalCase,
      response: result.response,
      toolIntents: result.toolIntents,
    });
    verdicts.push({
      caseId: evalCase.id,
      lane: evalCase.lane,
      passed: verdict.passed,
      reasoning: verdict.reasoning,
    });
  }

  return {
    brainVersion: replay.brainVersion ?? null,
    judgeModel: JUDGE_MODEL,
    judgeVersion: JUDGE_VERSION,
    verdicts,
  };
}

// ---------------------------------------------------------------------------
// Pass-rate diff (pure)
// ---------------------------------------------------------------------------

export interface PassRateDiff {
  total: number;
  candidatePasses: number;
  /** Null when no baseline run was supplied. */
  baselinePasses: number | null;
  /** Cases that passed on baseline but fail on candidate. */
  regressions: string[];
  /** Cases that failed on baseline but pass on candidate. */
  fixes: string[];
}

export function diffRuns(
  candidate: CaseVerdict[],
  baseline: CaseVerdict[] | null,
): PassRateDiff {
  const candidatePasses = candidate.filter((v) => v.passed).length;
  if (!baseline) {
    return {
      total: candidate.length,
      candidatePasses,
      baselinePasses: null,
      regressions: [],
      fixes: [],
    };
  }
  const baselineByCase = new Map(baseline.map((v) => [v.caseId, v]));
  const regressions: string[] = [];
  const fixes: string[] = [];
  for (const verdict of candidate) {
    const base = baselineByCase.get(verdict.caseId);
    if (!base) continue; // case unseen by baseline — neither regression nor fix
    if (base.passed && !verdict.passed) regressions.push(verdict.caseId);
    if (!base.passed && verdict.passed) fixes.push(verdict.caseId);
  }
  // Baseline pass count over the candidate's case set, so N/M and K/M share M.
  const baselinePasses = candidate.filter(
    (v) => baselineByCase.get(v.caseId)?.passed,
  ).length;
  return {
    total: candidate.length,
    candidatePasses,
    baselinePasses,
    regressions,
    fixes,
  };
}

// ---------------------------------------------------------------------------
// Evidence block (PR-pasteable)
// ---------------------------------------------------------------------------

export function formatEvidenceBlock(params: {
  diff: PassRateDiff;
  candidate: JudgedRun;
  baseline: JudgedRun | null;
}): string {
  const { diff, candidate, baseline } = params;
  const lines: string[] = [];

  lines.push(`## Eval evidence (ADR-0013)`);
  lines.push(``);
  const headline =
    diff.baselinePasses === null
      ? `Candidate passes **${diff.candidatePasses}/${diff.total}** (no baseline supplied)`
      : `Candidate passes **${diff.candidatePasses}/${diff.total}** vs baseline **${diff.baselinePasses}/${diff.total}**`;
  lines.push(headline);
  lines.push(``);
  lines.push(`- Candidate prompt: \`${candidate.brainVersion ?? "unknown"}\``);
  if (baseline) {
    lines.push(`- Baseline prompt: \`${baseline.brainVersion ?? "unknown"}\``);
  }
  lines.push(`- Judge: \`${candidate.judgeModel}\` (prompt \`${candidate.judgeVersion}\`)`);
  lines.push(``);

  if (diff.baselinePasses !== null) {
    lines.push(
      diff.regressions.length === 0
        ? `**Regressions: none**`
        : `**Regressions (${diff.regressions.length})**: ${diff.regressions.join(", ")}`,
    );
    if (diff.fixes.length > 0) {
      lines.push(`**Newly passing (${diff.fixes.length})**: ${diff.fixes.join(", ")}`);
    }
    lines.push(``);
  }

  lines.push(`| Case | Lane | Verdict | Reasoning |`);
  lines.push(`|------|------|---------|-----------|`);
  for (const verdict of candidate.verdicts) {
    const flat = verdict.reasoning.replace(/\s+/g, " ").trim();
    const clipped = flat.length > 140 ? `${flat.slice(0, 139)}…` : flat;
    lines.push(
      `| ${verdict.caseId} | ${verdict.lane} | ${verdict.passed ? "✅ pass" : "❌ fail"} | ${clipped.replace(/\|/g, "\\|")} |`,
    );
  }

  return lines.join("\n");
}
