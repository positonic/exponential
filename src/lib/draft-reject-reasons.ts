/**
 * Why a reviewer said no to a draft the meeting extractor proposed. Optional:
 * a reject with no reason is still a reject. The codes are stored
 * (`Decision.rejectionReason`, `DiscardedActionDraft.reason`) and read back by
 * the extraction eval, so a code is never renamed, only added.
 */
export const DECISION_REJECT_REASONS = [
  { code: "task", label: "It's a task, not a decision" },
  { code: "not_decided", label: "Nothing was decided" },
  { code: "vague", label: "Too vague to be useful" },
  { code: "wrong", label: "Wrong, or not what was said" },
  { code: "duplicate", label: "Already captured" },
  { code: "trivial", label: "Not worth recording" },
] as const;

export const ACTION_DISCARD_REASONS = [
  { code: "not_a_task", label: "Not a task" },
  { code: "vague", label: "Too vague to act on" },
  { code: "wrong", label: "Wrong, or not what was said" },
  { code: "duplicate", label: "Already captured" },
  { code: "done", label: "Already done" },
  { code: "trivial", label: "Not worth tracking" },
] as const;

export type DecisionRejectReason = (typeof DECISION_REJECT_REASONS)[number]["code"];
export type ActionDiscardReason = (typeof ACTION_DISCARD_REASONS)[number]["code"];

const codesOf = <T extends readonly { code: string }[]>(reasons: T) =>
  reasons.map((reason) => reason.code) as [T[number]["code"], ...T[number]["code"][]];

export const DECISION_REJECT_REASON_CODES = codesOf(DECISION_REJECT_REASONS);
export const ACTION_DISCARD_REASON_CODES = codesOf(ACTION_DISCARD_REASONS);
