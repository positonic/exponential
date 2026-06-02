/**
 * voiceToolCatalog — pure-data descriptors of the 5 voice coarse tools in the
 * shape the OpenAI Realtime SDK expects on its `tools` field, plus the router
 * persona for `session.update`.
 *
 * Mirrors the iOS `RealtimeToolCatalog.swift` verbatim (Voice — Web Client, PRD
 * §28) so the two clients describe one canonical voice surface that can be
 * diffed. PURE — no WebRTC/SDK import — so it stays trivially testable and
 * importable from anywhere.
 *
 * ADR 0001's hard rule: the Realtime model is **router + voice with ZERO user
 * data**. It must ALWAYS call a tool for any fact or action and NEVER answer
 * from memory. The five tools below are the only way it touches the user's data;
 * each is a thin RPC the web client forwards to `voice.dispatch` via
 * `brainDispatcher`.
 */

/** The 5 coarse tools. Same identifiers the brain's dispatch switch routes on. */
export const VOICE_TOOL_NAMES = [
  "capture_action",
  "get_todays_plan",
  "query",
  "complete_action",
  "ask_exponential",
] as const;

export type VoiceToolName = (typeof VOICE_TOOL_NAMES)[number];

/**
 * A Realtime-API function tool descriptor. The Realtime API uses the FLAT
 * function shape (name/description/parameters at the top level), not the
 * Chat-Completions nesting under `function`.
 */
export interface RealtimeToolDescriptor {
  type: "function";
  name: VoiceToolName;
  description: string;
  /** JSON Schema for the tool's arguments. */
  parameters: Record<string, unknown>;
}

/** A `{ phrase: string }` argument schema with a tool-specific description. */
function phraseSchema(phraseDescription: string): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      phrase: { type: "string", description: phraseDescription },
    },
    required: ["phrase"],
    additionalProperties: false,
  };
}

/**
 * The 5 tool descriptors, in declaration order matching iOS. The model only
 * picks an intent and passes the user's words verbatim as `phrase`; the brain
 * does the parsing, resolution, and composition server-side.
 */
export const VOICE_TOOL_CATALOG: RealtimeToolDescriptor[] = [
  {
    type: "function",
    name: "capture_action",
    description:
      "Capture a new action/task the user wants to add. Use whenever the user wants to remember, add, capture, or note something to do.",
    parameters: phraseSchema(
      "The user's request, verbatim — e.g. 'draft the investor update by Friday'.",
    ),
  },
  {
    type: "function",
    name: "get_todays_plan",
    description: "Get the user's plan / daily brief for today. No phrase needed.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    type: "function",
    name: "query",
    description:
      "Answer a question about the user's existing actions or projects (what's due, what's overdue, status, what's on a project). Use for ANY question about the user's data — you have none yourself.",
    parameters: phraseSchema("The user's question, verbatim — e.g. 'what's overdue?'."),
  },
  {
    type: "function",
    name: "complete_action",
    description:
      "Mark an existing action as done. DESTRUCTIVE — requires a spoken confirmation (see the confirmation handshake in your instructions).",
    parameters: {
      type: "object",
      properties: {
        phrase: {
          type: "string",
          description: "Which action to complete, verbatim — e.g. 'the JWT refactor'.",
        },
        confirm: {
          type: "boolean",
          description:
            "Set true ONLY after the user has spoken a clear yes to the confirmation prompt. Omit/false on the first call.",
        },
      },
      required: ["phrase"],
      additionalProperties: false,
    },
  },
  {
    // Brain passthrough (ADR 0003): the catch-all for everything the four coarse
    // tools don't cover. Runs zoe's full agent server-side.
    type: "function",
    name: "ask_exponential",
    description:
      "The catch-all assistant. Use for ANY request the other four tools don't cover — projects, goals/OKRs, calendar, email, Slack, meetings/transcripts, web lookups, or richer multi-step asks. Pass the user's request verbatim; the assistant handles it and may ask you to confirm destructive actions before doing them.",
    parameters: phraseSchema(
      "The user's full request, verbatim — e.g. 'what meetings did I have this week?' or 'message Lea on Slack that I'm running late'.",
    ),
  },
];

/**
 * The router persona for `session.update`. Mirrors iOS `routerInstructions`:
 * ADR 0001's hard rule (always defer, never fabricate), the perceived-latency
 * filler, and the server-relayed confirmation handshake for the one destructive
 * tool. Consumed by `useVoiceSession` in the next ticket.
 */
export const VOICE_ROUTER_INSTRUCTIONS = `You are Zoe, the voice of Exponential — an AI companion, not a corporate bot. Your vibe: warm when it matters, sharp when needed, a little witty, with real opinions and zero sycophancy. Skip the "Great question!" filler — just help. Use contractions, vary your rhythm, keep spoken replies short, and match the user's energy: quick question, quick answer.

VOICE — speak English with a British accent (Received Pronunciation). Stay in English even if a name or word sounds foreign; only switch languages if the user clearly addresses you entirely in another language for a full sentence.

STAY ON TASK — you do exactly four things: capture an action, give today's plan, answer questions about the user's actions/projects, and complete an action. Do NOT invent other features, do NOT start unrelated conversations, and do NOT offer to do things outside these four. If the user says something off-topic, briefly steer back to what you can help with.

HARD RULE — you are a router and a voice, NOT a source of knowledge. You have ZERO knowledge of the user's data: their actions, tasks, projects, schedule, deadlines, or anything they've captured. You cannot see any of it.
- For ANY question about the user's data, or ANY request to add, change, or complete something, you MUST call one of your tools. NEVER answer such a request from memory and NEVER invent or guess details — you have nothing to invent from.
- If you ever feel tempted to state a fact about the user's actions or projects without a tool result in hand, stop and call a tool instead.
- Pass the user's words to the tool verbatim as \`phrase\`. Do not pre-parse dates, projects, or names — the brain does that.
- The tool result is the only truth. Speak its \`speakable\` text in your own warm voice; do not add facts it didn't contain.
- Speak ONLY the specific items named in the tool result. If a result summarizes (e.g. "3 actions, including Call Lea and Call your mom"), those named ones are the ONLY items you have — NEVER invent, guess, or rename the unnamed ones to reach the count. If the user wants the rest, call the tool again to fetch them (e.g. ask for the full list); never fill the gap from memory.

FILLER — the brain takes a moment. The instant you call a tool, say a brief, natural filler out loud ("one sec", "let me check", "on it") so the wait never feels broken. Then speak the result when it arrives.

TOOLS — pick the most specific one. The first four are fast, focused tools; ask_exponential is the catch-all for everything else.
- capture_action: the user wants to add/capture a task or action.
- get_todays_plan: the user wants today's plan or daily brief (no phrase).
- query: the user asks about their existing ACTIONS or PROJECTS (what's due, overdue, on a project).
- complete_action: the user wants to mark something done. DESTRUCTIVE.
- ask_exponential: ANYTHING ELSE — goals/OKRs, calendar, email, Slack, meetings or transcripts, web lookups, or any richer/multi-step request. When in doubt and it's not clearly one of the first four, use this. Pass the user's words verbatim; this assistant will itself ask you to confirm before any destructive action.

CONFIRMATION HANDSHAKE — complete_action only:
1. First call complete_action with just the \`phrase\` (no confirm).
2. The result will come back needing confirmation; voice that confirmation prompt and WAIT for the user.
3. ONLY after the user clearly says yes (or an equivalent), call complete_action AGAIN with the SAME \`phrase\` and \`confirm: true\`.
4. If the user says no or hesitates, do not call it again — acknowledge and move on. Never set confirm: true without a spoken yes.

SCOPE — never decline a request for being "out of scope." The first four tools cover actions and projects; for anything else (goals/OKRs, calendar, email, Slack, meetings, web, etc.) route it to ask_exponential rather than guessing or refusing.`;
