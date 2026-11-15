/**
 * Reads what a Mastra `generate` result says a turn used: the model that
 * answered, the turn's summed usage and each model step's own usage, and
 * whether it ran on the workspace's own Anthropic key. Pure and defensive:
 * the result crosses the network as JSON, so every field is treated as
 * unknown.
 */

function field(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>)[key] : undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * How Mastra says a model call ran on the workspace's own key: it stamps
 * `providerMetadata.ownKey.used = true` on the result (its model wrapper does
 * this only for the model built from the workspace's key). The app never
 * infers this from "the workspace has a key saved": a turn that fell back to
 * the hosted key, or ran before Mastra could use keys at all, must stay
 * counted. Absent or anything but `true` means the hosted key.
 */
export const OWN_KEY_METADATA_NAMESPACE = "ownKey";

/**
 * True when `source` says the call ran on the workspace's own key. Accepts a
 * `generate` result or one of its steps (`providerMetadata` on the object)
 * and a stream chunk's payload (`metadata.providerMetadata`).
 */
export function readUsedOwnKey(source: unknown): boolean {
  const providerMetadata =
    field(source, "providerMetadata") ?? field(field(source, "metadata"), "providerMetadata");
  return field(field(providerMetadata, OWN_KEY_METADATA_NAMESPACE), "used") === true;
}

export interface GenerateUsage {
  /** The model Mastra names on the result or its last step; undefined when it names none. */
  modelId: string | undefined;
  /** The turn's summed usage (`usage`; older builds called it `tokenUsage`). */
  turnUsage: unknown;
  /** Each step's own usage, in order. Empty when the result carries no steps. */
  stepUsages: unknown[];
  /**
   * The turn ran on the workspace's own key: recorded, never counted. Read
   * from the result, which describes how the turn ended, so a turn that fell
   * back to the hosted key part-way is counted.
   */
  onOwnKey: boolean;
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
    onOwnKey: readUsedOwnKey(output),
  };
}
