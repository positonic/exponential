/**
 * Reads what a Mastra `generate` result says a turn used: the model that
 * answered, the turn's summed usage and each model step's own usage. Pure and
 * defensive: the result crosses the network as JSON, so every field is
 * treated as unknown.
 */

function field(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>)[key] : undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export interface GenerateUsage {
  /** The model Mastra names on the result or its last step; undefined when it names none. */
  modelId: string | undefined;
  /** The turn's summed usage (`usage`; older builds called it `tokenUsage`). */
  turnUsage: unknown;
  /** Each step's own usage, in order. Empty when the result carries no steps. */
  stepUsages: unknown[];
}

export function readGenerateUsage(output: unknown): GenerateUsage {
  const rawSteps = field(output, "steps");
  const steps: unknown[] = Array.isArray(rawSteps) ? rawSteps : [];
  const lastStep = steps[steps.length - 1];
  return {
    modelId:
      text(field(field(output, "response"), "modelId")) ??
      text(field(field(lastStep, "response"), "modelId")) ??
      text(field(output, "model")),
    turnUsage: field(output, "usage") ?? field(output, "tokenUsage"),
    stepUsages: steps.map((step) => field(step, "usage")).filter((usage) => usage !== undefined),
  };
}
