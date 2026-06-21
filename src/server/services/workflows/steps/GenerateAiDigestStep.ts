import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";

import { type IStepExecutor, type StepContext } from "./IStepExecutor";
import { type GitHubCommit } from "./FetchGitHubCommitsStep";
import { groupUserFacingForDigest } from "~/lib/changelog/commitCategories";

/**
 * `generate_ai_digest` — renders the body of a "What Shipped Today" Broadcast
 * (CONTEXT.md → What Shipped Today). Deterministic-gather → one LLM call, the
 * ADR-0018 pattern: the user-facing commits are grouped *in code*
 * (`groupUserFacingForDigest`) and the model may only narrate that bundle — so
 * it cannot invent features that didn't ship.
 *
 * A window with no user-facing changes returns `{ skip: true }` and no body, so
 * the downstream send step no-ops (no empty "no activity" email).
 *
 * It produces the structured + prose digest only; turning it into a sent email
 * (template + unsubscribe link) is the send step's concern.
 */
const DIGEST_SYSTEM_PROMPT = `You write a short, friendly "what we shipped" update for users (not developers).

Rules:
- Summarise ONLY the changes provided. Never invent or infer features that are not listed.
- Group the narrative by the provided sections (Features, Fixes, etc.), in the given order.
- Keep it concise and benefit-oriented — what it means for the user, not how it was built.
- Plain prose with short headings. No preamble, no sign-off.`;

interface DigestBundleSection {
  category: string;
  items: string[];
}

export class GenerateAiDigestStep implements IStepExecutor {
  type = "generate_ai_digest";
  label = "Summarise commits into a changelog digest";

  async execute(
    input: Record<string, unknown>,
    config: Record<string, unknown>,
    _context: StepContext,
  ): Promise<Record<string, unknown>> {
    const commits = (input.commits ?? []) as GitHubCommit[];
    const sections = groupUserFacingForDigest(commits);

    // Nothing user-facing shipped — signal a skip so the send step no-ops.
    if (sections.length === 0) {
      return {
        skip: true,
        skipReason: "no user-facing changes in window",
        digest: null,
      };
    }

    const bundle: DigestBundleSection[] = sections.map((s) => ({
      category: s.meta.label,
      items: s.items.map((i) => i.text),
    }));

    const model = new ChatOpenAI({
      modelName: (config.modelName as string) ?? "gpt-4o-mini",
      temperature: 0.3,
      // Bound output cost — a digest is a few short paragraphs, never long.
      maxTokens: 1500,
    });

    const response = await model.invoke([
      new SystemMessage(DIGEST_SYSTEM_PROMPT),
      new HumanMessage(
        `Summarise the changes shipped in this window:\n\n${JSON.stringify(
          bundle,
          null,
          2,
        )}`,
      ),
    ]);

    const summary =
      typeof response.content === "string"
        ? response.content
        : JSON.stringify(response.content);

    return {
      skip: false,
      digest: {
        subject:
          (typeof config.subject === "string" && config.subject) ||
          "What Shipped Today",
        // AI prose narrative (bounded to the bundle below).
        summary,
        // Deterministic structure for the send step to render against.
        sections: bundle,
      },
    };
  }
}
