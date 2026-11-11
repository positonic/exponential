/**
 * Lazily built LLM clients. Nothing constructs a model client at module scope:
 * the `openai` SDK throws in its constructor without a key, so a module-scope
 * client turns "no OPENAI_API_KEY" into a 500 on every route that imports it
 * (and a failed `next build`). `src/server/services/ai/__tests__/noModuleScopeLlmClients.test.ts`
 * fails if one reappears.
 */

import OpenAI from "openai";
import { requireAi } from "./requireAi";

let openaiClient: OpenAI | null = null;

/**
 * The shared OpenAI client. Throws `AiNotConfiguredError` (PRECONDITION_FAILED)
 * when `OPENAI_API_KEY` is unset, naming `feature` in the message.
 */
export function getOpenAIClient(feature?: string): OpenAI {
  requireAi("openai", feature);
  return (openaiClient ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY }));
}
