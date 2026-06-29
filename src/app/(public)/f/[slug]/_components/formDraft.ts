/**
 * Client-only persistence for a public form's in-progress answers — the **Form
 * draft** (CONTEXT.md ### Forms). Stored in `localStorage` under
 * `expo:form-draft:{slug}` as `{ values, savedAt }`, so a refresh or closed tab
 * never loses work. Never sent to the server — the careful server PII posture
 * (ADR-0029) is unchanged; the draft inverts it locally, on the applicant's own
 * device only. Self-expires after a 7-day TTL.
 */

const KEY_PREFIX = 'expo:form-draft:';
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface StoredDraft {
  values: Record<string, unknown>;
  savedAt: number;
}

function keyFor(slug: string): string {
  return `${KEY_PREFIX}${slug}`;
}

function hasContent(values: Record<string, unknown>): boolean {
  return Object.values(values).some((v) => v !== '' && v !== false && v != null);
}

/**
 * Returns the saved answers for a slug, or `null` when there is nothing useful
 * to restore (missing, malformed, empty, or older than the TTL). Expired or
 * malformed entries are cleared as a side effect.
 */
export function loadDraft(slug: string): Record<string, unknown> | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(keyFor(slug));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredDraft> | null;
    const values = parsed?.values;
    const savedAt = parsed?.savedAt;
    if (
      typeof savedAt !== 'number' ||
      typeof values !== 'object' ||
      values === null
    ) {
      clearDraft(slug);
      return null;
    }
    if (Date.now() - savedAt > TTL_MS) {
      clearDraft(slug);
      return null;
    }
    return hasContent(values) ? values : null;
  } catch {
    // Corrupt/unreadable entry — drop it so it doesn't linger.
    clearDraft(slug);
    return null;
  }
}

/**
 * Persists the current answers. Writing empty answers clears the draft instead,
 * so a wiped form doesn't leave a stale entry behind. Best-effort: a full or
 * unavailable `localStorage` is swallowed.
 */
export function saveDraft(slug: string, values: Record<string, unknown>): void {
  if (typeof window === 'undefined') return;
  try {
    if (!hasContent(values)) {
      clearDraft(slug);
      return;
    }
    const payload: StoredDraft = { values, savedAt: Date.now() };
    window.localStorage.setItem(keyFor(slug), JSON.stringify(payload));
  } catch {
    // localStorage unavailable or over quota — the draft is best-effort.
  }
}

export function clearDraft(slug: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(keyFor(slug));
  } catch {
    // ignore
  }
}
