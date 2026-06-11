/**
 * AgentEvalService — trigger-agnostic Thread judge (ADR-0012).
 *
 * Finds settled Threads (conversationId-scoped exchanges with Zoe-the-brain,
 * no turn in the last hour), reconstructs the transcript from
 * AiInteractionHistory, judges it with Haiku 4.5 against Zoe's contract, and
 * writes a ThreadScore row (plus an EvalCase for failures — decision 8).
 *
 * Scope (decision 1): brain-reasoned platforms only. Coarse voice-tool turns
 * are deterministic (no LLM) and excluded; iOS perpetual `voice-${userId}`
 * threads are deferred until iOS issues a per-exchange conversationId
 * (ADR-0006). Both remain explicitly unmeasured gaps.
 *
 * Idempotent: a conversationId already present in ThreadScore is never
 * re-judged, so any trigger (manual script today, cron later) can run over
 * the full backlog safely.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";

/** Versioned judge prompt (ADR-0012 decision 9). Bump on any rubric/prompt change. */
export const JUDGE_VERSION = "v1";

export const JUDGE_MODEL = "claude-haiku-4-5-20251001";

/** A Thread is settled when it has had no turn for this long (decision 6). */
export const SETTLED_AFTER_MS = 60 * 60 * 1000;

/**
 * Platforms where the brain actually reasoned (decision 1):
 * - "web"      — typed web chat (/api/chat/stream)
 * - "manychat" — WhatsApp via ManyChat (same stream route)
 * - "slack"    — Slack bot turns
 * - "api"      — API/webhook callers
 * - "direct"   — mastra.sendMessage tRPC path
 * Excluded: "voice" (coarse-tool dispatcher + realtime transcript duplicates —
 * deterministic router turns, not brain reasoning).
 */
export const BRAIN_REASONED_PLATFORMS = [
  "web",
  "manychat",
  "slack",
  "api",
  "direct",
] as const;

export const FAILURE_LANES = [
  "code_bug",
  "agent_behaviour",
  "capability_gap",
] as const;
export type FailureLane = (typeof FAILURE_LANES)[number];

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested)
// ---------------------------------------------------------------------------

/** iOS voice threads are perpetual `voice-${userId}` — deferred per ADR-0012. */
export function isIosPerpetualThread(conversationId: string): boolean {
  return conversationId.startsWith("voice-");
}

/** Settled = no turn within SETTLED_AFTER_MS of `now`. */
export function isSettled(lastTurnAt: Date, now: Date = new Date()): boolean {
  return now.getTime() - lastTurnAt.getTime() >= SETTLED_AFTER_MS;
}

export interface ScoredThreadSummary {
  conversationId: string;
  overallScore: number;
  failureLane: string | null;
  reasoning: string;
  expectation: string | null;
}

export interface LaneReportEntry {
  lane: string;
  count: number;
  /** Worst examples first (lowest overallScore). */
  examples: ScoredThreadSummary[];
}

/**
 * Level-A report (decision 6): ranked failures grouped by lane. Lanes sorted
 * by failure count desc; within a lane, worst (lowest-scoring) Threads first.
 */
export function buildLaneReport(
  scores: ScoredThreadSummary[],
  examplesPerLane = 3,
): LaneReportEntry[] {
  const byLane = new Map<string, ScoredThreadSummary[]>();
  for (const score of scores) {
    if (score.failureLane === null) continue;
    const bucket = byLane.get(score.failureLane) ?? [];
    bucket.push(score);
    byLane.set(score.failureLane, bucket);
  }
  return [...byLane.entries()]
    .map(([lane, failures]) => ({
      lane,
      count: failures.length,
      examples: [...failures]
        .sort((a, b) => a.overallScore - b.overallScore)
        .slice(0, examplesPerLane),
    }))
    .sort((a, b) => b.count - a.count);
}

// ---------------------------------------------------------------------------
// Judge plumbing
// ---------------------------------------------------------------------------

export interface TranscriptTurn {
  userMessage: string;
  aiResponse: string;
  toolsUsed: string[];
  hadError: boolean;
  responseTime: number | null;
  createdAt: string; // ISO 8601 — kept JSON-serializable for EvalCase.transcript
}

const judgementSchema = z.object({
  resolved: z.boolean(),
  grounded: z.boolean(),
  toolSuccess: z.boolean(),
  noDeflection: z.boolean(),
  overallScore: z.number().int().min(0).max(100),
  failureLane: z.enum(FAILURE_LANES).nullable(),
  reasoning: z.string(),
  expectation: z.string().nullable(),
});

export type Judgement = z.infer<typeof judgementSchema>;

const JUDGE_SYSTEM_PROMPT = `You are a quality judge for "Zoe", the AI assistant of Exponential (a task/project management product). You are given the full transcript of one Thread — a multi-turn exchange between a user and Zoe — including, per turn, the tools Zoe invoked and whether a tool errored.

Zoe's contract (judge against THIS, not generic chatbot virtues):
1. GROUNDED — Zoe must call a tool for any fact about the user's data (actions, tasks, projects, goals, schedule) and for any action taken on it. She must NEVER fabricate or guess such facts. Stating user-data facts in a turn with no tools invoked is a grounding failure (hallucination).
2. NO DEFLECTION — Exponential IS the user's task manager. Zoe must never tell the user to "check your list", "open your task manager", or look things up themselves — she can fetch it all. Punting the user elsewhere is a deflection failure.
3. TOOL SUCCESS — the tools she invoked must have returned rather than errored (turns are annotated with hadError and tool errors).
4. RESOLVED — across the whole Thread, did the user get what they came for?

Latency is measured separately; do NOT judge it.

You can only see the transcript ("apparent quality"): you cannot verify that a created Action was the right one — judge what is visible.

Scoring:
- Mark each axis true/false.
- overallScore 0-100, holistic across the four axes (a Thread that fails GROUNDED or deflects should score low even if pleasant).
- If the Thread passes overall, set failureLane to null and expectation to null.
- If it fails, pick exactly one failureLane by OWNER OF THE FIX:
  - "code_bug" — a tool errored or clearly misbehaved (e.g. HTTP errors, hadError turns central to the failure): the fix is server code.
  - "agent_behaviour" — Zoe fabricated, deflected, mis-resolved a reference, or otherwise violated her contract while the tools worked: the fix is a prompt/instruction change.
  - "capability_gap" — the user asked for something no tool covers; Zoe handled it as well as possible: the fix is a product feature, not a bug.
- When failing, also state the single violated contract expectation as a short imperative sentence usable as an eval assertion (e.g. "must call a tool before stating which actions are due", "must not tell the user to check their own list").

Record your judgement with the record_judgement tool.`;

const JUDGE_TOOL: Anthropic.Tool = {
  name: "record_judgement",
  description: "Record the final judgement for this Thread.",
  input_schema: {
    type: "object",
    properties: {
      resolved: {
        type: "boolean",
        description: "Did the user get what they came for?",
      },
      grounded: {
        type: "boolean",
        description: "Were all user-data facts/actions backed by tool calls?",
      },
      toolSuccess: {
        type: "boolean",
        description: "Did the invoked tools return without errors?",
      },
      noDeflection: {
        type: "boolean",
        description: "Did Zoe avoid punting the user to check things themselves?",
      },
      overallScore: {
        type: "integer",
        minimum: 0,
        maximum: 100,
        description: "Holistic 0-100 score across the four axes.",
      },
      failureLane: {
        type: ["string", "null"],
        enum: [...FAILURE_LANES, null],
        description: "Owner-of-the-fix lane, or null when the Thread passes.",
      },
      reasoning: {
        type: "string",
        description: "Concise explanation of the judgement.",
      },
      expectation: {
        type: ["string", "null"],
        description:
          "When failing: the violated contract expectation as a short imperative sentence. Null when passing.",
      },
    },
    required: [
      "resolved",
      "grounded",
      "toolSuccess",
      "noDeflection",
      "overallScore",
      "failureLane",
      "reasoning",
      "expectation",
    ],
  },
};

/** Render the transcript for the judge. */
export function formatTranscriptForJudge(turns: TranscriptTurn[]): string {
  return turns
    .map((turn, i) => {
      const tools =
        turn.toolsUsed.length > 0 ? turn.toolsUsed.join(", ") : "(none)";
      return [
        `--- Turn ${i + 1} (${turn.createdAt}) ---`,
        `USER: ${turn.userMessage}`,
        `ZOE: ${turn.aiResponse}`,
        `TOOLS INVOKED: ${tools}`,
        `TURN ERRORED: ${turn.hadError ? "yes" : "no"}`,
      ].join("\n");
    })
    .join("\n\n");
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export interface ScoreThreadResult extends ScoredThreadSummary {
  judgement: Judgement;
  turnCount: number;
}

export interface ScoreBacklogOptions {
  /** Max Threads to judge in this run (default: unbounded). */
  limit?: number;
  /** Called after each Thread is judged (for CLI progress logging). */
  onProgress?: (done: number, total: number, result: ScoreThreadResult) => void;
  now?: Date;
}

export class AgentEvalService {
  private anthropicClient: Anthropic | null;

  constructor(
    private db: PrismaClient,
    anthropic?: Anthropic,
  ) {
    this.anthropicClient = anthropic ?? null;
  }

  private get anthropic(): Anthropic {
    // Lazy: lets the service be constructed (e.g. to list settled Threads)
    // without ANTHROPIC_API_KEY; the key is only required to judge.
    this.anthropicClient ??= new Anthropic();
    return this.anthropicClient;
  }

  /**
   * Distinct settled, in-scope, not-yet-scored conversationIds, oldest first.
   */
  async findSettledThreadIds(now: Date = new Date()): Promise<string[]> {
    const groups = await this.db.aiInteractionHistory.groupBy({
      by: ["conversationId"],
      where: {
        conversationId: { not: null },
        platform: { in: [...BRAIN_REASONED_PLATFORMS] },
      },
      _max: { createdAt: true },
      orderBy: { _max: { createdAt: "asc" } },
    });

    const candidates = groups.flatMap((group) => {
      const conversationId = group.conversationId;
      const lastTurnAt = group._max.createdAt;
      if (conversationId === null || lastTurnAt === null) return [];
      if (isIosPerpetualThread(conversationId)) return [];
      if (!isSettled(lastTurnAt, now)) return [];
      return [conversationId];
    });
    if (candidates.length === 0) return [];

    const alreadyScored = new Set(
      (
        await this.db.threadScore.findMany({
          where: { conversationId: { in: candidates } },
          select: { conversationId: true },
        })
      ).map((score) => score.conversationId),
    );
    return candidates.filter((id) => !alreadyScored.has(id));
  }

  /** Reconstruct the ordered brain-reasoned transcript for one Thread. */
  async reconstructThread(conversationId: string) {
    const rows = await this.db.aiInteractionHistory.findMany({
      where: {
        conversationId,
        platform: { in: [...BRAIN_REASONED_PLATFORMS] },
      },
      orderBy: { createdAt: "asc" },
      select: {
        userMessage: true,
        aiResponse: true,
        toolsUsed: true,
        hadError: true,
        responseTime: true,
        createdAt: true,
        systemUserId: true,
        agentId: true,
      },
    });
    if (rows.length === 0) return null;

    const turns: TranscriptTurn[] = rows.map((row) => ({
      userMessage: row.userMessage,
      aiResponse: row.aiResponse,
      toolsUsed: row.toolsUsed,
      hadError: row.hadError,
      responseTime: row.responseTime,
      createdAt: row.createdAt.toISOString(),
    }));

    const responseTimes = rows
      .map((row) => row.responseTime)
      .filter((ms): ms is number => ms !== null);
    const avgResponseTime =
      responseTimes.length > 0
        ? Math.round(
            responseTimes.reduce((sum, ms) => sum + ms, 0) /
              responseTimes.length,
          )
        : null;

    return {
      turns,
      userId: rows.find((row) => row.systemUserId !== null)?.systemUserId ?? null,
      agentId: rows.find((row) => row.agentId !== null)?.agentId ?? null,
      firstTurnAt: rows[0]!.createdAt,
      lastTurnAt: rows[rows.length - 1]!.createdAt,
      avgResponseTime,
    };
  }

  /** Judge one transcript with Haiku 4.5 via forced tool use. */
  async judgeTranscript(turns: TranscriptTurn[]): Promise<Judgement> {
    const response = await this.anthropic.messages.create({
      model: JUDGE_MODEL,
      max_tokens: 1024,
      system: JUDGE_SYSTEM_PROMPT,
      tools: [JUDGE_TOOL],
      tool_choice: { type: "tool", name: "record_judgement" },
      messages: [
        {
          role: "user",
          content: `Judge this Thread against Zoe's contract.\n\n${formatTranscriptForJudge(turns)}`,
        },
      ],
    });

    const toolUse = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
    );
    if (!toolUse) {
      throw new Error(
        `Judge returned no tool_use block (stop_reason: ${response.stop_reason})`,
      );
    }
    return judgementSchema.parse(toolUse.input);
  }

  /**
   * Judge one Thread and persist ThreadScore (+ EvalCase on failure).
   * Returns null when the Thread has no in-scope turns or is already scored.
   */
  async scoreThread(conversationId: string): Promise<ScoreThreadResult | null> {
    const existing = await this.db.threadScore.findUnique({
      where: { conversationId },
      select: { id: true },
    });
    if (existing) return null;

    const thread = await this.reconstructThread(conversationId);
    if (!thread) return null;

    const judgement = await this.judgeTranscript(thread.turns);
    const failing = judgement.failureLane !== null;

    await this.db.threadScore.create({
      data: {
        conversationId,
        userId: thread.userId,
        agentId: thread.agentId,
        resolved: judgement.resolved,
        grounded: judgement.grounded,
        toolSuccess: judgement.toolSuccess,
        noDeflection: judgement.noDeflection,
        overallScore: judgement.overallScore,
        failureLane: judgement.failureLane,
        judgeModel: JUDGE_MODEL,
        judgeVersion: JUDGE_VERSION,
        reasoning: judgement.reasoning,
        turnCount: thread.turns.length,
        firstTurnAt: thread.firstTurnAt,
        lastTurnAt: thread.lastTurnAt,
        avgResponseTime: thread.avgResponseTime,
        ...(failing
          ? {
              evalCase: {
                create: {
                  conversationId,
                  transcript: thread.turns as unknown as Prisma.InputJsonValue,
                  expectation:
                    judgement.expectation ??
                    "must satisfy Zoe's contract (judge gave no specific expectation)",
                  lane: judgement.failureLane!,
                },
              },
            }
          : {}),
      },
    });

    return {
      conversationId,
      overallScore: judgement.overallScore,
      failureLane: judgement.failureLane,
      reasoning: judgement.reasoning,
      expectation: judgement.expectation,
      judgement,
      turnCount: thread.turns.length,
    };
  }

  /**
   * Drain the settled-Thread backlog sequentially. Idempotent — re-running
   * skips everything already in ThreadScore.
   */
  async scoreBacklog(
    options: ScoreBacklogOptions = {},
  ): Promise<ScoreThreadResult[]> {
    const ids = await this.findSettledThreadIds(options.now ?? new Date());
    const queue =
      options.limit !== undefined ? ids.slice(0, options.limit) : ids;

    const results: ScoreThreadResult[] = [];
    for (const conversationId of queue) {
      const result = await this.scoreThread(conversationId);
      if (result) {
        results.push(result);
        options.onProgress?.(results.length, queue.length, result);
      }
    }
    return results;
  }
}
